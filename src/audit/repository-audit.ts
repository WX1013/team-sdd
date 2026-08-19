import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ArtifactStore } from '../artifacts/artifact-store.js';
import { readProjectConfig, type ProjectConfig } from '../config/project-config.js';
import { transitionDelivery, transitionSpec } from '../domain/transitions.js';
import type {
  ApprovalArtifact,
  DeliveryMetadata,
  DeliveryState,
  SpecId,
  SpecState,
  WorkflowEvent,
} from '../domain/types.js';
import { evaluateDesignGate, evaluateRequirementGate } from '../gates/requirements.js';
import { evaluateCheckGate, evaluateDeliveryCheckGate, evaluatePlanGate, evaluateSpecGate } from '../gates/specs.js';
import type { GateResult } from '../gates/types.js';
import { resolveActivity } from '../runtime/next-context.js';
import { LocalDeliveryRepository, LocalEventRepository } from '../storage/local-repositories.js';
import type { AuditFinding, AuditResult, VerifyMode } from './types.js';

const deliveryStates = new Set<DeliveryState>(['REQUIREMENT', 'DESIGN', 'SPEC', 'EXECUTION', 'CHECK', 'DONE']);
const specStates = new Set<SpecState>(['READY', 'PLAN', 'CODE', 'CHECK', 'DONE']);
const knownEventTypes = new Set([
  'delivery.created', 'delivery.transitioned', 'delivery.completed',
  'design.decided', 'requirement.approved', 'design.approved', 'spec.approved',
  'spec.created', 'spec.transitioned', 'artifact.submitted', 'check.failed',
]);
const execFileAsync = promisify(execFile);

function finding(code: string, message: string, artifact: string, nextStep: string): AuditFinding {
  return { code, message, artifact, nextStep };
}

