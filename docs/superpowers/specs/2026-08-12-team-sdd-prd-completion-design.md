# Team SDD PRD Completion Design

## Goal

Complete the unimplemented Team SDD V1 requirements from the product PRD without duplicating Workflow, Gate, artifact, or state-transition decisions across CLI, Git, CI, or Agent integrations.

## Scope

This delivery completes the PRD areas not covered by the existing Core, MCP, Codex Plugin, or logical Skill implementations:

- CLI diagnostics, inspection, event viewing, configuration, and constrained repair.
- Unified normal, Hook, and CI verification modes.
- Fast Gate Git Hook installation and validation.
- GitHub Actions CI Trust Gate.
- Repository-native Claude Code and CodeBuddy integrations.
- Detailed Status and Gate failure presentation.

Remote state, web UI, multi-repository Deliveries, custom workflows, and implementation of third-party planning or TDD skills remain out of scope as prescribed by the PRD.

## Architecture

### Repository audit layer

Add a read-only audit layer below the CLI and above existing Core services. It reads the local `.sdd/` and `sdd/deliveries/` structures, but delegates all artifact and Gate checks to existing `ArtifactStore`, Gate evaluators, and `SddService` methods.

The audit layer produces structured findings with a stable code, message, affected artifact or configuration path, and next step. It verifies:

- Config YAML is valid and contains a supported execution strategy.
- Every Delivery metadata file is readable and its event log is well-formed append-only JSONL.
- Event rows identify the correct Delivery and state transitions are legal.
- The final event-derived state agrees with stored Delivery metadata when a transition exists.
- Requirement, Design, and Spec approval hashes remain current.
- The active Delivery/Spec Gate is valid through existing Gate evaluation.

The audit layer does not change Delivery state, rewrite events, approve artifacts, or infer missing requirements.

### Verify modes

`sdd verify` gains a `mode` input:

| Mode | Entry point | Scope | Mutation |
| --- | --- | --- | --- |
| `normal` | `sdd verify <delivery>` | Current Gate and audit for one Delivery | None |
| `hook` | `sdd verify --hook` | Fast repository-integrity checks only | None |
| `ci` | `sdd verify --ci` | All Deliveries, audit, and configured checks | None |

Hook mode runs no project test suite. CI mode runs the whitelisted configuration commands `test`, `typecheck`, and `build` after repository verification. A nonzero command becomes a structured finding with the exact command and concise output. CI uses process execution without a shell and accepts only the fixed configuration command names, not arbitrary user strings.

### Diagnostics and controlled repair

`doctor` checks the runtime version, package commands, Team SDD configuration, Git availability, installed Hook file, and available integration artifacts. `doctor --fix` repairs only missing derived files: the Hook file and its Git `core.hooksPath` setting. It never modifies Delivery artifacts, metadata, approvals, or events.

`inspect <delivery>` exposes full Delivery metadata, resolved activity, active Spec, approval validity, and next context. `events <delivery>` shows parsed events in order. `config show` returns project configuration; `config set execution.strategy <auto|inline|subagent>` is the only supported config mutation. `repair <delivery> --dry-run` reports missing derived directories or templates, and `--apply` creates only the exact reported derived paths. It cannot repair state, approval, event, or authored Markdown content.

### Git and CI

`sdd init` writes a repository-owned `.githooks/pre-commit` that executes the package CLI with `verify --hook`, then configures only the current repository's `core.hooksPath` to `.githooks`. The Hook invokes no test or build command.

The GitHub Actions workflow runs on push and pull request with Node 20, dependency installation, and `npm run verify:ci`. Its only Team SDD action is the CI verification command, so its trust decision is Agent-neutral.

### Native Agent integrations

Check in source integration packages without installing user-global configuration:

```text
integrations/
├── claude-code/
│   ├── .claude-plugin/plugin.json
│   ├── .mcp.json
│   ├── commands/
│   └── skills/team-sdd/
└── codebuddy/
    └── .codebuddy/
        ├── commands/
        └── skills/team-sdd/
```

Claude Code packages native Slash Commands and a Skill through its plugin convention. CodeBuddy packages project-level commands and its Skill convention. Each command is a thin prompt adapter for one Logical Action (`new`, `next`, `approve`, `status`, `doctor`) and references the same local MCP server or CLI; it must direct the Agent to obtain `sdd_get_context` before authored Artifact work and submit through `sdd_submit_artifact`.

No integration may embed Gate logic, write Delivery YAML directly, or append events. Build artifacts are referenced using a repository-relative server path and are generated before local installation.

### CLI experience

`status` renders Delivery workflow milestones, every Spec Pack state, current activity, and the primary continuation command. Structured Gate findings render as the PRD-required actionable numbered list: the failed progression, count, message, and next step. JSON output remains available for integrations and testability.

## Data and public interfaces

New configuration schema:

```ts
type ProjectConfig = {
  version: 1;
  execution: { strategy: 'auto' | 'inline' | 'subagent' };
  checks: {
    test: readonly ['npm', 'test'];
    typecheck: readonly ['npm', 'run', 'typecheck'];
    build: readonly ['npm', 'run', 'build'];
  };
};
```

New audit types:

```ts
type AuditFinding = {
  code: string;
  message: string;
  artifact: string;
  nextStep: string;
};

type AuditResult = { ok: true } | { ok: false; findings: AuditFinding[] };
type VerifyMode = 'normal' | 'hook' | 'ci';
```

The service exposes `doctor`, `inspect`, `events`, `getConfig`, `setExecutionStrategy`, `repair`, and repository verification. Existing `verify({ deliveryId })` remains compatible and delegates to normal verification.

## Failure behavior

- Invalid command combinations, unsupported config values, and missing identifiers are deterministic Domain Errors.
- Audit/Gate/check command failures are normal structured findings and never advance state.
- Hook and CI failures exit nonzero and output actionable findings to stderr.
- Repair returns the proposed action list in dry-run; `--apply` is required for every write.
- Agent command errors direct users to `sdd doctor` or the equivalent underlying command, never inventing a transition.

## Testing

Implement every task test-first:

- Unit tests for config parsing, event integrity, transition reconciliation, mode selection, and repair scope.
- Temporary Git-repository integration tests for Hook installation and a rejected invalid commit.
- CLI tests for status, doctor, inspect, events, config, repair, and actionable failure messages.
- CI tests assert workflow command wiring rather than invoking GitHub.
- Native integration tests parse repository artifacts and verify command names, MCP/CLI delegation, and absence of direct state mutation instructions.

Final verification runs the full test suite, type check, build, plugin validation, Skill validation, and a temporary-repository Hook test.

## Decisions and constraints

- GitHub Actions is explicitly included as the CI runner.
- Claude Code and CodeBuddy source integration artifacts are included, but user-global installation is not performed.
- `repair` is intentionally limited to derived artifacts and cannot bypass the strong state machine.
- No external network service or remote state is introduced.
