# Team SDD PRD Runtime Closure Design

## Goal

Complete the remaining Team SDD V1 PRD behavior: resolve every Logical Skill through a provider and actual Skills, honor project execution strategy, make Agent fallback capability-driven, complete Requirement-to-Check gate semantics, and expose the resulting runtime plan consistently through CLI, MCP, and project-level Agent integrations.

## Scope

### Included

- Configurable project-level Logical Skill routes with the PRD default Team SDD and Superpowers providers.
- A pure Skill Runtime resolver that returns provider, actual Skills, adapter mode, and execution instructions without launching an external Agent.
- Design Decision recommendations and final human decisions for feature changes.
- Requirement identifiers and Design/Spec coverage validation.
- Per-task Plan validation, dependency readiness, structured Check evidence, review severity checks, and fresh verification evidence.
- `next`, `sdd_get_context`, and Status output enriched from the same resolved runtime and plan progress model.
- Claude Code, Codex, and CodeBuddy templates that consume the resolved runtime instruction rather than duplicating provider logic.
- TDD and regression tests for all new behavior.

### Excluded

- Starting, installing, authenticating, or remotely controlling Claude, Codex, CodeBuddy, or Superpowers.
- New central state, web UI, custom workflow DSL, custom coding agent, or multi-repository Delivery.
- GitHub Actions behavior beyond the existing `sdd verify --ci` baseline.
- Publishing to Nexus; release validation remains a separate operator-authorized action.

## Current Gap Summary

The project already has Workflow Core, artifacts, state/event audit, approvals, CLI/MCP, native integrations, Hook, CI, and a partial Logical Skill implementation. The missing PRD behavior is concentrated in the boundary between Workflow Activity and Agent work:

```text
Current: Activity → Logical Skill label
Target:  Activity → Logical Skill → Provider → Actual Skill(s) → Adapter instruction
```

The current registry only defines the three Team SDD artifact templates. `implementation-plan`, `implementation`, and `verification` resolve to labels but have no provider route, actual Superpowers names, fallback path, or Agent-facing instruction. The configured `execution.strategy` is persisted but Agent Context currently derives execution only from capabilities.

## Architecture

### 1. Project Configuration

Extend `.sdd/config.yaml` with an optional `logical_skills` object. Omission uses `defaultLogicalSkillRoutes`; a provided route overrides exactly that Logical Skill. The schema rejects unknown Logical Skills, providers, empty skill lists, duplicate Skill names, and a simultaneous `skill` plus `skills` value.

```yaml
version: 1
execution:
  strategy: auto
logical_skills:
  requirement-analysis:
    provider: team-sdd
    skill: requirement
  technical-design:
    provider: team-sdd
    skill: technical-design
  spec-split:
    provider: team-sdd
    skill: spec-split
  implementation-plan:
    provider: superpowers
    skill: writing-plans
  implementation:
    provider: superpowers
    skills:
      - test-driven-development
      - subagent-driven-development
  verification:
    provider: superpowers
    skills:
      - requesting-code-review
      - verification-before-completion
checks:
  test: [npm, test]
  typecheck: [npm, run, typecheck]
  build: [npm, run, build]
```

The accepted providers are `team-sdd` and `superpowers`. `team-sdd` routes may name only `requirement`, `technical-design`, or `spec-split`; `superpowers` routes must declare the PRD default Skill names above. This keeps V1 provider-agnostic at the Workflow boundary without turning its configuration into an unbounded plugin loader.

### 2. Skill Runtime Resolver

Add `src/runtime/skill-runtime.ts`. It consumes the current Activity, merged project routes, capabilities, and configured execution strategy. It produces:

```ts
type AdapterMode = 'native-skill' | 'mcp' | 'prompt';

type ResolvedSkillRuntime = {
  logicalSkill: LogicalSkill;
  provider: 'team-sdd' | 'superpowers';
  skills: readonly string[];
  execution: 'inline' | 'subagent';
  adapter: AdapterMode;
  instructions: readonly string[];
  blockers: readonly GateFinding[];
};
```

Adapter selection is capability-driven only:

1. `native-skill` when `capabilities.skills` is true.
2. `mcp` when native Skill support is absent but `capabilities.mcp` is true.
3. `prompt` when Skills/MCP are unavailable but shell, file read, and file write are available.
4. A `SKILL_RUNTIME_CAPABILITY_MISSING` blocker otherwise.

For `auto`, use `subagent` only when `capabilities.subagents` is true. `inline` is always inline. `subagent` without subagent capability returns `EXECUTION_STRATEGY_UNAVAILABLE`; it must never silently claim a subagent execution path. The resolver never invokes Superpowers or writes state; it gives the active Agent exact provider/Skill instructions and canonical submission boundaries.

### 3. Design Decision

