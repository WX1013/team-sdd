import { constants } from 'node:fs';
import { access, lstat, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ArtifactStore, type ArtifactKind } from '../artifacts/artifact-store.js';
import { auditDelivery, auditRepository } from '../audit/repository-audit.js';
import type { AuditFinding, AuditResult } from '../audit/types.js';
import { defaultProjectConfig, readProjectConfig, writeProjectConfig, type ProjectConfig, type ProjectExecutionStrategy } from '../config/project-config.js';
import { DomainError } from '../domain/errors.js';
import { transitionDelivery } from '../domain/transitions.js';
import { parseDeliveryId, parseSpecId, type ApprovalArtifact, type DeliveryId, type DeliveryMetadata, type DeliveryType, type SpecId, type SpecSummary, type WorkflowEvent } from '../domain/types.js';
import { evaluateDesignGate, evaluateRequirementGate } from '../gates/requirements.js';
import { evaluateCheckGate, evaluatePlanGate, evaluateSpecGate } from '../gates/specs.js';
import type { GateFinding, GateResult } from '../gates/types.js';
import { inspectGitHook, installGitHook } from '../integrations/git-hook.js';
import { resolveActivity, type Activity } from '../runtime/next-context.js';
import { LocalDeliveryRepository, LocalEventRepository } from '../storage/local-repositories.js';

export type DeliveryRef = { deliveryId: DeliveryId };
export type InitInput = Record<string, never>;
export type CreateDeliveryInput = {
  id: string;
  title: string;
  type: DeliveryType;
  design?: { required: boolean; reason: string };
};
export type ApproveInput = DeliveryRef & { artifact: ApprovalArtifact; approvedBy: string };
export type CommandResult = { ok: true };
export type StatusResult = { delivery: DeliveryMetadata };
export type VerificationResult = GateResult & { activity: Activity };
export type NextResult = {
  activity: Activity;
  requiredArtifacts: string[];
  blockers: GateFinding[];
};
export type DoctorResult = { ok: boolean; findings: AuditFinding[]; fixes: readonly string[] };
export type InspectionResult = {
  delivery: DeliveryMetadata;
  activity: Activity;
  activeSpec: SpecSummary | undefined;
  next: NextResult;
  approvalsCurrent: Record<ApprovalArtifact, boolean>;
};
export type RepairResult = { applied: boolean; actions: readonly string[]; findings: AuditFinding[] };

export type SubmitArtifactInput = {
  deliveryId: DeliveryId;
  kind: ArtifactKind;
  specId?: SpecId;
  evidence?: { tests?: string[]; build?: string; staticChecks?: string[]; integration?: string[]; regression?: string[]; deliveryAcceptance?: string[] };
};

export type CreateSpecPackInput = {
  deliveryId: DeliveryId;
  id: string;
  title: string;
  dependencies?: string[];
  acceptanceCriteria?: string[];
};

export type SubmissionResult = {
  accepted: boolean;
  advanced: boolean;
  deliveryState: DeliveryMetadata['state'];
  specState?: 'READY' | 'PLAN' | 'CODE' | 'CHECK' | 'DONE';
  findings: GateFinding[];
};

export type SddService = {
  init(input?: InitInput): Promise<CommandResult>;
  createDelivery(input: CreateDeliveryInput): Promise<CommandResult>;
  createSpecPack(input: CreateSpecPackInput): Promise<CommandResult>;
  getStatus(input: DeliveryRef): Promise<StatusResult>;
  approve(input: ApproveInput): Promise<CommandResult>;
  submitArtifact(input: SubmitArtifactInput): Promise<SubmissionResult>;
  getNext(input: DeliveryRef): Promise<NextResult>;
  verify(input: DeliveryRef): Promise<VerificationResult>;
  verifyRepository(input: { mode: 'hook' | 'ci' }): Promise<AuditResult>;
  doctor(input?: { fix?: boolean }): Promise<DoctorResult>;
  inspect(input: DeliveryRef): Promise<InspectionResult>;
  events(input: DeliveryRef): Promise<WorkflowEvent[]>;
  getConfig(): Promise<ProjectConfig>;
  setExecutionStrategy(input: { strategy: ProjectExecutionStrategy }): Promise<ProjectConfig>;
  repair(input: DeliveryRef & { apply?: boolean }): Promise<RepairResult>;
};

