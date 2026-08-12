# Team SDD V1 MVP Design

## Goal

Implement an agent-agnostic, repository-local SDD workflow engine as a TypeScript npm package. The MVP creates and governs Deliveries and Spec Packs through validated artifacts, hash-bound human approvals, append-only events, and a small CLI.

## Scope

### In scope

- A single ESM TypeScript npm package targeting Node.js 20 or later.
- Local repository storage under `.sdd/` and `sdd/deliveries/`.
- Delivery types `APPLICATION_INIT` and `FEATURE_CHANGE`.
- Delivery states `REQUIREMENT`, `DESIGN`, `SPEC`, `EXECUTION`, `CHECK`, and `DONE`.
- Spec Pack states `READY`, `PLAN`, `CODE`, `CHECK`, and `DONE`.
- Requirement, Design, Spec, Plan, and Check artifact validation and Gates.
- SHA-256 artifact hashes for Requirement, Design, and Spec human approvals.
- Append-only JSONL event logs.
- `sdd init`, `new`, `status`, `approve`, `verify`, and `next` CLI commands.
- TDD coverage for the domain, workflow, storage, and CLI behavior introduced by the MVP.

### Out of scope

- MCP server and per-agent command or skill installations.
- Git Hook and CI integrations.
- Remote state storage, a web UI, multi-repository Deliveries, or custom workflows.
- Calling an Agent or generating Markdown artifacts from `sdd next`.
- A replacement for existing PR review or test frameworks.

## Architecture

The package is a single published artifact with strict internal module boundaries. The CLI calls application services; application services coordinate the workflow engine, artifact store, event store, and Gate engine. The domain model has no filesystem or CLI dependency.

```text
CLI / future MCP / future Agent skill
              |
       application services
              |
workflow engine ----- gate engine
       |                   |
artifact store ----- local stores
       |
delivery files + approval hashes + event log
```

Only the workflow engine may transition a Delivery or Spec Pack state. It must first validate the relevant artifact and evaluate the applicable Gate. Storage adapters only persist or retrieve data; they cannot make workflow decisions.

## Modules

| Module | Responsibility | Public dependency direction |
| --- | --- | --- |
| `domain` | Branded IDs, states, approvals, events, domain errors | None |
| `workflow` | Action use cases and state transition guards | `domain`, ports |
| `gates` | Deterministic artifact, dependency, and approval rules | `domain`, ports |
| `artifacts` | Canonical paths, artifact readers, Markdown checks, SHA-256 hashing | `domain`, filesystem port |
| `storage` | YAML metadata repository and append-only JSONL event repository | `domain` |
| `runtime` | Capability model, logical skill mapping, next-activity context | `domain` |
| `cli` | Argument parsing, presentation, and exit-code mapping | application service API |

## Public Application API

All interaction layers use the same action-oriented service API:

```ts
type SddService = {
  init(input: InitInput): Promise<CommandResult>;
  createDelivery(input: CreateDeliveryInput): Promise<CommandResult>;
  getStatus(input: DeliveryRef): Promise<StatusResult>;
  approve(input: ApproveInput): Promise<CommandResult>;
  getNext(input: DeliveryRef): Promise<NextResult>;
  verify(input: VerifyInput): Promise<VerificationResult>;
};
```

`next` resolves the active activity, required artifact paths, blockers, and suggested logical skill. As defined in the completed Core design, it is read-only; `submitArtifact` is the sole operation that validates a newly submitted artifact and advances workflow state.

## Domain Schema

```ts
type DeliveryType = 'APPLICATION_INIT' | 'FEATURE_CHANGE';
type DeliveryState =
  | 'REQUIREMENT' | 'DESIGN' | 'SPEC'
  | 'EXECUTION' | 'CHECK' | 'DONE';
type SpecState = 'READY' | 'PLAN' | 'CODE' | 'CHECK' | 'DONE';

type Approval = {
  artifact: 'requirement' | 'design' | 'spec';
  hash: `sha256:${string}`;
  actorType: 'human';
  approvedBy: string;
  approvedAt: string;
};

type DeliveryMetadata = {
  id: `DLV-${string}`;
  title: string;
  type: DeliveryType;
  state: DeliveryState;
  design?: { required: boolean; reason: string };
  approvals: Partial<Record<Approval['artifact'], Approval>>;
  specs: Array<{ id: `SP-${string}`; title: string; state: SpecState }>;
};
```