Feature Delivery metadata gains an optional recommendation, preserving the existing required/decision fields:

```ts
type DesignImpact =
  | 'architecture_change' | 'database_schema_change' | 'public_api_change'
  | 'external_integration_change' | 'security_change' | 'permission_change'
  | 'deployment_change' | 'cross_module_change' | 'data_migration';

type DesignDecision = {
  required: boolean;
  reason: string;
  recommendation: 'RECOMMENDED' | 'NOT_RECOMMENDED';
  impacts: readonly DesignImpact[];
};
```

`APPLICATION_INIT` always resolves Design as required. A feature recommendation is `RECOMMENDED` when at least one impact exists and `NOT_RECOMMENDED` otherwise. A human final decision is still required before Requirement can advance; an Agent recommendation cannot transition state. CLI and MCP add a read-only assessment result and a human decision command that emits an auditable event.

### 4. Coverage and Gates

Requirement templates require stable `REQ-###` entries in Scope and `BR-###` entries in Business Rules. These IDs form the canonical coverage set.

- `design.md` includes `## Requirement Coverage`; it must reference every Requirement ID for a Design Gate to pass.
- Every Spec `Requirement Sources` section references one or more Requirement IDs; the union of all Spec Packs must cover the full set before the Spec Gate can pass.
- Each Plan Task uses a `### Task` heading and contains `Test`, `Implementation`, and `Verification` subsections. Every Spec acceptance criterion has a Task reference, and a Spec cannot enter PLAN until every dependency is DONE.
- `check.md` has `Automated Verification`, `Acceptance Criteria`, `Code Review`, and `Fresh Verification Evidence` sections. It records `Critical Issues: 0` and `Important Issues: 0`; each acceptance criterion has a PASS entry; Check submission still requires the existing test/build/static evidence input.
- The Delivery Check keeps its existing integration/regression/delivery-acceptance evidence and additionally validates the structured delivery check artifact.

Gate findings use stable codes and actionable `nextStep` values. Failed Spec Check leaves the Spec in CODE; no extra failed state is introduced.

### 5. Context, NEXT, Status, and Integrations

`AgentContext` gains `skillRuntime`. Both CLI `sdd agent context --json` and MCP `sdd_get_context` return the same resolved structure. Human prompt output prints provider, actual Skill names, adapter mode, blockers, and canonical instructions.

`sdd next` remains non-mutating: it does not start an outside Agent. Instead it resolves the current workflow context and prints the exact skill runtime instruction that the caller’s Agent must execute. This makes NEXT the single continuation action while retaining the PRD boundary that MCP/Core does not implement Superpowers.

Status parses the active `plan.md`. It counts `### Task` sections as total tasks and counts a task as complete only when every checkbox in that Task body is checked. It renders `Plan\n<completed> / <total> tasks` for an active PLAN/CODE/CHECK Spec when a plan exists.

Claude Code, Codex, and CodeBuddy templates keep their short commands. Their NEXT and governed Skill text require `sdd_get_context`, render `skillRuntime.instructions`, select the returned adapter mode, then submit only through Core. No integration contains provider-specific state transition, Gate, artifact-path, or approval logic.

## Data Flow

```text
CLI / MCP / Agent short command
  → Workflow resolves Activity
  → Skill Runtime resolves project route + capabilities + execution strategy
  → Agent receives native-skill / MCP / prompt instruction
  → Agent writes only canonical Artifact path
  → sdd_submit_artifact
  → Artifact/Gate validation + Event append + State transition
```

## Testing

- Unit tests cover route-schema validation, merge defaults, each Activity route, adapter fallback order, forced strategy failures, and no external process execution.
- Workflow tests cover recommendation/final-decision distinction; Requirement/Design/Spec coverage; Plan task structure/dependency readiness; Spec/Delivery Check evidence and review severity failures.
- CLI/MCP tests assert equivalent resolved runtime data and non-mutating `next` output.
- Integration template tests assert all three Agent forms consume Context/runtime instructions and do not encode provider routes themselves.
- Existing full suite, typecheck, build, package dry-run, and `verify --ci` must remain green.

## Acceptance Criteria

1. All six PRD Logical Skills resolve to an explicit provider and actual Skill list.
2. Project configuration changes a route without changing Workflow transition code.
3. `execution.strategy` changes the resolved execution behavior and unsupported forced subagent execution blocks clearly.
4. Feature Design Recommendation and Human Decision are distinct and auditable.
5. Design and Spec Gates reject missing Requirement ID coverage.
6. Plan and Check Gates reject all missing PRD-required per-task/evidence/review conditions.
7. CLI, MCP, Claude, Codex, and CodeBuddy expose one consistent, capability-driven runtime instruction.
8. No module directly launches an external coding Agent or changes Workflow state outside Core submission/approval APIs.
