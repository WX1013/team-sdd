# Team SDD Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, capability-driven Agent Runtime and `sdd agent context` command that produce a portable execution context for any coding agent.

**Architecture:** Pure Runtime functions map workflow activities to logical skills and agent capabilities to a recommended execution strategy. A context service reads the existing workflow state through `SddService`, combines it with Runtime output, and returns an `AgentContext`; the CLI parses flags and renders that result without changing artifacts or state.

**Tech Stack:** Node.js 20+, ESM TypeScript, Vitest, Commander.

## Global Constraints

- All new behavior follows red-green-refactor with Vitest.
- Runtime modules may not branch on an Agent name.
- Runtime is read-only: it cannot call external tools, write files, append events, or transition workflow state.
- Default CLI capabilities enable only shell, file read, and file write.
- No MCP server or native Codex/Claude/CodeBuddy plugin is included in this phase.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/runtime/capabilities.ts` | Capability model, defaults, gaps, and strategy selection |
| `src/runtime/logical-skills.ts` | Activity-to-logical-skill mapping |
| `src/runtime/agent-context.ts` | Agent Context model and deterministic prompt builder |
| `src/workflow/agent-context-service.ts` | Read-only bridge from `SddService` to Agent Context |
| `src/cli.ts` | `sdd agent context` flag parsing and output |
| `src/index.ts` | Runtime public exports |
| `tests/runtime/agent-context.test.ts` | Mapping, capability gaps, execution strategy, prompt behavior |
| `tests/workflow/agent-context-service.test.ts` | Temporary repository read-only integration test |
| `tests/cli.test.ts` | JSON and plain context command behavior |

### Task 1: Implement capability and logical-skill Runtime functions

**Files:**
- Create: `src/runtime/capabilities.ts`
- Create: `src/runtime/logical-skills.ts`
- Create: `tests/runtime/agent-context.test.ts`

**Interfaces:**
- Produces `AgentCapabilities`, `defaultCapabilities`, `executionStrategyFor`, `capabilityGapsFor`, `LogicalSkill`, and `logicalSkillFor`.

- [ ] **Step 1: Write failing mapping tests**

```ts
it('maps PLAN to implementation-plan and recommends subagent only when supported', () => {
  expect(logicalSkillFor('PLAN')).toBe('implementation-plan');
  expect(executionStrategyFor({ ...defaultCapabilities, subagents: true })).toBe('subagent');
  expect(executionStrategyFor(defaultCapabilities)).toBe('inline');
});