function result(findings: AuditFinding[]): AuditResult {
  return findings.length === 0 ? { ok: true, findings: [] } : { ok: false, findings };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDeliveryState(value: unknown): value is DeliveryState {
  return typeof value === 'string' && deliveryStates.has(value as DeliveryState);
}

function isSpecState(value: unknown): value is SpecState {
  return typeof value === 'string' && specStates.has(value as SpecState);
}

function eventArtifact(delivery: DeliveryMetadata): string {
  return join('.sdd', 'events', `${delivery.id}.jsonl`);
}

function eventFieldError(event: WorkflowEvent): string | undefined {
  const metadata = event.metadata;
  const hasHash = typeof metadata?.hash === 'string' && /^sha256:[a-f0-9]{64}$/.test(metadata.hash);
  if (event.type === 'design.decided' && (metadata?.actorType !== 'human' || typeof metadata.approvedBy !== 'string' || !metadata.approvedBy.trim() || typeof metadata.required !== 'boolean' || typeof metadata.reason !== 'string' || !metadata.reason.trim())) {
    return 'design.decided requires human actor, approver, required, and reason metadata.';
  }
  if (event.type === 'spec.created' && (typeof metadata?.specId !== 'string' || !/^SP-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(metadata.specId))) {
    return 'spec.created requires a valid Spec Pack ID.';
  }
  if (event.type === 'artifact.submitted' && (typeof metadata?.kind !== 'string' || !['requirement', 'design', 'spec', 'plan', 'check'].includes(metadata.kind) || !hasHash || ((metadata.kind === 'spec' || metadata.kind === 'plan') && typeof metadata.specId !== 'string'))) {
    return 'artifact.submitted requires a valid artifact kind, SHA-256 hash, and Spec Pack ID for Spec, Plan, or Check artifacts.';
  }
  if (['requirement.approved', 'design.approved', 'spec.approved'].includes(event.type) && (typeof metadata?.approvedBy !== 'string' || !metadata.approvedBy.trim() || !hasHash)) {
    return `${event.type} requires an approver and SHA-256 hash.`;
  }
  if (event.type === 'check.failed' && (typeof metadata?.specId !== 'string' || !/^SP-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(metadata.specId))) {
    return 'check.failed requires a valid Spec Pack ID.';
  }
  return undefined;
}

function auditEvents(delivery: DeliveryMetadata, events: WorkflowEvent[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const artifact = eventArtifact(delivery);
  let deliveryState: DeliveryState | undefined;
  let deliveryCreated = false;
  let humanDesignDecision = false;
  const specHistory = new Map<SpecId, SpecState>();

  const deliveryHistoryFinding = (message: string) => findings.push(finding(
    'EVENT_DELIVERY_HISTORY_INVALID',
    message,
    artifact,
    'Restore one contiguous Delivery event history anchored by delivery.created.',
  ));
  const specHistoryFinding = (message: string) => findings.push(finding(
    'EVENT_SPEC_HISTORY_INVALID',
    message,
    artifact,
    'Restore one contiguous Spec Pack event history anchored by spec.created.',
  ));

  for (const [index, event] of events.entries()) {
    if (event.deliveryId !== delivery.id) {
      findings.push(finding(
        'EVENT_DELIVERY_ID_INVALID',
        `Event Delivery ID ${event.deliveryId} does not match ${delivery.id}.`,
        artifact,
        `Change the event Delivery ID to ${delivery.id} or move the event to the matching log.`,
      ));
    }

    if (!knownEventTypes.has(event.type)) {
      findings.push(finding(
        'EVENT_TYPE_UNKNOWN',
        `Event type ${event.type} is not supported by this workflow version.`,
        artifact,
        'Remove the unknown event or upgrade the workflow implementation that defines it.',
      ));
      continue;
    }

    const fieldError = eventFieldError(event);
    if (fieldError) {
      findings.push(finding('EVENT_FIELDS_INVALID', fieldError, artifact, 'Restore the required fields for this event type.'));
      continue;
    }

    if (event.type === 'delivery.created') {
      if (deliveryCreated) {
        deliveryHistoryFinding('Delivery history contains more than one delivery.created anchor.');
      } else {
        if (index !== 0) deliveryHistoryFinding('delivery.created must be the first event in a Delivery history.');
        deliveryCreated = true;
        deliveryState = 'REQUIREMENT';
      }
      continue;
    }

    if (event.type === 'delivery.transitioned') {
      if (!isDeliveryState(event.previousState) || !isDeliveryState(event.nextState)) {
        findings.push(finding(
          'EVENT_DELIVERY_TRANSITION_INVALID',
          'Delivery transition event has missing or invalid states.',
          artifact,
          'Record valid previousState and nextState Delivery states.',
        ));
        continue;
      }
      if (!deliveryCreated || !deliveryState) {
        deliveryHistoryFinding('Delivery transition appears before the delivery.created REQUIREMENT anchor.');
        continue;
      }
      if (event.previousState !== deliveryState) {
        deliveryHistoryFinding(`Delivery transition starts at ${event.previousState}, but the derived prior state is ${deliveryState}; expected ${deliveryState}.`);
        continue;
      }
      try {
        transitionDelivery(event.previousState, event.nextState);
        deliveryState = event.nextState;
      } catch (error) {
        findings.push(finding(
          'EVENT_DELIVERY_TRANSITION_INVALID',
          errorMessage(error),
          artifact,
          'Replace the event with a legal Delivery transition.',
        ));
      }
      continue;
    }

    if (event.type === 'design.decided') {
      const metadata = event.metadata;
      if (typeof metadata?.approvedBy !== 'string' || !metadata.approvedBy.trim() || metadata.actorType !== 'human') {
        findings.push(finding('EVENT_DESIGN_DECISION_INVALID', 'Design decision event must include a human actor and approver.', artifact, 'Record a human Design decision with approvedBy and actorType: human.'));
      } else {
        humanDesignDecision = true;
      }
      continue;
    }

    if (event.type === 'spec.created') {
      const specId = event.metadata?.specId;
      if (typeof specId !== 'string' || !delivery.specs.some((spec) => spec.id === specId)) {
        specHistoryFinding('spec.created must declare a Spec Pack ID present in delivery metadata.');
        continue;
      }
      if (specHistory.has(specId as SpecId)) {
        specHistoryFinding(`Spec Pack ${specId} has more than one spec.created READY anchor.`);
        continue;
      }
      specHistory.set(specId as SpecId, 'READY');
      continue;
    }

    if (event.type === 'spec.transitioned') {
      const specId = event.metadata?.specId;
      const previousState = event.metadata?.previousState;
      const nextState = event.metadata?.nextState;
      if (typeof specId !== 'string' || !isSpecState(previousState) || !isSpecState(nextState)) {
        findings.push(finding(
          'EVENT_SPEC_TRANSITION_INVALID',
          'Spec transition event metadata must include a Spec Pack ID and valid previous and next states.',
          artifact,
          'Record specId, previousState, and nextState in the event metadata.',
        ));
        continue;
      }
      const spec = delivery.specs.find((candidate) => candidate.id === specId);
      if (!spec) {
        findings.push(finding(
          'EVENT_SPEC_TRANSITION_INVALID',
          `Spec transition references unknown Spec Pack ${specId}.`,
          artifact,
          'Reference a Spec Pack declared in delivery.yaml.',
        ));
        continue;
      }
      const derivedState = specHistory.get(spec.id);
      if (!derivedState) {
        specHistoryFinding(`Spec transition for ${spec.id} appears before its spec.created READY anchor.`);
        continue;
      }
      if (previousState !== derivedState) {
        specHistoryFinding(`Spec transition for ${spec.id} starts at ${previousState}, but the derived prior state is ${derivedState}; expected ${derivedState}.`);
        continue;
      }
      try {
        transitionSpec(previousState, nextState);
        specHistory.set(spec.id, nextState);
      } catch (error) {
        findings.push(finding(
          'EVENT_SPEC_TRANSITION_INVALID',
          errorMessage(error),
          artifact,
          'Replace the event with a legal Spec Pack transition.',
        ));
      }
    }
  }

  if (!deliveryCreated) {
    deliveryHistoryFinding('Delivery history is missing its delivery.created REQUIREMENT anchor.');
  } else if (deliveryState !== delivery.state) {
    findings.push(finding(
      'EVENT_DELIVERY_TRANSITION_INVALID',
      `Latest Delivery transition ends in ${deliveryState}, but metadata is ${delivery.state}.`,
      artifact,
      'Reconcile delivery.yaml with the latest legal Delivery transition.',
    ));
  }

  if (delivery.type === 'FEATURE_CHANGE' && delivery.design && !humanDesignDecision) {
    findings.push(finding('DESIGN_DECISION_EVENT_MISSING', 'Feature Change metadata contains a Design decision without a corresponding human event.', artifact, 'Record the decision through the human Design decision command.'));
  }

  for (const spec of delivery.specs) {
    const latestState = specHistory.get(spec.id);
    if (!latestState) {
      specHistoryFinding(`Spec Pack ${spec.id} is declared in metadata but is missing its spec.created READY anchor.`);
    } else if (latestState !== spec.state) {
      findings.push(finding(
        'EVENT_SPEC_TRANSITION_INVALID',
        `Latest transition for ${spec.id} ends in ${latestState}, but metadata is ${spec.state}.`,
        artifact,
        `Reconcile ${spec.id} metadata with its latest legal transition.`,
      ));
    }
  }

  return findings;
}

function auditMetadata(delivery: DeliveryMetadata): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const artifact = join('sdd', 'deliveries', delivery.id, 'delivery.yaml');
  const ids = new Set<string>();
  for (const spec of delivery.specs) {
    if (ids.has(spec.id)) {
      findings.push(finding('DELIVERY_SPEC_ID_DUPLICATE', `Delivery metadata declares Spec Pack ${spec.id} more than once.`, artifact, 'Remove the duplicate Spec Pack entry.'));
    }
    ids.add(spec.id);
  }
  for (const spec of delivery.specs) {
    for (const dependency of spec.dependencies) {
      if (dependency === spec.id) {
        findings.push(finding('DELIVERY_SPEC_SELF_DEPENDENCY', `Spec Pack ${spec.id} depends on itself.`, artifact, 'Remove the self dependency.'));
      } else if (!ids.has(dependency)) {
        findings.push(finding('DELIVERY_SPEC_DEPENDENCY_UNKNOWN', `Spec Pack ${spec.id} depends on unknown Spec Pack ${dependency}.`, artifact, 'Reference an existing Spec Pack or remove the dependency.'));
      }
    }
  }
  for (const artifactName of ['requirement', 'design', 'spec'] as const) {
    const approval = delivery.approvals[artifactName];
    if (approval && approval.artifact !== artifactName) {
      findings.push(finding('DELIVERY_APPROVAL_ARTIFACT_MISMATCH', `Approval key ${artifactName} contains artifact ${approval.artifact}.`, artifact, `Move the approval to the ${approval.artifact} field or correct its artifact value.`));
    }
  }
  if (delivery.state === 'DONE' && delivery.specs.some((spec) => spec.state !== 'DONE')) {
    findings.push(finding('DELIVERY_DONE_WITH_INCOMPLETE_SPECS', 'Delivery is DONE while one or more Spec Packs are not DONE.', artifact, 'Complete all Spec Packs or restore the Delivery state.'));
  }
  if (delivery.type === 'APPLICATION_INIT' && delivery.design?.required === false) {
    findings.push(finding('DELIVERY_DESIGN_INVALID', 'APPLICATION_INIT cannot declare that Technical Design is not required.', artifact, 'Remove the Design decision or mark Design as required.'));
  }
  return findings;
}

async function auditSpecDirectories(root: string, delivery: DeliveryMetadata): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const directory = join(root, 'sdd', 'deliveries', delivery.id, 'specs');
  let entries: Array<{ isDirectory(): boolean; name: string }>;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return findings;
    findings.push(finding('SPEC_DIRECTORY_INVALID', errorMessage(error), join('sdd', 'deliveries', delivery.id, 'specs'), 'Restore the Spec Pack directory structure.'));
    return findings;
  }
  const declared = new Set<string>(delivery.specs.map((spec) => spec.id));
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    if (!/^SP-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.name)) {
      findings.push(finding('SPEC_DIRECTORY_INVALID', `Spec directory ${entry.name} has an invalid Spec Pack ID.`, join('sdd', 'deliveries', delivery.id, 'specs', entry.name), 'Rename or remove the invalid Spec Pack directory.'));
    } else if (!declared.has(entry.name)) {
      findings.push(finding('SPEC_DIRECTORY_UNREGISTERED', `Spec directory ${entry.name} is not declared in delivery.yaml.`, join('sdd', 'deliveries', delivery.id, 'specs', entry.name), 'Register the Spec Pack in delivery.yaml or remove the directory.'));
    }
  }
  return findings;
}

