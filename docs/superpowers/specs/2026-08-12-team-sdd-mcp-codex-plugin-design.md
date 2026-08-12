# Team SDD MCP and Codex Plugin Design

## Goal

Expose the existing Team SDD Core through a standard stdio MCP server and a repository-local Codex Plugin, allowing Codex and any MCP-capable coding agent to use governed Team SDD actions without duplicating workflow rules.

## Scope

### In scope

- A TypeScript stdio MCP server built with the official MCP SDK.
- MCP tools for Team SDD actions and Agent Context.
- Zod input validation and normalized tool result envelopes.
- Repository-local Codex Plugin manifest, MCP configuration, and a Team SDD Skill.
- Unit and protocol-level tests for the tool adapters.

### Out of scope

- Networked HTTP transport, authentication, a remote state store, Hooks, or CI.
- Native Claude and CodeBuddy plugin formats.
- Artifact content generation, human approval, or state changes outside the Core service.

## Architecture

The MCP layer is a thin stdio adapter. Each Tool creates an `SddService` for the explicit repository root, validates its input, calls one application service method, and serializes the result. It neither accesses local metadata directly nor performs Gate or transition decisions.

```text
Codex Plugin / any MCP Client
           |
      stdio MCP server
           |
  SddService + Agent Context Service
           |
       Team SDD Core
```

The Codex Plugin starts the built MCP server from `.mcp.json` and contains a concise Skill that tells Codex to retrieve context, modify only canonical Artifacts, submit through MCP, and respond to returned findings. The Skill does not reimplement Core logic.

## MCP Tools

| Tool | Core operation | State behavior |
| --- | --- | --- |
| `sdd_new` | `createDelivery` | May create Delivery |
| `sdd_next` | `getNext` | Read-only |
| `sdd_approve` | `approve` | May record human approval only when explicitly called by a human-controlled client |
| `sdd_status` | `getStatus` | Read-only |
| `sdd_verify` | `verify` | Read-only |
| `sdd_submit_artifact` | `submitArtifact` | May transition only through Core Gates |
| `sdd_get_context` | Agent Context service | Read-only |

The initial server uses stdio. The executable is `dist/mcp-server.js`; it reads no global configuration and requires an explicit absolute `root` input in every Tool call.

## Tool Contracts

```ts
type ToolResult<T> = {
  ok: boolean;
  data?: T;
  findings?: GateFinding[];
  error?: { code: string; message: string };
};

type NewInput = {
  root: string;
  id: string;
  title: string;
  type: 'APPLICATION_INIT' | 'FEATURE_CHANGE';
  design?: { required: boolean; reason: string };
};

type ContextInput = {
  root: string;
  deliveryId: string;
  capabilities?: Partial<AgentCapabilities>;
};

type SubmitInput = {
  root: string;
  deliveryId: string;
  kind: 'requirement' | 'design' | 'spec' | 'plan' | 'check';
  specId?: string;
  evidence?: VerificationEvidence;
};
```

All other action inputs include `root` plus the matching existing service fields. Tool Schemas use Zod and reject unknown types before invoking the service.

Gate blockers are normal tool results: `{ ok: false, findings }`, allowing the calling Agent to correct them. Domain and filesystem failures return `{ ok: false, error }` with `DomainError.code` when available; they do not crash the stdio server or appear as MCP protocol errors. Success returns `{ ok: true, data }`.

## Codex Plugin

```text
plugins/team-sdd/
├── .codex-plugin/plugin.json
├── .mcp.json
└── skills/team-sdd/
    ├── SKILL.md
    └── agents/openai.yaml
```

`.mcp.json` registers a local stdio server that executes the built package entry point from the plugin repository root. `plugin.json` has only validated Plugin metadata and its declared Skill/MCP configuration. The Plugin does not add an app or Hooks.

The Skill is triggered by Team SDD workflow requests. It follows this fixed procedure:

1. Call `sdd_get_context` with the active workspace's absolute root and Codex capabilities.
2. Address capability gaps and Gate blockers before writing.
3. Read and write only the Artifact paths returned in Context.
4. Call `sdd_submit_artifact` after Artifact work, then handle findings before reporting progress.
5. Never edit Delivery state, append events, call approval, or claim completion without a successful Core result.

## Testing Strategy

Tool-adapter unit tests call Tool handlers against a temporary repository and verify input validation, successful data envelopes, Gate finding envelopes, and normalized Domain Errors. A stdio protocol integration test starts `dist/mcp-server.js`, issues initialize and tool calls using the MCP client SDK, and verifies JSON results. Plugin validation uses the plugin-creator validator; Skill validation uses the skill-creator validator. Tests do not require a Codex session.

## Constraints

- Node.js 20+, ESM TypeScript, Vitest, Zod, Commander, and the official MCP TypeScript SDK.
- MCP must use stdio; no listening socket or external service is created.
- `root` is required and absolute for every Tool call.
- The MCP and Plugin layers never bypass or duplicate Core state/Gate logic.
- All behavior is implemented test-first.
