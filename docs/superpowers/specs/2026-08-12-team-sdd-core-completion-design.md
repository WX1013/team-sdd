# Team SDD Complete Core Design

## Goal

Complete the Team SDD Core so a Delivery can create Spec Packs, submit fixed-path artifacts, pass deterministic Gates, and progress through Delivery and Spec Pack workflows without any entrypoint directly changing state.

## Scope

### In scope

- Create Spec Packs while a Delivery is in `SPEC`.
- Submit Requirement, Design, Spec, Plan, and Check artifacts through the workflow service.
- Store Spec dependency and acceptance-criterion summaries in `delivery.yaml`.
- Progress Spec Packs through `READY → PLAN → CODE → CHECK → DONE`.
- Progress Delivery through `REQUIREMENT → DESIGN/SPEC → EXECUTION → CHECK → DONE`.
- Implement Delivery-level Check validation and evidence recording.
- Expose the Core lifecycle through CLI commands that only call service methods.
- Add unit and temporary-repository integration tests for every new state transition, Gate, event, and CLI behavior.

### Out of scope

- Git hook, CI, doctor, MCP server, and agent-specific integration.
- Generating Markdown content with an agent or executing external tests from the engine.
- Remote storage, web UI, and multi-repository Deliveries.

## Architecture

Agent, CLI, and future MCP callers write Markdown at canonical Artifact paths then call `submitArtifact`. The workflow service reads and validates that Artifact, evaluates the appropriate Gate, records a submitted event, and is the sole component that may apply a state transition. Storage and CLI adapters never change state themselves.

```text
Agent / CLI
  | write fixed-path Artifact
  v
submitArtifact
  |-- Artifact validation and Hash
  |-- Gate evaluation and evidence validation
  |-- append submitted event
  `-- legal state transition + transition event
```

`next` remains a read-only context and continuation action. Only `submitArtifact` evaluates a newly submitted Artifact and advances workflow state; `next` never writes content or mutates metadata.

## Public Service API

```ts
type CreateSpecPackInput = {
  deliveryId: DeliveryId;
  id: SpecId;
  title: string;
  dependencies?: SpecId[];
  acceptanceCriteria?: string[];
};

type SubmitArtifactInput = {
  deliveryId: DeliveryId;
  kind: 'requirement' | 'design' | 'spec' | 'plan' | 'check';
  specId?: SpecId;
  evidence?: {
    tests?: string[];
    build?: string;
    staticChecks?: string[];
    integration?: string[];
    regression?: string[];
    deliveryAcceptance?: string[];
  };
};

type SubmissionResult = {
  accepted: boolean;
  advanced: boolean;
  deliveryState: DeliveryState;
  specState?: SpecState;
  findings: GateFinding[];
};
```

`specId` is required for `spec`, `plan`, and `check`; supplying it for a Delivery Artifact is rejected. `createSpecPack` is allowed only in `SPEC` and rejects duplicate IDs, unknown dependencies, and self-dependencies.

## Metadata and Artifacts

Each Spec summary gains optional stable intent fields:

```yaml
specs:
  - id: SP-001
    title: Student records
    state: READY
    dependencies: []
    acceptanceCriteria:
      - AC-001
      - AC-002
```

The engine creates an empty but structured `spec.md` template when creating a Spec Pack. The submitted Spec Artifact remains the source of truth for full content; the metadata summary is refreshed from its `Dependencies` and `Acceptance Criteria` sections after successful submission.

All Artifacts use existing canonical paths. Submission evidence is written only into the corresponding `check.md` as a machine-readable `## Verification Evidence` section supplied by the caller, not duplicated into `delivery.yaml`.

## Workflow Rules

### Delivery

- Submitted Requirement that passes its Gate advances `REQUIREMENT` to `DESIGN` for application initialization and design-required feature changes; it advances to `SPEC` for an explicitly design-skipped feature change.
- Submitted Design that passes advances `DESIGN` to `SPEC`.
- The Delivery may leave `SPEC` only if the aggregate Spec Gate passes and has a current human approval.
- When every Spec Pack is `DONE`, the Delivery advances from `EXECUTION` to `CHECK`.
- A submitted Delivery Check that passes all Delivery evidence advances `CHECK` to `DONE`.

### Spec Pack

- Creating a Spec Pack starts it in `READY`.
- A submitted Plan that passes its Gate moves `READY` to `PLAN` and then immediately to `CODE`; the intermediate `PLAN` transition is recorded as an event.
- A Check submission is valid only in `CHECK`; passing evidence moves `CHECK` to `DONE`.
- A failed Check submission moves `CHECK` back to `CODE` and appends `check.failed`; it never introduces a failed state.
- Moving from `CODE` to `CHECK` is an explicit `submitArtifact` command with `kind: 'check'`; Check evidence is then evaluated in the same operation.

## Events

Every submission appends `artifact.submitted` with the artifact kind, optional Spec ID, and current SHA-256 hash. Every state mutation appends a distinct event: `delivery.transitioned`, `spec.transitioned`, `spec.created`, `check.failed`, or `delivery.completed`. Event lines are append-only JSONL.

## Gate and Evidence Rules

- Existing Requirement, Design, Spec, and Plan Gate requirements remain unchanged.
- Plan must cover the criteria declared by its Spec Artifact and have a verification step for each task.
- Spec Check requires non-empty `tests`, `build`, and `staticChecks` evidence plus a Check Artifact that records all ACs as passed.
- Delivery Check requires every Spec to be `DONE`, non-empty `integration`, `regression`, and `deliveryAcceptance` evidence, and a Check Artifact that records 100% Requirement Coverage.
- Gate failures return actionable findings and leave the current state unchanged, except a failed Spec Check, which moves from `CHECK` to `CODE`.

## CLI

New thin command adapters are:

```text
sdd spec create <deliveryId> <specId> --title <title> [--depends-on <specId>...]
sdd submit <deliveryId> <kind> [--spec <specId>] [--tests <item>...] [--build <item>] [--static-check <item>...]
```

`submit` returns exit code 0 for accepted submissions, 2 for Gate findings, and 1 for invalid input or storage errors. It renders the result and next actionable state; it does not parse or write Markdown itself.

## Testing Strategy

Tests use real temporary directories and service instances. Each transition has a red-green test that proves legal success, a blocked Gate leaves state unchanged, a stale approval blocks transition, and every accepted or failed submission appends the expected event. CLI tests invoke `runCli` and assert exit codes, rendered findings, state, and filesystem effects.

## Constraints

- Node.js 20+, TypeScript ESM, Vitest, Zod, YAML, and Commander remain the only dependencies.
- No Agent name may appear in workflow decisions.
- The workflow service is the only state-mutation boundary.
- All new behavior must be test-first.
