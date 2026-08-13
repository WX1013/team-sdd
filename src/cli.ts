#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, Option } from 'commander';
import type { ProjectExecutionStrategy } from './config/project-config.js';
import { designImpacts, parseDeliveryId, type DeliveryMetadata } from './domain/types.js';
import { createAgentContextService } from './workflow/agent-context-service.js';
import { defaultCapabilities } from './runtime/capabilities.js';
import { planProgress } from './runtime/plan-progress.js';
import { getSkillDefinition } from './skills/registry.js';
import { createSddService } from './workflow/service.js';
import { createProjectAgentInstaller, installCurrentPackage, parseAgentSelection, registerCodexProjectMarketplace, type ProjectAgentInstaller } from './agents/index.js';

export type CliResult = { exitCode: number; stdout: string; stderr: string };
export type CliDependencies = {
  projectAgentInstaller?: ProjectAgentInstaller;
  installCurrentPackage?: typeof installCurrentPackage;
  registerCodexProjectMarketplace?: typeof registerCodexProjectMarketplace;
  packageManifest?: { name: string; version: string };
};

function displayState(state: string): string {
  return state.charAt(0) + state.slice(1).toLowerCase().replaceAll('_', ' ');
}

function displayFindings(
  blockedProgression: string,
  findings: ReadonlyArray<{ code: string; message: string; nextStep: string }>,
): string {
  const issueLabel = findings.length === 1 ? 'issue needs' : 'issues need';
  const repairs = findings
    .map((finding, index) => `${index + 1}. [${finding.code}] ${finding.message}\n   → ${finding.nextStep}`)
    .join('\n\n');
  return `${blockedProgression}\n\n${findings.length} ${issueLabel} attention:\n\n${repairs}`;
}

function displayWorkflow(delivery: DeliveryMetadata): string {
  const states = ['REQUIREMENT', 'DESIGN', 'SPEC', 'EXECUTION', 'CHECK', 'DONE'] as const;
  const activeIndex = states.indexOf(delivery.state);
  return states
    .map((state, index) => `${displayState(state).padEnd(12)} ${index < activeIndex || delivery.state === 'DONE' ? '✓' : index === activeIndex ? '●' : '○'}`)
    .join('\n');
}

function displaySpecPacks(delivery: DeliveryMetadata): string {
  if (delivery.specs.length === 0) return 'No Spec Packs';
  return delivery.specs
    .map((spec) => `${spec.id} ${spec.title} · ${displayState(spec.state)}`)
    .join('\n');
}

async function displayActivePlanProgress(root: string, delivery: DeliveryMetadata, activity: string): Promise<string | undefined> {
  const active = delivery.specs.find((spec) => spec.state !== 'DONE');
  if (!active || !['PLAN', 'CODE', 'CHECK'].includes(activity)) return undefined;
  try {
    const plan = await readFile(join(root, 'sdd', 'deliveries', delivery.id, 'specs', active.id, 'plan.md'), 'utf8');
    const progress = planProgress(plan);
    return `Plan\n────────────────────\n${progress.completed} / ${progress.total} tasks`;
  } catch {
    return undefined;
  }
}

function displayConfig(config: { version: number; execution: { strategy: string } }): string {
  return `version: ${config.version}\nexecution.strategy: ${config.execution.strategy}`;
}

function parseExecutionStrategy(input: string): ProjectExecutionStrategy {
  if (input === 'auto' || input === 'inline' || input === 'subagent') return input;
  throw new Error('Strategy must be one of: auto, inline, subagent');
}

function parseDesignImpacts(input: readonly string[]): (typeof designImpacts)[number][] {
  if (input.some((impact) => !(designImpacts as readonly string[]).includes(impact))) {
    throw new Error(`Unsupported Design impact. Use one of: ${designImpacts.join(', ')}`);
  }
  return [...input] as (typeof designImpacts)[number][];
}

function writeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function runCli(args: string[], root = process.cwd(), dependencies: CliDependencies = {}): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  const service = createSddService({ root });
  const agentContextService = createAgentContextService(service);
  const projectAgentInstaller = dependencies.projectAgentInstaller ?? createProjectAgentInstaller();
  const packageManifest = dependencies.packageManifest ?? { name: '@zbp/sdd', version: '0.1.1' };
  const program = new Command();
  program.name('sdd').exitOverride().configureOutput({
    writeOut: (value) => { stdout += value; },
    writeErr: (value) => { stderr += value; },
  });

  async function synchronizeAgents(options: { agents: string; install?: boolean; registerCodex?: boolean }): Promise<void> {
    const agents = parseAgentSelection(options.agents);
    if (options.registerCodex && !agents.includes('codex')) {
      throw new Error('--register-codex requires selecting codex');
    }
    if (options.install) {
      await (dependencies.installCurrentPackage ?? installCurrentPackage)({
        root,
        packageName: packageManifest.name,
        version: packageManifest.version,
      });
    }
    const result = await projectAgentInstaller.sync({ root, agents });
    if (result.installed.length > 0) stdout += `Agent files installed or updated:\n${result.installed.map((path) => `- ${path}`).join('\n')}\n`;
    if (result.unchanged.length > 0) stdout += `Agent files already current:\n${result.unchanged.map((path) => `- ${path}`).join('\n')}\n`;
    if (result.warnings.length > 0) stdout += `Agent installation warnings:\n${result.warnings.map((warning) => `- ${warning}`).join('\n')}\n`;
    if (options.registerCodex) {
      await (dependencies.registerCodexProjectMarketplace ?? registerCodexProjectMarketplace)({ root });
      stdout += 'Registered the project-local Codex plugin.\n';
    } else if (agents.includes('codex')) {
      stdout += 'Codex registration was not run. To register this project-local plugin, rerun with --register-codex.\n';
    }
  }

  program.command('init')
    .option('--agents <agents>', 'install project Agent adapters: all|claude|codex|codebuddy')
    .option('--install', 'add this exact package as a project dev dependency')
    .option('--register-codex', 'register the project-local Codex marketplace')
    .action(async (options: { agents?: string; install?: boolean; registerCodex?: boolean }) => {
    await service.init();
    stdout += 'Initialized Team SDD repository.\n';
    if (options.agents) {
      await synchronizeAgents({
        agents: options.agents,
        install: options.install,
        registerCodex: options.registerCodex,
      });
    }
  });

  const agents = program.command('agents');
  agents.command('sync')
    .requiredOption('--agents <agents>')
    .option('--register-codex')
    .action(async (options: { agents: string; registerCodex?: boolean }) => {
      await synchronizeAgents(options);
    });

  program.command('new <deliveryId>')
    .requiredOption('--title <title>')
    .requiredOption('--type <type>')
    .option('--design-required <reason>')
    .option('--design-not-required <reason>')
    .action(async (deliveryId, options) => {
      const design = options.designRequired
        ? { required: true, reason: options.designRequired }
        : options.designNotRequired
          ? { required: false, reason: options.designNotRequired }
          : undefined;
      await service.createDelivery({ id: deliveryId, title: options.title, type: options.type, design });
      stdout += `Created ${deliveryId}.\n`;
    });

  program.command('status <deliveryId>').option('--json').action(async (deliveryId, options: { json?: boolean }) => {
    const parsedDeliveryId = parseDeliveryId(deliveryId);
    if (options.json) {
      stdout += writeJson(await service.getStatus({ deliveryId: parsedDeliveryId }));
      return;
    }
    const [{ delivery }, next] = await Promise.all([
      service.getStatus({ deliveryId: parsedDeliveryId }),
      service.getNext({ deliveryId: parsedDeliveryId }),
    ]);
    const activeSpec = delivery.specs.find((spec) => spec.state !== 'DONE');
    const current = activeSpec && ['PLAN', 'CODE', 'CHECK'].includes(next.activity)
      ? `${activeSpec.id} / ${displayState(next.activity)}`
      : displayState(next.activity);
    const progress = await displayActivePlanProgress(root, delivery, next.activity);
    stdout += [
      `${delivery.id} · ${delivery.title}`,
      '',
      'Workflow',
      '────────────────────',
      displayWorkflow(delivery),
      '',
      'Spec Packs',
      '────────────────────',
      displaySpecPacks(delivery),
      '',
      'Current',
      '────────────────────',
      current,
      '',
      'Next',
      '────────────────────',
      `sdd next ${delivery.id}`,
      ...(progress ? ['', progress] : []),
      '',
    ].join('\n');
  });

  program.command('approve <deliveryId> <artifact>')
    .requiredOption('--by <name>')
    .action(async (deliveryId, artifact, options) => {
      await service.approve({ deliveryId: parseDeliveryId(deliveryId), artifact, approvedBy: options.by });
      stdout += `Approved ${artifact} for ${deliveryId}.\n`;
    });

  const design = program.command('design');
  design.command('assess <deliveryId>')
    .requiredOption('--reason <reason>')
    .option('--impact <impacts...>')
    .option('--json')
    .action(async (deliveryId, options: { reason: string; impact?: string[]; json?: boolean }) => {
      const result = await service.assessDesign({ deliveryId: parseDeliveryId(deliveryId), reason: options.reason, impacts: parseDesignImpacts(options.impact ?? []) });
      stdout += options.json ? writeJson(result) : `Design recommendation: ${result.recommendation}\nImpacts: ${result.impacts.join(', ') || 'none'}\n`;
    });
  design.command('decide <deliveryId>')
    .requiredOption('--required <required>')
    .requiredOption('--reason <reason>')
    .requiredOption('--by <name>')
    .action(async (deliveryId, options: { required: string; reason: string; by: string }) => {
      if (!['true', 'false'].includes(options.required)) throw new Error('--required must be true or false');
      await service.decideDesign({ deliveryId: parseDeliveryId(deliveryId), required: options.required === 'true', reason: options.reason, approvedBy: options.by });
      stdout += `Recorded human Design decision for ${deliveryId}.\n`;
    });

  program.command('verify [deliveryId]')
    .addOption(new Option('--hook', 'run repository Hook verification').conflicts('ci'))
    .addOption(new Option('--ci', 'run repository CI verification').conflicts('hook'))
    .option('--json')
    .action(async (deliveryId: string | undefined, options: { hook?: boolean; ci?: boolean; json?: boolean }) => {
      const mode = options.hook ? 'hook' : options.ci ? 'ci' : undefined;
      if (mode) {
        if (deliveryId) throw new Error(`${displayState(mode)} repository verification does not accept a Delivery ID`);
        const result = await service.verifyRepository({ mode });
        const label = mode === 'hook' ? 'Hook' : 'CI';
        if (result.ok) {
          stdout += options.json ? writeJson(result) : `${label} repository verification passed.\n`;
          return;
        }
        exitCode = 2;
        if (options.json) stdout += writeJson(result);
        else stderr += `${displayFindings(`${label} repository verification failed.`, result.findings)}\n`;
        return;
      }
      if (!deliveryId) throw new Error('Delivery ID is required for normal verification');
      const result = await service.verify({ deliveryId: parseDeliveryId(deliveryId) });
      if (result.ok) {
        stdout += options.json ? writeJson(result) : `Verification passed for ${deliveryId}.\n`;
        return;
      }
      exitCode = 2;
      if (options.json) stdout += writeJson(result);
      else stderr += `${displayFindings(`Cannot proceed from ${displayState(result.activity)}.`, result.findings)}\n`;
    });

  program.command('doctor')
    .option('--fix')
    .option('--json')
    .action(async (options: { fix?: boolean; json?: boolean }) => {
      const result = await service.doctor({ fix: options.fix === true });
      if (options.json) {
        stdout += writeJson(result);
        if (!result.ok) exitCode = 2;
        return;
      }
      if (result.fixes.length > 0) {
        stdout += `Fixed:\n${result.fixes.map((fix) => `- ${fix}`).join('\n')}\n`;
      }
      if (result.ok) {
        stdout += 'Doctor found no issues.\n';
        return;
      }
      exitCode = 2;
      stderr += `${displayFindings('Doctor found repository problems.', result.findings)}\n`;
    });

  program.command('inspect <deliveryId>').option('--json').action(async (deliveryId, options: { json?: boolean }) => {
    const result = await service.inspect({ deliveryId: parseDeliveryId(deliveryId) });
    if (options.json) {
      stdout += writeJson(result);
      return;
    }
    const approvals = (['requirement', 'design', 'spec'] as const)
      .map((artifact) => {
        const recorded = result.delivery.approvals[artifact];
        const status = !recorded ? 'not approved' : result.approvalsCurrent[artifact] ? 'current' : 'stale';
        return `${artifact}: ${status}`;
      })
      .join('\n');
    stdout += [
      `Inspection: ${deliveryId}`,
      '',
      'Delivery metadata',
      JSON.stringify(result.delivery, null, 2),
      '',
      `Current activity: ${displayState(result.activity)}`,
      `Active Spec: ${result.activeSpec ? `${result.activeSpec.id} / ${displayState(result.activeSpec.state)}` : 'none'}`,
      '',
      'Approval validity',
      approvals,
      '',
      'Next context',
      `Activity: ${displayState(result.next.activity)}`,
      `Required artifacts: ${result.next.requiredArtifacts.join(', ') || 'none'}`,
      '',
    ].join('\n');
    if (result.next.blockers.length > 0) {
      stdout += `${displayFindings(`Cannot proceed from ${displayState(result.next.activity)}.`, result.next.blockers)}\n`;
    }
  });

  program.command('events <deliveryId>').option('--json').action(async (deliveryId, options: { json?: boolean }) => {
    const result = await service.events({ deliveryId: parseDeliveryId(deliveryId) });
    if (options.json) {
      stdout += writeJson(result);
      return;
    }
    stdout += `Events: ${deliveryId}\n`;
    if (result.length === 0) {
      stdout += 'No events recorded.\n';
      return;
    }
    stdout += `${result.map((event, index) => `${index + 1}. ${event.type} · ${event.occurredAt}\n   ${JSON.stringify(event)}`).join('\n')}\n`;
  });

  const config = program.command('config');
  config.command('show').option('--json').action(async (options: { json?: boolean }) => {
    const result = await service.getConfig();
    stdout += options.json ? writeJson(result) : `${displayConfig(result)}\n`;
  });
  config.command('set <setting> <strategy>').option('--json').action(async (setting, strategy, options: { json?: boolean }) => {
    if (setting !== 'execution.strategy') throw new Error('Only execution.strategy can be changed');
    const updated = await service.setExecutionStrategy({ strategy: parseExecutionStrategy(strategy) });
    stdout += options.json ? writeJson(updated) : `${displayConfig(updated)}\n`;
  });

  program.command('repair <deliveryId>')
    .addOption(new Option('--apply').conflicts('dryRun'))
    .addOption(new Option('--dry-run').conflicts('apply'))
    .option('--json')
    .action(async (deliveryId, options: { apply?: boolean; dryRun?: boolean; json?: boolean }) => {
      const result = await service.repair({ deliveryId: parseDeliveryId(deliveryId), apply: options.apply === true });
      if (options.json) {
        stdout += writeJson(result);
        if (result.findings.length > 0) exitCode = 2;
        return;
      }
      stdout += `${result.applied ? 'Repair applied' : 'Repair preview'}: ${deliveryId}\n`;
      stdout += result.actions.length > 0
        ? `${result.actions.map((action) => `- ${action}`).join('\n')}\n`
        : 'No derived paths need repair.\n';
      if (result.findings.length > 0) {
        exitCode = 2;
        stderr += `${displayFindings('Repair could not complete.', result.findings)}\n`;
      }
    });

  program.command('next <deliveryId>').action(async (deliveryId) => {
    const result = await service.getNext({ deliveryId: parseDeliveryId(deliveryId) });
    stdout += `Activity: ${result.activity}\n`;
    stdout += `Provider: ${result.skillRuntime.provider}\n`;
    stdout += `Skills: ${result.skillRuntime.skills.join(', ')}\n`;
    stdout += `Adapter: ${result.skillRuntime.adapter}\n`;
    stdout += `Execution: ${result.skillRuntime.execution}\n`;
    stdout += `${result.skillRuntime.instructions.join('\n')}\n`;
    if (result.skillRuntime.blockers.length > 0) stdout += `${displayFindings('Skill runtime is blocked.', result.skillRuntime.blockers)}\n`;
    if (result.blockers.length > 0) stdout += `${displayFindings(`Cannot proceed from ${displayState(result.activity)}.`, result.blockers)}\n`;
    if (result.requiredArtifacts.length > 0) stdout += `Artifacts: ${result.requiredArtifacts.join(', ')}\n`;
  });

  const spec = program.command('spec');
  spec.command('create <deliveryId> <specId>')
    .requiredOption('--title <title>')
    .option('--depends-on <specIds...>')
    .option('--acceptance-criterion <criteria...>')
    .action(async (deliveryId, specId, options) => {
      await service.createSpecPack({
        deliveryId: parseDeliveryId(deliveryId),
        id: specId,
        title: options.title,
        dependencies: options.dependsOn,
        acceptanceCriteria: options.acceptanceCriterion,
      });
      stdout += `Created ${specId} for ${deliveryId}.\n`;
    });

  program.command('submit <deliveryId> <kind>')
    .option('--spec <specId>')
    .option('--tests <items...>')
    .option('--build <command>')
    .option('--static-check <items...>')
    .option('--integration <items...>')
    .option('--regression <items...>')
    .option('--delivery-acceptance <items...>')
    .action(async (deliveryId, kind, options) => {
      const result = await service.submitArtifact({
        deliveryId: parseDeliveryId(deliveryId),
        kind,
        specId: options.spec,
        evidence: {
          tests: options.tests,
          build: options.build,
          staticChecks: options.staticCheck,
          integration: options.integration,
          regression: options.regression,
          deliveryAcceptance: options.deliveryAcceptance,
        },
      });
      if (!result.accepted) {
        exitCode = 2;
        stderr += `${displayFindings('Submission cannot progress.', result.findings)}\n`;
        return;
      }
      stdout += `Submitted ${kind} for ${deliveryId}.\n`;
    });

  const agent = program.command('agent');
  agent.command('context <deliveryId>')
    .option('--json')
    .option('--subagents')
    .option('--skills')
    .option('--slash-commands')
    .option('--worktrees')
    .option('--mcp')
    .option('--no-shell')
    .option('--no-file-read')
    .option('--no-file-write')
    .action(async (deliveryId, options) => {
      const capabilities = {
        ...defaultCapabilities,
        subagents: Boolean(options.subagents),
        skills: Boolean(options.skills),
        slashCommands: Boolean(options.slashCommands),
        worktrees: Boolean(options.worktrees),
        mcp: Boolean(options.mcp),
        shell: options.shell !== false,
        fileRead: options.fileRead !== false,
        fileWrite: options.fileWrite !== false,
      };
      const context = await agentContextService.getContext({ deliveryId: parseDeliveryId(deliveryId), capabilities });
      stdout += options.json ? `${JSON.stringify(context, null, 2)}\n` : `${context.prompt}\n`;
    });

  const template = program.command('template');
  for (const kind of ['requirement', 'design'] as const) {
    template.command(`${kind} <deliveryId>`).action(async (deliveryId) => {
      const { delivery } = await service.getStatus({ deliveryId: parseDeliveryId(deliveryId) });
      const logicalSkill = kind === 'requirement' ? 'requirement-analysis' : 'technical-design';
      const definition = getSkillDefinition(logicalSkill);
      if (!definition) throw new Error(`No template definition for ${kind}`);
      stdout += definition.renderTemplate({ delivery });
    });
  }
  template.command('spec <deliveryId>')
    .option('--spec <specId>')
    .action(async (deliveryId, options) => {
      if (!options.spec) throw new Error('Spec template requires --spec <specId>');
      const { delivery } = await service.getStatus({ deliveryId: parseDeliveryId(deliveryId) });
      const specSummary = delivery.specs.find((spec) => spec.id === options.spec);
      if (!specSummary) throw new Error(`Spec Pack not found: ${options.spec}`);
      const definition = getSkillDefinition('spec-split');
      if (!definition) throw new Error('No template definition for spec');
      stdout += definition.renderTemplate({ delivery, spec: specSummary });
    });

  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (error) {
    exitCode = exitCode || 1;
    stderr += `${error instanceof Error ? error.message : String(error)}\n`;
  }
  return { exitCode, stdout, stderr };
}

async function main(): Promise<void> {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isCliEntrypoint()) {
  void main();
}
