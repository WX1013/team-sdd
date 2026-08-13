import type { DeliveryMetadata } from '../domain/types.js';
import type { GateFinding } from '../gates/types.js';
import { capabilityGapsFor, executionStrategyFor, type AgentCapabilities, type ExecutionStrategy } from './capabilities.js';
import { logicalSkillFor, type LogicalSkill } from './logical-skills.js';
import type { Activity } from './next-context.js';
import { getSkillDefinition } from '../skills/registry.js';
import { defaultLogicalSkillRoutes, mergeLogicalSkillRoutes, type LogicalSkillRouteOverrides } from './skill-routes.js';
import { resolveSkillRuntime, type ResolvedSkillRuntime } from './skill-runtime.js';
import type { ProjectExecutionStrategy } from '../config/project-config.js';

export type AgentContext = {
  activity: Activity;
  logicalSkill: LogicalSkill;
  execution: ExecutionStrategy;
  skillRuntime: ResolvedSkillRuntime;
  artifacts: string[];
  blockers: GateFinding[];
  constraints: string[];
  capabilityGaps: string[];
  prompt: string;
};

export type BuildAgentContextInput = {
  delivery: Pick<DeliveryMetadata, 'id' | 'title' | 'state'> & Partial<Pick<DeliveryMetadata, 'type' | 'design' | 'approvals' | 'specs'>>;
  activity: Activity;
  artifacts: string[];
  blockers: GateFinding[];
  capabilities: AgentCapabilities;
  strategy?: ProjectExecutionStrategy;
  logicalSkillOverrides?: LogicalSkillRouteOverrides;
};

const constraints = [
  'Do not modify delivery.yaml state directly.',
  'Do not append workflow events directly.',
  'Write only to canonical Team SDD Artifact paths.',
  'After writing an Artifact, invoke sdd submit for the correct Artifact kind.',
];

function lines(items: readonly string[]): string {
  return items.length === 0 ? 'None' : items.map((item) => `- ${item}`).join('\n');
}

export function buildAgentContext(input: BuildAgentContextInput): AgentContext {
  const logicalSkill = logicalSkillFor(input.activity);
  const skillRuntime = resolveSkillRuntime({
    activity: input.activity,
    routes: mergeLogicalSkillRoutes(input.logicalSkillOverrides ?? defaultLogicalSkillRoutes),
    strategy: input.strategy ?? 'auto',
    capabilities: input.capabilities,
  });
  const execution = skillRuntime.execution;
  const capabilityGaps = capabilityGapsFor(input.capabilities);
  const blockerFindings = [...input.blockers, ...skillRuntime.blockers];
  const blockers = blockerFindings.map((blocker) => `${blocker.message} → ${blocker.nextStep}`);
  const definition = getSkillDefinition(logicalSkill);
  const spec = input.delivery.specs?.find((candidate) => candidate.state !== 'DONE') ?? input.delivery.specs?.[0];
  const skillSections = definition && (definition.artifactKind !== 'spec' || spec)
    ? ['', '## Artifact Template', definition.renderTemplate({ delivery: input.delivery as DeliveryMetadata, spec }), '', '## Submission', definition.submissionCommand({ deliveryId: input.delivery.id, specId: spec?.id })]
    : [];
  const prompt = [
    '## Team SDD Context',
    `Delivery: ${input.delivery.id} · ${input.delivery.title}`,
    `State: ${input.delivery.state}`,
    `Activity: ${input.activity}`,
    '',
    '## Task',
    `Logical skill: ${logicalSkill}`,
    `Execution: ${execution}`,
    '',
    '## Skill Runtime',
    `Provider: ${skillRuntime.provider}`,
    `Skills: ${skillRuntime.skills.join(', ')}`,
    `Adapter: ${skillRuntime.adapter}`,
    ...skillRuntime.instructions,
    '',
    '## Artifacts',
    lines(input.artifacts),
    '',
    '## Rules',
    lines(constraints),
    ...skillSections,
    '',
    '## Blockers',
    lines(blockers),
    '',
    '## Capability gaps',
    lines(capabilityGaps),
  ].join('\n');
  return {
    activity: input.activity,
    logicalSkill,
    execution,
    skillRuntime,
    artifacts: [...input.artifacts],
    blockers: blockerFindings,
    constraints: [...constraints],
    capabilityGaps,
    prompt,
  };
}