function conciseCommandOutput(error: unknown): string {
  const output = typeof error === 'object' && error !== null
    ? `${String((error as { stdout?: unknown }).stdout ?? '')}\n${String((error as { stderr?: unknown }).stderr ?? '')}`.trim()
    : '';
  return output.slice(0, 2000) || errorMessage(error);
}

async function runCiChecks(root: string, config: ProjectConfig): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  for (const commandParts of [config.checks.test, config.checks.typecheck, config.checks.build]) {
    const [command, ...args] = commandParts;
    try {
      await execFileAsync(command, args, { cwd: root, shell: false });
    } catch (error) {
      const rendered = [command, ...args].join(' ');
      findings.push(finding(
        'CI_CHECK_FAILED',
        `CI check failed: ${rendered}\n${conciseCommandOutput(error)}`,
        'package.json',
        `Fix ${rendered} and rerun Team SDD CI verification.`,
      ));
      break;
    }
  }
  return findings;
}

async function auditApproval(
  delivery: DeliveryMetadata,
  artifact: ApprovalArtifact,
  artifacts: ArtifactStore,
): Promise<AuditFinding | undefined> {
  const approval = delivery.approvals[artifact];
  if (!approval) return undefined;
  try {
    const currentHash = artifact === 'spec'
      ? await artifacts.hashSpecSet(delivery)
      : await artifacts.hash({ deliveryId: delivery.id, kind: artifact });
    if (currentHash === approval.hash) return undefined;
    return finding(
      `${artifact.toUpperCase()}_APPROVAL_STALE`,
      `${artifact} approval does not match the current artifact hash.`,
      artifact === 'spec' ? 'specs/' : `${artifact}.md`,
      `Request a new human approval for the current ${artifact} artifact.`,
    );
  } catch (error) {
    return finding(
      `${artifact.toUpperCase()}_APPROVAL_STALE`,
      `Unable to validate the current ${artifact} approval: ${errorMessage(error)}`,
      artifact === 'spec' ? 'specs/' : `${artifact}.md`,
      `Restore the approved ${artifact} artifact or request a new human approval.`,
    );
  }
}