export type ServiceDependencies = { root: string; nodeVersion?: string };

function artifactForActivity(activity: Activity, delivery: DeliveryMetadata): string[] {
  const base = join('sdd', 'deliveries', delivery.id);
  switch (activity) {
    case 'REQUIREMENT': return [join(base, 'requirement.md')];
    case 'DESIGN': return [join(base, 'design.md')];
    case 'SPEC_SPLIT': return [join(base, 'specs')];
    case 'PLAN': return [join(base, 'specs')];
    case 'CODE': return [join(base, 'specs')];
    case 'CHECK': return [join(base, 'specs')];
    case 'DONE': return [];
  }
}

export function createSddService({ root, nodeVersion = process.versions.node }: ServiceDependencies): SddService {
  const deliveries = new LocalDeliveryRepository(root);
  const events = new LocalEventRepository(root);
  const artifacts = new ArtifactStore(root);

  async function getDelivery(id: DeliveryId): Promise<DeliveryMetadata> {
    return deliveries.read(parseDeliveryId(id));
  }

  async function evaluate(delivery: DeliveryMetadata): Promise<VerificationResult> {
    const activity = resolveActivity(delivery);
    if (activity === 'REQUIREMENT') return { activity, ...(await evaluateRequirementGate({ delivery, artifacts })) };
    if (activity === 'DESIGN') return { activity, ...(await evaluateDesignGate({ delivery, artifacts })) };
    if (activity === 'SPEC_SPLIT') return { activity, ...(await evaluateSpecGate({ delivery, artifacts })) };
    const activeSpec = delivery.specs.find((spec) => spec.state !== 'DONE');
    if (activity === 'PLAN' && activeSpec) return { activity, ...(await evaluatePlanGate({ delivery, specId: activeSpec.id, artifacts })) };
    if (activity === 'CHECK' && activeSpec) return { activity, ...(await evaluateCheckGate({ delivery, specId: activeSpec.id, artifacts })) };
    if (activity === 'DONE') return { activity, ok: true };
    return {
      activity,
      ok: false,
      findings: [{
        code: 'EXECUTION_ACTION_REQUIRED',
        message: 'The active Spec Pack is in CODE and must be implemented through the selected execution runtime.',
        artifact: `${activeSpec?.id ?? 'specs'}/`,
        nextStep: 'Run the implementation logical skill and submit resulting artifacts.',
      }],
    };
  }

  function diagnosticFinding(code: string, message: string, artifact: string, nextStep: string): AuditFinding {
    return { code, message, artifact, nextStep };
  }

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async function pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async function assertRepairPathsSafe(paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      try {
        const metadata = await lstat(path);
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw new DomainError('REPAIR_PATH_UNSAFE', `Repair path must be a real directory: ${path}`);
        }
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
    }
  }

  function nextDeliveryState(delivery: DeliveryMetadata): DeliveryMetadata['state'] | undefined {
    if (delivery.state === 'REQUIREMENT') {
      return delivery.type === 'FEATURE_CHANGE' && delivery.design?.required === false ? 'SPEC' : 'DESIGN';
    }
    if (delivery.state === 'DESIGN') return 'SPEC';
    if (delivery.state === 'SPEC') return 'EXECUTION';
    if (delivery.state === 'CHECK') return 'DONE';
    return undefined;
  }

  async function advanceDelivery(delivery: DeliveryMetadata, nextState: DeliveryMetadata['state']): Promise<DeliveryMetadata> {
    const previousState = delivery.state;
    const advanced = { ...delivery, state: transitionDelivery(previousState, nextState) };
    await deliveries.save(advanced);
    await events.append({
      type: 'delivery.transitioned',
      deliveryId: advanced.id,
      occurredAt: new Date().toISOString(),
      previousState,
      nextState,
    });
    return advanced;
  }

  return {
    async init(): Promise<CommandResult> {
      await writeProjectConfig(root, defaultProjectConfig);
      const inspection = await inspectGitHook(root);
      if (inspection.findings.some(({ code }) => code === 'GIT_REPOSITORY_REQUIRED')) return { ok: true };
      const gitFailure = inspection.findings.find(({ code }) => code === 'GIT_UNAVAILABLE');
      if (gitFailure) throw new DomainError(gitFailure.code, gitFailure.message);
      await installGitHook(root);
      return { ok: true };
    },

    async createDelivery(input): Promise<CommandResult> {
      const id = parseDeliveryId(input.id);
      if (!input.title.trim()) throw new DomainError('DELIVERY_TITLE_REQUIRED', 'Delivery title is required');
      if (input.type === 'FEATURE_CHANGE' && !input.design) {
        throw new DomainError('DESIGN_DECISION_REQUIRED', 'Feature changes require an explicit design decision');
      }
      const delivery: DeliveryMetadata = {
        id,
        title: input.title.trim(),
        type: input.type,
        state: 'REQUIREMENT',
        ...(input.design ? { design: input.design } : {}),
        approvals: {},
        specs: [],
      };
      await deliveries.save(delivery);
      await events.append({ type: 'delivery.created', deliveryId: id, occurredAt: new Date().toISOString() });
      return { ok: true };
    },

    async createSpecPack(input): Promise<CommandResult> {
      const delivery = await getDelivery(input.deliveryId);
      if (delivery.state !== 'SPEC') throw new DomainError('SPEC_CREATION_NOT_ALLOWED', 'Spec Packs can only be created while Delivery state is SPEC');
      const id = parseSpecId(input.id);
      if (!input.title.trim()) throw new DomainError('SPEC_TITLE_REQUIRED', 'Spec Pack title is required');
      if (delivery.specs.some((spec) => spec.id === id)) throw new DomainError('SPEC_ID_DUPLICATE', `Spec Pack already exists: ${id}`);
      const dependencies = (input.dependencies ?? []).map(parseSpecId);
      if (dependencies.includes(id)) throw new DomainError('SPEC_SELF_DEPENDENCY', `Spec Pack cannot depend on itself: ${id}`);
      const knownIds = new Set(delivery.specs.map((spec) => spec.id));
      if (dependencies.some((dependency) => !knownIds.has(dependency))) throw new DomainError('SPEC_DEPENDENCY_UNKNOWN', 'Spec Pack dependencies must already exist');
      const acceptanceCriteria = input.acceptanceCriteria ?? [];
      if (acceptanceCriteria.some((criterion) => !/^AC-\d+$/.test(criterion))) throw new DomainError('SPEC_AC_INVALID', 'Acceptance criteria must use AC-<number> identifiers');
      const spec = { id, title: input.title.trim(), state: 'READY' as const, dependencies, acceptanceCriteria };
      const updated = { ...delivery, specs: [...delivery.specs, spec] };
      await artifacts.createSpecTemplate(delivery.id, id, acceptanceCriteria);
      await deliveries.save(updated);
      await events.append({ type: 'spec.created', deliveryId: delivery.id, occurredAt: new Date().toISOString(), metadata: { specId: id } });
      return { ok: true };
    },

    async getStatus(input): Promise<StatusResult> {
      return { delivery: await getDelivery(input.deliveryId) };
    },

    async approve(input): Promise<CommandResult> {
      const delivery = await getDelivery(input.deliveryId);
      const hash = input.artifact === 'spec'
        ? await artifacts.hashSpecSet(delivery)
        : await artifacts.hash({ deliveryId: delivery.id, kind: input.artifact });
      delivery.approvals[input.artifact] = {
        artifact: input.artifact,
        hash,
        actorType: 'human',
        approvedBy: input.approvedBy,
        approvedAt: new Date().toISOString(),
      };
      await deliveries.save(delivery);
      await events.append({ type: `${input.artifact}.approved`, deliveryId: delivery.id, occurredAt: new Date().toISOString(), metadata: { approvedBy: input.approvedBy, hash } });
      return { ok: true };
    },

    async submitArtifact(input): Promise<SubmissionResult> {
      const delivery = await getDelivery(input.deliveryId);
      if (input.kind === 'requirement' || input.kind === 'design') {
        if (input.specId) throw new DomainError('UNEXPECTED_SPEC_ID', `${input.kind} is a Delivery artifact and cannot have a Spec Pack ID`);
        const gate = input.kind === 'requirement'
          ? await evaluateRequirementGate({ delivery, artifacts })
          : await evaluateDesignGate({ delivery, artifacts });
        if (!gate.ok) return { accepted: false, advanced: false, deliveryState: delivery.state, findings: gate.findings };
        const hash = await artifacts.hash({ deliveryId: delivery.id, kind: input.kind });
        await events.append({ type: 'artifact.submitted', deliveryId: delivery.id, occurredAt: new Date().toISOString(), metadata: { kind: input.kind, hash } });
        const nextState = nextDeliveryState(delivery);
        if (!nextState) return { accepted: true, advanced: false, deliveryState: delivery.state, findings: [] };
        const advanced = await advanceDelivery(delivery, nextState);
        return { accepted: true, advanced: true, deliveryState: advanced.state, findings: [] };
      }
      if (input.kind === 'spec') {
        if (!input.specId) throw new DomainError('SPEC_ID_REQUIRED', 'Spec submission requires a Spec Pack ID');
        const hash = await artifacts.hash({ deliveryId: delivery.id, specId: input.specId, kind: 'spec' });
        await events.append({ type: 'artifact.submitted', deliveryId: delivery.id, occurredAt: new Date().toISOString(), metadata: { kind: input.kind, specId: input.specId, hash } });
        const gate = await evaluateSpecGate({ delivery, artifacts });
        if (!gate.ok) return { accepted: false, advanced: false, deliveryState: delivery.state, findings: gate.findings };
        const advanced = await advanceDelivery(delivery, 'EXECUTION');
        return { accepted: true, advanced: true, deliveryState: advanced.state, findings: [] };
      }
      if (input.kind === 'plan') {
        if (!input.specId) throw new DomainError('SPEC_ID_REQUIRED', 'Plan submission requires a Spec Pack ID');
        const spec = delivery.specs.find((candidate) => candidate.id === input.specId);
        if (!spec) throw new DomainError('SPEC_NOT_FOUND', `Spec Pack not found: ${input.specId}`);
        const gate = await evaluatePlanGate({ delivery, specId: spec.id, artifacts });
        if (!gate.ok) return { accepted: false, advanced: false, deliveryState: delivery.state, specState: spec.state, findings: gate.findings };
        const hash = await artifacts.hash({ deliveryId: delivery.id, specId: spec.id, kind: 'plan' });
        await events.append({ type: 'artifact.submitted', deliveryId: delivery.id, occurredAt: new Date().toISOString(), metadata: { kind: input.kind, specId: spec.id, hash } });
        if (spec.state !== 'READY') throw new DomainError('PLAN_SUBMISSION_NOT_ALLOWED', 'Plan can only be submitted for a READY Spec Pack');
        const progressed = { ...spec, state: 'CODE' as const };
        const updated = { ...delivery, specs: delivery.specs.map((candidate) => candidate.id === spec.id ? progressed : candidate) };
        await deliveries.save(updated);
        await events.append({ type: 'spec.transitioned', deliveryId: delivery.id, occurredAt: new Date().toISOString(), metadata: { specId: spec.id, previousState: 'READY', nextState: 'PLAN' } });
        await events.append({ type: 'spec.transitioned', deliveryId: delivery.id, occurredAt: new Date().toISOString(), metadata: { specId: spec.id, previousState: 'PLAN', nextState: 'CODE' } });
        return { accepted: true, advanced: true, deliveryState: updated.state, specState: 'CODE', findings: [] };
      }
      if (input.kind === 'check') {
        if (!input.specId) {
          if (delivery.state !== 'CHECK') throw new DomainError('DELIVERY_CHECK_NOT_ALLOWED', 'Delivery Check can only be submitted while Delivery state is CHECK');
          const hash = await artifacts.hash({ deliveryId: delivery.id, kind: 'check' });
          await events.append({ type: 'artifact.submitted', deliveryId: delivery.id, occurredAt: new Date().toISOString(), metadata: { kind: input.kind, hash } });
          const markdown = await artifacts.read({ deliveryId: delivery.id, kind: 'check' });
          const evidence = input.evidence;
          const findings: GateFinding[] = [];
          if (!markdown.includes('Requirement Coverage: 100%')) findings.push({ code: 'DELIVERY_COVERAGE_MISSING', message: 'Delivery Check must record 100% Requirement Coverage.', artifact: 'check.md', nextStep: 'Record Requirement Coverage: 100% after verification.' });
          if (!evidence?.integration?.length) findings.push({ code: 'DELIVERY_INTEGRATION_EVIDENCE_MISSING', message: 'Delivery Check requires integration evidence.', artifact: 'check.md', nextStep: 'Provide integration verification evidence.' });
          if (!evidence?.regression?.length) findings.push({ code: 'DELIVERY_REGRESSION_EVIDENCE_MISSING', message: 'Delivery Check requires regression evidence.', artifact: 'check.md', nextStep: 'Provide regression verification evidence.' });
          if (!evidence?.deliveryAcceptance?.length) findings.push({ code: 'DELIVERY_ACCEPTANCE_EVIDENCE_MISSING', message: 'Delivery Check requires delivery acceptance evidence.', artifact: 'check.md', nextStep: 'Provide delivery acceptance evidence.' });
          if (findings.length > 0) return { accepted: false, advanced: false, deliveryState: delivery.state, findings };
          const advanced = await advanceDelivery(delivery, 'DONE');
          await events.append({ type: 'delivery.completed', deliveryId: advanced.id, occurredAt: new Date().toISOString() });
          return { accepted: true, advanced: true, deliveryState: advanced.state, findings: [] };
        }
        const spec = delivery.specs.find((candidate) => candidate.id === input.specId);
        if (!spec) throw new DomainError('SPEC_NOT_FOUND', `Spec Pack not found: ${input.specId}`);
        if (spec.state !== 'CODE') throw new DomainError('CHECK_SUBMISSION_NOT_ALLOWED', 'Check can only be submitted for a CODE Spec Pack');
        const hash = await artifacts.hash({ deliveryId: delivery.id, specId: spec.id, kind: 'check' });
        await events.append({ type: 'artifact.submitted', deliveryId: delivery.id, occurredAt: new Date().toISOString(), metadata: { kind: input.kind, specId: spec.id, hash } });
        const evidence = input.evidence;
        const evidenceFindings: GateFinding[] = [];
        if (!evidence?.tests?.length) evidenceFindings.push({ code: 'CHECK_TEST_EVIDENCE_MISSING', message: 'Check requires test evidence.', artifact: `${spec.id}/check.md`, nextStep: 'Provide at least one test evidence item.' });
        if (!evidence?.build) evidenceFindings.push({ code: 'CHECK_BUILD_EVIDENCE_MISSING', message: 'Check requires build evidence.', artifact: `${spec.id}/check.md`, nextStep: 'Provide build evidence.' });
        if (!evidence?.staticChecks?.length) evidenceFindings.push({ code: 'CHECK_STATIC_EVIDENCE_MISSING', message: 'Check requires static-check evidence.', artifact: `${spec.id}/check.md`, nextStep: 'Provide static-check evidence.' });
        const gate = await evaluateCheckGate({ delivery, specId: spec.id, artifacts });
        const findings = [...(gate.ok ? [] : gate.findings), ...evidenceFindings];
        const nextSpecState = findings.length === 0 ? 'DONE' as const : 'CODE' as const;
        const updated = { ...delivery, specs: delivery.specs.map((candidate) => candidate.id === spec.id ? { ...candidate, state: nextSpecState } : candidate) };
        if (findings.length === 0) {
          await events.append({ type: 'spec.transitioned', deliveryId: updated.id, occurredAt: new Date().toISOString(), metadata: { specId: spec.id, previousState: 'CODE', nextState: 'CHECK' } });
          await events.append({ type: 'spec.transitioned', deliveryId: updated.id, occurredAt: new Date().toISOString(), metadata: { specId: spec.id, previousState: 'CHECK', nextState: 'DONE' } });
        }
        if (findings.length === 0 && updated.specs.every((candidate) => candidate.state === 'DONE')) {
          updated.state = transitionDelivery(updated.state, 'CHECK');
          await events.append({ type: 'delivery.transitioned', deliveryId: updated.id, occurredAt: new Date().toISOString(), previousState: 'EXECUTION', nextState: 'CHECK' });
        }
        await deliveries.save(updated);
        if (findings.length > 0) {
          await events.append({ type: 'check.failed', deliveryId: updated.id, occurredAt: new Date().toISOString(), metadata: { specId: spec.id } });
        }
        return { accepted: findings.length === 0, advanced: findings.length === 0, deliveryState: updated.state, specState: nextSpecState, findings };
      }
      throw new DomainError('SUBMISSION_KIND_UNSUPPORTED', `Submission kind is not implemented: ${input.kind}`);
    },

    async verify(input): Promise<VerificationResult> {
      const delivery = await getDelivery(input.deliveryId);
      const [verification, audit] = await Promise.all([
        evaluate(delivery),
        auditDelivery({ root, delivery, mode: 'normal' }),
      ]);
      const findings: AuditFinding[] = [
        ...(verification.ok ? [] : verification.findings),
        ...audit.findings,
      ];
      return findings.length === 0 ? verification : { activity: verification.activity, ok: false, findings };
    },

    async verifyRepository(input): Promise<AuditResult> {
      return auditRepository({ root, mode: input.mode });
    },

    async doctor(input = {}): Promise<DoctorResult> {
      const findings: AuditFinding[] = [];
      const fixes: string[] = [];
      const nodeMajor = Number.parseInt(nodeVersion.split('.')[0] ?? '0', 10);
      if (nodeMajor < 20) {
        findings.push(diagnosticFinding(
          'NODE_VERSION_UNSUPPORTED',
          `Team SDD requires Node.js 20 or newer; found ${nodeVersion}.`,
          'node',
          'Install Node.js 20 or newer and rerun Team SDD diagnostics.',
        ));
      }

      try {
        await readProjectConfig(root);
      } catch (error) {
        findings.push(diagnosticFinding(
          'PROJECT_CONFIG_INVALID',
          errorMessage(error),
          join('.sdd', 'config.yaml'),
          'Run sdd init or correct the Team SDD project configuration.',
        ));
      }

      try {
        const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> };
        for (const command of ['test', 'typecheck', 'build']) {
          if (typeof packageJson.scripts?.[command] !== 'string') {
            findings.push(diagnosticFinding(
              'PACKAGE_COMMAND_MISSING',
              `The package command ${command} is not configured.`,
              'package.json',
              `Add the ${command} package script before running Team SDD CI verification.`,
            ));
          }
        }
      } catch (error) {
        findings.push(diagnosticFinding(
          'PACKAGE_MANIFEST_INVALID',
          `Unable to inspect package commands: ${errorMessage(error)}`,
          'package.json',
          'Restore a readable package.json with test, typecheck, and build scripts.',
        ));
      }

      let hookInspection = await inspectGitHook(root);
      const fixableHookCodes = new Set(['GIT_HOOK_MISSING', 'GIT_HOOK_INVALID', 'GIT_HOOKS_PATH_INVALID']);
      const hasHookConflict = hookInspection.findings.some(({ code }) => code === 'GIT_HOOK_CONFLICT');
      if (input.fix && !hasHookConflict && hookInspection.findings.some(({ code }) => fixableHookCodes.has(code))) {
        const hookWasMissing = hookInspection.findings.some(({ code }) => code === 'GIT_HOOK_MISSING' || code === 'GIT_HOOK_INVALID');
        const pathWasInvalid = hookInspection.findings.some(({ code }) => code === 'GIT_HOOKS_PATH_INVALID');
        try {
          await installGitHook(root);
          if (hookWasMissing) fixes.push('.githooks/pre-commit');
          if (pathWasInvalid) fixes.push('core.hooksPath=.githooks');
        } catch (error) {
          findings.push(diagnosticFinding(
            error instanceof DomainError ? error.code : 'GIT_HOOK_INSTALL_FAILED',
            errorMessage(error),
            '.githooks/pre-commit',
            'Restore Git access and rerun doctor with fix enabled.',
          ));
        }
        hookInspection = await inspectGitHook(root);
      }
      findings.push(...hookInspection.findings);

      for (const integrationPath of [join('integrations', 'claude-code'), join('integrations', 'codebuddy')]) {
        try {
          const metadata = await lstat(join(root, integrationPath));
          if (!metadata.isDirectory()) {
            findings.push(diagnosticFinding(
              'INTEGRATION_SOURCE_INVALID',
              `Native Agent integration source must be a directory: ${integrationPath}`,
              integrationPath,
              'Replace the entry with the repository-owned integration source directory.',
            ));
            continue;
          }
          await access(join(root, integrationPath), constants.R_OK);
        } catch (error) {
          findings.push(diagnosticFinding(
            'INTEGRATION_SOURCE_UNREADABLE',
            `Unable to read the native Agent integration source at ${integrationPath}: ${errorMessage(error)}`,
            integrationPath,
            'Restore the repository-owned integration source directory.',
          ));
        }
      }

      return { ok: findings.length === 0, findings, fixes };
    },

    async inspect(input): Promise<InspectionResult> {
      const delivery = await getDelivery(input.deliveryId);
      const activity = resolveActivity(delivery);
      const activeSpec = delivery.specs.find((spec) => spec.state !== 'DONE');
      const approvalsCurrent: Record<ApprovalArtifact, boolean> = {
        requirement: false,
        design: false,
        spec: false,
      };
      for (const artifact of ['requirement', 'design', 'spec'] as const) {
        const approval = delivery.approvals[artifact];
        if (!approval) continue;
        try {
          const hash = artifact === 'spec'
            ? await artifacts.hashSpecSet(delivery)
            : await artifacts.hash({ deliveryId: delivery.id, kind: artifact });
          approvalsCurrent[artifact] = hash === approval.hash;
        } catch {
          approvalsCurrent[artifact] = false;
        }
      }
      const verification = await evaluate(delivery);
      const next: NextResult = {
        activity: verification.activity,
        requiredArtifacts: artifactForActivity(verification.activity, delivery),
        blockers: verification.ok ? [] : verification.findings,
      };
      return { delivery, activity, activeSpec, next, approvalsCurrent };
    },

    async events(input): Promise<WorkflowEvent[]> {
      return events.read(parseDeliveryId(input.deliveryId));
    },

    async getConfig(): Promise<ProjectConfig> {
      return readProjectConfig(root);
    },

    async setExecutionStrategy(input): Promise<ProjectConfig> {
      if (!(['auto', 'inline', 'subagent'] as readonly unknown[]).includes(input.strategy)) {
        throw new DomainError('EXECUTION_STRATEGY_UNSUPPORTED', `Unsupported execution strategy: ${String(input.strategy)}`);
      }
      const current = await readProjectConfig(root);
      const updated: ProjectConfig = { ...current, execution: { strategy: input.strategy } };
      await writeProjectConfig(root, updated);
      return updated;
    },

    async repair(input): Promise<RepairResult> {
      const deliveryId = parseDeliveryId(input.deliveryId);
      const safetyPaths = [
        join(root, '.sdd'),
        join(root, 'sdd'),
        join(root, 'sdd', 'deliveries'),
        join(root, 'sdd', 'deliveries', deliveryId),
        join(root, 'sdd', 'deliveries', deliveryId, 'specs'),
      ];
      await assertRepairPathsSafe(safetyPaths);
      const relativePaths = [
        '.sdd',
        join('sdd', 'deliveries', deliveryId),
        join('sdd', 'deliveries', deliveryId, 'specs'),
      ];
      const actions: string[] = [];
      for (const relativePath of relativePaths) {
        if (!(await pathExists(join(root, relativePath)))) actions.push(relativePath);
      }
      if (input.apply) {
        for (const relativePath of actions) {
          await mkdir(join(root, relativePath), { recursive: true, mode: 0o755 });
        }
      }
      return { applied: input.apply === true, actions, findings: [] };
    },

    async getNext(input): Promise<NextResult> {
      const delivery = await getDelivery(input.deliveryId);
      const verification = await evaluate(delivery);
      return {
        activity: verification.activity,
        requiredArtifacts: artifactForActivity(verification.activity, delivery),
        blockers: verification.ok ? [] : verification.findings,
      };
    },
  };
}