it('reports missing filesystem and shell capabilities', () => {
  expect(capabilityGapsFor({ ...defaultCapabilities, shell: false, fileWrite: false })).toEqual([
    'shell',
    'fileWrite',
  ]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/runtime/agent-context.test.ts`

Expected: FAIL because Runtime modules do not exist.

- [ ] **Step 3: Implement pure Runtime values**

```ts
export const defaultCapabilities: AgentCapabilities = {
  skills: false, slashCommands: false, subagents: false, worktrees: false,
  shell: true, fileRead: true, fileWrite: true, mcp: false,
};

export function executionStrategyFor(capabilities: AgentCapabilities): ExecutionStrategy {
  return capabilities.subagents ? 'subagent' : 'inline';
}
```

Create an exhaustive `Record<Activity, LogicalSkill>` for all seven Activity values. `capabilityGapsFor` checks only `fileRead`, `fileWrite`, and `shell` in that fixed order.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/runtime/agent-context.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/capabilities.ts src/runtime/logical-skills.ts tests/runtime/agent-context.test.ts
git commit -m "feat: add capability-driven agent runtime"
```

### Task 2: Build deterministic Agent Context and prompt

**Files:**
- Create: `src/runtime/agent-context.ts`
- Modify: `tests/runtime/agent-context.test.ts`

**Interfaces:**
- Consumes: `Activity`, `GateFinding`, Agent Runtime functions.
- Produces `AgentContext` and `buildAgentContext(input)`.

- [ ] **Step 1: Write failing prompt contract tests**

```ts
it('builds a portable prompt with rules, blockers, and capability gaps', () => {
  const context = buildAgentContext({
    delivery: { id: 'DLV-001', title: 'Records', state: 'PLAN' },
    activity: 'PLAN', artifacts: ['sdd/deliveries/DLV-001/specs/SP-001/plan.md'],
    blockers: [{ code: 'PLAN_ARTIFACT_MISSING', message: 'Plan artifact is missing.', artifact: 'plan.md', nextStep: 'Create plan.md.' }],
    capabilities: { ...defaultCapabilities, fileWrite: false },
  });

  expect(context.prompt).toContain('Do not modify delivery.yaml state directly.');
  expect(context.prompt).toContain('Plan artifact is missing.');
  expect(context.prompt).toContain('fileWrite');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/runtime/agent-context.test.ts`

Expected: FAIL because `buildAgentContext` is absent.

- [ ] **Step 3: Implement immutable context and fixed prompt sections**

```ts
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
```

Render the six specified sections in order. Include `Blockers: None` and `Capability gaps: None` when arrays are empty. Use the exact Rules sentence from the approved design, including `sdd submit`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/runtime/agent-context.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/agent-context.ts tests/runtime/agent-context.test.ts
git commit -m "feat: build portable agent execution context"
```

### Task 3: Add a read-only Agent Context service

**Files:**
- Create: `src/workflow/agent-context-service.ts`
- Modify: `src/index.ts`
- Create: `tests/workflow/agent-context-service.test.ts`

**Interfaces:**
- Consumes: `SddService.getStatus`, `SddService.getNext`, and `AgentCapabilities`.
- Produces `createAgentContextService(service).getContext({ deliveryId, capabilities }): Promise<AgentContext>`.

- [ ] **Step 1: Write failing read-only integration test**

```ts
it('returns Requirement context without modifying Delivery state', async () => {
  const context = await contextService.getContext({ deliveryId: 'DLV-001', capabilities: defaultCapabilities });

  expect(context).toMatchObject({ activity: 'REQUIREMENT', logicalSkill: 'requirement-analysis', execution: 'inline' });
  await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ delivery: { state: 'REQUIREMENT' } });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/workflow/agent-context-service.test.ts`

Expected: FAIL because the Agent Context service is absent.

- [ ] **Step 3: Implement service composition**

```ts
export function createAgentContextService(service: SddService): AgentContextService {
  return {
    async getContext(input) {
      const [{ delivery }, next] = await Promise.all([
        service.getStatus({ deliveryId: input.deliveryId }),
        service.getNext({ deliveryId: input.deliveryId }),
      ]);
      return buildAgentContext({ delivery, activity: next.activity, artifacts: next.requiredArtifacts, blockers: next.blockers, capabilities: input.capabilities });
    },
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/workflow/agent-context-service.test.ts && npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workflow/agent-context-service.ts src/index.ts tests/workflow/agent-context-service.test.ts
git commit -m "feat: expose read-only agent context service"
```

### Task 4: Add `sdd agent context` CLI output

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/cli.test.ts`

**Interfaces:**
- Produces `sdd agent context <deliveryId>` with all approved capability flags and `--json`.

- [ ] **Step 1: Write failing CLI tests**

```ts
it('prints machine-readable Codex-capable Agent Context', async () => {
  const result = await runCli(['agent', 'context', 'DLV-001', '--json', '--subagents', '--skills', '--worktrees', '--mcp'], root);

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ execution: 'subagent', logicalSkill: 'requirement-analysis' });
});

it('explains disabled file-write capability in prompt output', async () => {
  const result = await runCli(['agent', 'context', 'DLV-001', '--no-file-write'], root);

  expect(result.stdout).toContain('Capability gaps:\nfileWrite');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/cli.test.ts`

Expected: FAIL because `agent context` is unregistered.

- [ ] **Step 3: Register the thin CLI adapter**

Initialize `createAgentContextService(service)` inside `runCli`. Register the nested `agent context` command; merge default capabilities with true capability flags and false `--no-*` flags. On `--json`, append `JSON.stringify(context, null, 2)` plus newline to stdout; otherwise append `context.prompt` plus newline. Do not add workflow logic to CLI.

- [ ] **Step 4: Run final verification and Codex-context smoke test**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

Run: `node dist/cli.js agent context DLV-001 --subagents --skills --worktrees --mcp --json`

Expected: valid JSON with `execution` equal to `subagent`.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat: add agent context CLI"
```

## Plan Self-Review

- [x] Spec coverage: Tasks 1-4 implement capability validation, logical-skill mapping, strategy, prompt, read-only service, CLI flags, JSON, and plain output.
- [x] Placeholder scan: Steps contain concrete interfaces, tests, commands, expected RED/GREEN outcomes, and implementation details.
- [x] Type consistency: `AgentCapabilities`, `LogicalSkill`, `ExecutionStrategy`, `AgentContext`, and `AgentContextService` match the approved design.