The runtime validates external YAML at the storage boundary with Zod before constructing domain values. ISO-8601 timestamps are written in UTC. Invalid metadata produces a structured domain error and never silently defaults.

## Repository Contract

```text
.sdd/config.yaml
.sdd/events/<delivery-id>.jsonl
sdd/deliveries/<delivery-id>/delivery.yaml
sdd/deliveries/<delivery-id>/requirement.md
sdd/deliveries/<delivery-id>/design.md
sdd/deliveries/<delivery-id>/specs/<spec-id>/spec.md
sdd/deliveries/<delivery-id>/specs/<spec-id>/plan.md
sdd/deliveries/<delivery-id>/specs/<spec-id>/check.md
```

`design.md` is absent when a feature change has an approved decision that design is not required. `delivery.yaml` is the single machine-readable Delivery record; it stores identity, state, design decision, approvals, and Spec Pack summaries. Human-facing Markdown files are stage contracts and remain the source for their content.

Every state transition appends one JSON object to the Delivery event log. Events include a schema version, UTC timestamp, event name, entity ID, previous and next state where applicable, and action metadata. Existing event lines are never rewritten.

## Gate and Approval Rules

- Requirement Gate requires source, scope, no blocking questions, a baseline, no `TBD` or `TODO`, and a valid human approval.
- `APPLICATION_INIT` always requires Design. `FEATURE_CHANGE` requires an explicit design decision; Design may only be skipped if `required` is `false`.
- Design Gate requires all required sections, no `TBD` or `TODO`, no blocking issue, requirement coverage, and a valid human approval.
- Spec Gate requires one or more Spec Packs, complete required sections, valid non-cyclic dependencies, full requirement coverage, and a valid human approval of the aggregate Spec artifact set.
- Plan and Check Gates enforce the PRD's artifact and verification rules without adding a human approval step.
- An approval is valid only when its stored SHA-256 equals the current artifact hash. Any content change invalidates it.

## Failure Behavior

Gate failures do not change state and return a structured list of actionable findings: a stable rule ID, human-readable explanation, affected artifact, and prescribed next step. Missing files, invalid YAML, malformed IDs, illegal transitions, cyclic dependencies, and stale approvals produce deterministic errors. CLI maps these to non-zero exit codes and concise messages.

## Test Strategy

All behavior is developed test-first with Vitest. Unit tests exercise state transitions, artifact validation, approval invalidation, and dependency-cycle detection using real in-memory or temporary-directory adapters. Integration tests execute the public service API against a temporary repository. CLI tests invoke the command runner with a temporary working directory and assert output and exit status. No test asserts private implementation details.

## MVP Delivery Sequence

1. Establish package tooling and test harness.
2. Add domain values and storage ports.
3. Implement YAML metadata and JSONL event persistence.
4. Implement canonical artifact paths, content validation, and hashing.
5. Implement Delivery creation and guarded state transitions.
6. Implement Requirement, Design, and Spec Gates plus approval behavior.
7. Expose `init`, `new`, `status`, `approve`, and `verify` through the service and CLI.
8. Add `next` context resolution and Spec Pack execution transitions.

Each item must include a red-green-refactor test cycle and end with all relevant tests passing.

## Global Constraints

- Node.js 20+ and ESM TypeScript.
- Vitest is the test runner; Zod validates persisted schemas; YAML is used for configuration and metadata.
- Workflow code must never branch on an Agent name; it consumes capability information only.
- State changes are only legal through validated workflow actions.
- V1 has no remote service dependency.
