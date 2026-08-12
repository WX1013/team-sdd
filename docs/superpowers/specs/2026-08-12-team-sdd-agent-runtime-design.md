# Team SDD Agent Runtime Design

## Goal

Add an agent-agnostic Runtime that turns the current Team SDD workflow context into a capability-aware, portable task instruction for Codex and future coding agents without binding workflow decisions to any agent name.

## Scope

### In scope

- Agent capability model and validation.
- Activity-to-logical-skill mapping.
- Capability-driven inline or subagent execution recommendation.
- A pure context resolver that combines workflow state, Gate blockers, capabilities, constraints, and a prompt.
- `sdd agent context <deliveryId>` with JSON and human-readable prompt output.
- A documented Codex invocation that supplies the capability flags.
- Tests for mapping, insufficient capabilities, strategy selection, and CLI output.

### Out of scope

- Running a Skill, starting a subagent, or generating Artifact content.
- Direct Claude, Codex, or CodeBuddy plugin installation.
- MCP server, Hook, CI, remote state, or external Agent RPC.

## Architecture

The Runtime receives a `NextResult` from the workflow service and a caller-provided `AgentCapabilities` value. It maps the activity to a logical skill, derives a recommended execution strategy from capabilities, and builds a deterministic Agent Context. The CLI only parses capability flags and renders this result.

```text
sdd agent context
       |
workflow getNext + status
       |
Runtime resolver
  |-- activity → logical skill
  |-- capabilities → execution strategy
  `-- constraints + blockers → portable prompt
```

The Runtime never calls a real Agent, never writes artifacts, and never modifies workflow state. `getNext` remains read-only.

## Models

```ts
type AgentCapabilities = {
  skills: boolean;
  slashCommands: boolean;
  subagents: boolean;
  worktrees: boolean;
  shell: boolean;
  fileRead: boolean;
  fileWrite: boolean;
  mcp: boolean;
};

type LogicalSkill =
  | 'requirement-analysis'
  | 'technical-design'
  | 'spec-split'
  | 'implementation-plan'
  | 'implementation'
  | 'verification';

type ExecutionStrategy = 'inline' | 'subagent';

type AgentContext = {
  activity: Activity;
  logicalSkill: LogicalSkill;
  execution: ExecutionStrategy;
  artifacts: string[];
  blockers: GateFinding[];
  constraints: string[];
  capabilityGaps: string[];
  prompt: string;
};
```

## Deterministic Rules

| Activity | Logical Skill |
| --- | --- |
| `REQUIREMENT` | `requirement-analysis` |
| `DESIGN` | `technical-design` |
| `SPEC_SPLIT` | `spec-split` |
| `PLAN` | `implementation-plan` |
| `CODE` | `implementation` |
| `CHECK` | `verification` |
| `DONE` | `verification` |

`execution` is `subagent` only when `subagents` is true; otherwise it is `inline`. A Runtime context requires `fileRead`, `fileWrite`, and `shell` to be actionable. Missing required capabilities are listed in `capabilityGaps`; the result remains descriptive and no error is thrown, so any client can explain how to resolve its environment.

## Prompt Contract

The generated prompt uses these fixed sections, in order:

1. `Team SDD Context`: Delivery ID, title, state, and activity.
2. `Task`: logical skill and execution recommendation.
3. `Artifacts`: canonical paths to read or write.
4. `Rules`: do not modify `delivery.yaml` state directly; do not append events; write only fixed Artifact paths; after writing, invoke `sdd submit` for the correct Artifact kind.
5. `Blockers`: current Gate findings, or `None`.
6. `Capability gaps`: missing required capabilities, or `None`.

The Prompt never asks an Agent to approve artifacts or bypass a Gate.

## CLI

```text
sdd agent context <deliveryId>
  [--json]
  [--subagents]
  [--skills]
  [--slash-commands]
  [--worktrees]
  [--mcp]
  [--no-shell]
  [--no-file-read]
  [--no-file-write]
```

Default capabilities set `shell`, `fileRead`, and `fileWrite` to true; every other capability defaults to false. Plain output is the prompt. `--json` serializes the complete `AgentContext` object. The Codex invocation is:

```text
sdd agent context DLV-001 --subagents --skills --worktrees --mcp
```

## Testing Strategy

Unit tests assert each Activity maps to the expected Logical Skill; subagent strategy is selected only from the `subagents` capability; and missing shell/file capabilities appear as gaps. A service integration test uses a temporary repository to assert the resolver preserves state. CLI tests assert `--json` is machine-readable and no-capability flags produce explanatory prompt output.

## Constraints

- Node.js 20+, ESM TypeScript, Vitest, Zod, YAML, and Commander only.
- Runtime behavior may not branch on an Agent name.
- Runtime is read-only and cannot transition state or invoke external tools.
- All new behavior is developed test-first.