async function evaluateActiveGate(
  delivery: DeliveryMetadata,
  artifacts: ArtifactStore,
): Promise<GateResult> {
  const activity = resolveActivity(delivery);
  if (activity === 'REQUIREMENT') return evaluateRequirementGate({ delivery, artifacts });
  if (activity === 'DESIGN') return evaluateDesignGate({ delivery, artifacts });
  if (activity === 'SPEC_SPLIT') return evaluateSpecGate({ delivery, artifacts });
  const activeSpec = delivery.specs.find((spec) => spec.state !== 'DONE');
  if (activity === 'PLAN' && activeSpec) return evaluatePlanGate({ delivery, specId: activeSpec.id, artifacts });
  if (activity === 'CHECK' && activeSpec) return evaluateCheckGate({ delivery, specId: activeSpec.id, artifacts });
  if (activity === 'CHECK') return evaluateDeliveryCheckGate({ delivery, artifacts });
  if (activity === 'DONE') return { ok: true };
  return {
    ok: false,
    findings: [finding(
      'EXECUTION_ACTION_REQUIRED',
      'The active Spec Pack is in CODE and must be implemented through the selected execution runtime.',
      `${activeSpec?.id ?? 'specs'}/`,
      'Run the implementation logical skill and submit resulting artifacts.',
    )],
  };
}

