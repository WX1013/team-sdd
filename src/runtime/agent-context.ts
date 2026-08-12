import type { DeliveryMetadata } from '../domain/types.js';
import type { GateFinding } from '../gates/types.js';
import { capabilityGapsFor, executionStrategyFor, type AgentCapabilities, type ExecutionStrategy } from './capabilities.js';
import { logicalSkillFor, type LogicalSkill } from './logical-skills.js';
import type { Activity } from './next-context.js';
import { getSkillDefinition } from '../skills/registry.js';

export type AgentContext = {
  activity: Activity;
  logicalSkill: LogicalSkill;
  execution: ExecutionStrategy;
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
  const execution = executionStrategyFor(input.capabilities);
  const capabilityGaps = capabilityGapsFor(input.capabilities);
  const blockers = input.blockers.map((blocker) => `${blocker.message} → ${blocker.nextStep}`);
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
    artifacts: [...input.artifacts],
    blockers: [...input.blockers],
    constraints: [...constraints],
    capabilityGaps,
    prompt,
  };
}