export async function auditDelivery(input: {
  root: string;
  delivery: DeliveryMetadata;
  mode: VerifyMode;
}): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const events = new LocalEventRepository(input.root);
  const artifacts = new ArtifactStore(input.root);
  findings.push(...auditMetadata(input.delivery));
  findings.push(...await auditSpecDirectories(input.root, input.delivery));

  try {
    findings.push(...auditEvents(input.delivery, await events.read(input.delivery.id)));
  } catch (error) {
    findings.push(finding(
      'EVENT_LOG_INVALID',
      errorMessage(error),
      eventArtifact(input.delivery),
      'Repair or remove malformed event rows without changing valid workflow history.',
    ));
  }

  for (const artifact of ['requirement', 'design', 'spec'] as const) {
    const approvalFinding = await auditApproval(input.delivery, artifact, artifacts);
    if (approvalFinding) findings.push(approvalFinding);
  }

  if (input.mode === 'ci') {
    try {
      const gate = await evaluateActiveGate(input.delivery, artifacts);
      if (!gate.ok) findings.push(...gate.findings);
    } catch (error) {
      findings.push(finding(
        'DELIVERY_GATE_INVALID',
        `Unable to evaluate the active Delivery Gate: ${errorMessage(error)}`,
        join('sdd', 'deliveries', input.delivery.id),
        'Restore the active Gate artifacts and rerun CI verification.',
      ));
    }
  }

  return result(findings);
}

export async function auditRepository(input: {
  root: string;
  mode: 'hook' | 'ci';
}): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const deliveries = new LocalDeliveryRepository(input.root);
  let config: ProjectConfig | undefined;

  try {
    config = await readProjectConfig(input.root);
  } catch (error) {
    findings.push(finding(
      'PROJECT_CONFIG_INVALID',
      errorMessage(error),
      join('.sdd', 'config.yaml'),
      'Initialize or correct the Team SDD project configuration.',
    ));
  }

  let deliveryIds;
  try {
    deliveryIds = await deliveries.listIds();
  } catch (error) {
    findings.push(finding(
      'DELIVERY_REPOSITORY_INVALID',
      errorMessage(error),
      join('sdd', 'deliveries'),
      'Ensure every Delivery directory has a valid Delivery ID.',
    ));
    return result(findings);
  }

  for (const deliveryId of deliveryIds) {
    let delivery: DeliveryMetadata;
    try {
      delivery = await deliveries.read(deliveryId);
    } catch (error) {
      findings.push(finding(
        'DELIVERY_METADATA_INVALID',
        errorMessage(error),
        join('sdd', 'deliveries', deliveryId, 'delivery.yaml'),
        'Correct the Delivery metadata to match the Team SDD schema.',
      ));
      continue;
    }
    const deliveryAudit = await auditDelivery({ root: input.root, delivery, mode: input.mode });
    findings.push(...deliveryAudit.findings);
  }

  if (input.mode === 'ci' && findings.length === 0 && config) {
    findings.push(...await runCiChecks(input.root, config));
  }

  return result(findings);
}
