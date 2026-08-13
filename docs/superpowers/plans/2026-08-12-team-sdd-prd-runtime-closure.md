# Team SDD PRD Runtime Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every remaining Team SDD V1 PRD gap in Logical Skill Runtime, Design Decision, Gate semantics, NEXT/Status UX, and capability-driven Agent integration.

**Architecture:** Workflow remains provider-agnostic. A pure route/config layer resolves Activity to a Team SDD or Superpowers provider and actual Skills; Agent Context renders the resulting instructions without starting external agents. Stable requirement identifiers let Design, Spec, Plan, and Check Gates prove coverage and evidence rather than only checking file presence.

**Tech Stack:** TypeScript ESM, Node.js 20+, Zod, YAML, Commander, MCP SDK, Vitest.

## Global Constraints

- Preserve V1 exclusions: no external Agent launch, no custom coding agent, no central state, no workflow DSL, no Git/PR replacement.
- The only V1 providers are `team-sdd` and `superpowers`; providers are resolved by the Runtime, never by Workflow transition code or Agent name.
- Default routes are exactly the PRD §38 mapping; all project route overrides must pass strict schema validation.
- `execution.strategy` supports only `auto`, `inline`, `subagent`; a forced unsupported `subagent` blocks explicitly and never silently claims success.
- All Agent-generated state changes go through existing Core approval/submission APIs; templates must not directly modify metadata/event files.
- Requirement coverage is defined by stable `REQ-###` and `BR-###` identifiers. No Gate may claim 100% coverage if any identifier is absent from its required coverage map.
- Gate findings always include a stable code, target artifact, concise explanation, and exact repair next step.
- Every behavior change uses RED → GREEN → refactor. Run focused tests, `npm run typecheck`, `npm run build`, `npm test`, and `node dist/cli.js verify --ci` before completion.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/runtime/skill-routes.ts` | Logical Skill route types, exact defaults, route schema and merge. |
| `src/runtime/skill-runtime.ts` | Capability-driven provider/adapter/execution resolution. |
| `src/config/project-config.ts` | Strict persisted config including optional `logical_skills`. |
| `src/runtime/capabilities.ts` | Strategy-aware execution and runtime capability gaps. |
| `src/runtime/agent-context.ts` | Provider/Skill runtime section in Agent Context. |
| `src/workflow/agent-context-service.ts` | Reads project config and injects resolved runtime. |
| `src/domain/types.ts` / `src/storage/local-repositories.ts` | Design recommendation impacts and strict metadata persistence. |
| `src/workflow/service.ts` | Design assessment/decision APIs, structured Delivery Check, plan progress. |
| `src/gates/coverage.ts` | Parse stable requirement IDs and coverage rows. |
| `src/gates/requirements.ts` / `src/gates/specs.ts` | Requirement/Design/Spec/Plan/Check Gate semantics. |
| `src/skills/*.ts` | Requirement/Design/Spec template contracts that expose coverage syntax. |
| `src/cli.ts` / `src/mcp/tools.ts` | Design commands, resolved `next`, context, and Status progress output. |
| `templates/{claude,codebuddy,codex}/...` | Capability/runtime-consuming Agent command instructions. |
| `tests/runtime/*.test.ts`, `tests/gates/*.test.ts`, `tests/workflow/*.test.ts`, `tests/cli*.test.ts`, `tests/mcp/*.test.ts`, `tests/agents/*.test.ts` | TDD coverage for each public behavior. |

### Task 1: Define and persist Logical Skill routes

**Files:**
- Create: `src/runtime/skill-routes.ts`
- Modify: `src/config/project-config.ts`
- Modify: `src/index.ts`
- Create: `tests/runtime/skill-routes.test.ts`
- Modify: `tests/config/project-config.test.ts`

**Interfaces:**

```ts
export type SkillProvider = 'team-sdd' | 'superpowers';
export type LogicalSkillRoute = { provider: SkillProvider; skills: readonly string[] };
export type LogicalSkillRoutes = Readonly<Record<LogicalSkill, LogicalSkillRoute>>;
export const defaultLogicalSkillRoutes: LogicalSkillRoutes;
export function mergeLogicalSkillRoutes(overrides?: Partial<LogicalSkillRoutes>): LogicalSkillRoutes;
```

- [ ] **Step 1: Write failing route/config tests.**

```ts
it('uses the exact PRD Superpowers defaults', () => {
  expect(defaultLogicalSkillRoutes.implementation).toEqual({
    provider: 'superpowers',
    skills: ['test-driven-development', 'subagent-driven-development'],
  });
  expect(defaultLogicalSkillRoutes.verification.skills).toEqual([
    'requesting-code-review', 'verification-before-completion',
  ]);
});

it('merges one valid project override without dropping default routes', async () => {
  await writeProjectConfig(root, {
    ...defaultProjectConfig,
    logicalSkills: { implementation: { provider: 'superpowers', skills: ['test-driven-development'] } },
  });
  expect((await readProjectConfig(root)).logicalSkills?.implementation.skills).toEqual(['test-driven-development']);
});

it('rejects an unknown provider, duplicate skill, and skill-plus-skills route', async () => {
  await writeFile(configPath, invalidYaml);
  await expect(readProjectConfig(root)).rejects.toMatchObject({ code: 'INVALID_PROJECT_CONFIG' });
});
```

- [ ] **Step 2: Run RED.**

Run: `npm test -- tests/runtime/skill-routes.test.ts tests/config/project-config.test.ts`

Expected: FAIL because route types, defaults, and strict config schema do not exist.

- [ ] **Step 3: Implement routes and config schema.**

Create exact defaults:

```ts
'requirement-analysis': { provider: 'team-sdd', skills: ['requirement'] }
'technical-design': { provider: 'team-sdd', skills: ['technical-design'] }
'spec-split': { provider: 'team-sdd', skills: ['spec-split'] }
'implementation-plan': { provider: 'superpowers', skills: ['writing-plans'] }
implementation: { provider: 'superpowers', skills: ['test-driven-development', 'subagent-driven-development'] }
verification: { provider: 'superpowers', skills: ['requesting-code-review', 'verification-before-completion'] }
```

Use object keys matching the existing hyphenated `LogicalSkill` values at the YAML boundary. Accept either one `skill` or an array `skills`, normalize to `skills`, and reject all other provider/Skill combinations. Extend `ProjectConfig` with optional `logicalSkills`; retain a minimal default `config.yaml` with no override block so existing initialized repositories remain valid.

- [ ] **Step 4: Run GREEN.**

Run: `npm test -- tests/runtime/skill-routes.test.ts tests/config/project-config.test.ts && npm run typecheck`

Expected: PASS; old config remains readable and valid overrides merge deterministically.

- [ ] **Step 5: Commit.**

```bash
git add src/runtime/skill-routes.ts src/config/project-config.ts src/index.ts tests/runtime/skill-routes.test.ts tests/config/project-config.test.ts
git commit -m "feat: add PRD logical skill routes"
```

### Task 2: Resolve provider, adapter fallback, and execution strategy

**Files:**
- Create: `src/runtime/skill-runtime.ts`
- Modify: `src/runtime/capabilities.ts`
- Modify: `src/runtime/agent-context.ts`
- Modify: `src/workflow/agent-context-service.ts`
- Modify: `tests/runtime/agent-context.test.ts`
- Create: `tests/runtime/skill-runtime.test.ts`

**Interfaces:**

```ts
export type AdapterMode = 'native-skill' | 'mcp' | 'prompt';
export type ResolvedSkillRuntime = {
  logicalSkill: LogicalSkill;
  provider: SkillProvider;
  skills: readonly string[];
  execution: 'inline' | 'subagent';
  adapter: AdapterMode | undefined;
  instructions: readonly string[];
  blockers: readonly GateFinding[];
};
export function resolveSkillRuntime(input: {
  activity: Activity;
  routes: LogicalSkillRoutes;
  strategy: ProjectExecutionStrategy;
  capabilities: AgentCapabilities;
}): ResolvedSkillRuntime;
```

- [ ] **Step 1: Write failing resolver tests.**

```ts
it('resolves PLAN to Superpowers writing-plans via native Skill support', () => {
  expect(resolveSkillRuntime({ activity: 'PLAN', routes: defaultLogicalSkillRoutes, strategy: 'auto', capabilities: capable }))
    .toMatchObject({ provider: 'superpowers', skills: ['writing-plans'], adapter: 'native-skill', execution: 'subagent' });
});

it('uses MCP then prompt fallback without checking an Agent name', () => {
  expect(resolveSkillRuntime({ activity: 'CODE', routes: defaults, strategy: 'inline', capabilities: { ...capable, skills: false } }).adapter).toBe('mcp');
  expect(resolveSkillRuntime({ activity: 'CODE', routes: defaults, strategy: 'inline', capabilities: { ...capable, skills: false, mcp: false } }).adapter).toBe('prompt');
});

it('blocks a forced unsupported subagent strategy', () => {
  const resolved = resolveSkillRuntime({ activity: 'CODE', routes: defaults, strategy: 'subagent', capabilities: { ...capable, subagents: false } });
  expect(resolved.blockers).toEqual([expect.objectContaining({ code: 'EXECUTION_STRATEGY_UNAVAILABLE' })]);
});
```

- [ ] **Step 2: Run RED.**

Run: `npm test -- tests/runtime/skill-runtime.test.ts tests/runtime/agent-context.test.ts`

Expected: FAIL because no runtime resolver or strategy-aware Agent Context exists.

- [ ] **Step 3: Implement pure resolution.**

Resolve execution as follows: `auto` selects `subagent` only with capability; `inline` always selects inline; `subagent` with no capability sets inline for safe display and adds only `EXECUTION_STRATEGY_UNAVAILABLE`. Select adapter native → MCP → prompt using exactly the documented capabilities. Prompt fallback requires shell/fileRead/fileWrite, otherwise emits `SKILL_RUNTIME_CAPABILITY_MISSING` listing missing capabilities.

Instruction lines must identify provider and exact Skill names, say `invoke superpowers:<skill>` for Superpowers, and always end with the canonical artifact/submission boundary supplied by Agent Context. Do not execute any process.

Make `AgentContextService` read `service.getConfig()` and pass the merged routes plus configured strategy into `buildAgentContext`. Add `skillRuntime` to JSON context and a `## Skill Runtime` human prompt section.

- [ ] **Step 4: Run GREEN.**

Run: `npm test -- tests/runtime/skill-runtime.test.ts tests/runtime/agent-context.test.ts && npm run typecheck`

Expected: PASS; every Activity has a resolved provider, no `if Claude/Codex/CodeBuddy` branch exists, and forced strategy failure is explicit.

- [ ] **Step 5: Commit.**

```bash
git add src/runtime src/workflow/agent-context-service.ts tests/runtime
git commit -m "feat: resolve provider-backed skill runtime"
```

### Task 3: Make Design Decision recommendation and human decision auditable

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/storage/local-repositories.ts`
- Modify: `src/workflow/service.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/server.ts`
- Modify: `src/cli.ts`
- Modify: `tests/workflow/service.test.ts`
- Modify: `tests/mcp/tools.test.ts`
- Modify: `tests/cli.test.ts`

**Interfaces:**

```ts
export type DesignImpact = 'architecture_change' | 'database_schema_change' | 'public_api_change' | 'external_integration_change' | 'security_change' | 'permission_change' | 'deployment_change' | 'cross_module_change' | 'data_migration';
export type DesignRecommendation = 'RECOMMENDED' | 'NOT_RECOMMENDED';
export type DesignDecision = { required: boolean; reason: string; recommendation: DesignRecommendation; impacts: readonly DesignImpact[] };
export function assessDesign(input: { deliveryId: DeliveryId; impacts: readonly DesignImpact[]; reason: string }): Promise<DesignDecision>;
export function decideDesign(input: { deliveryId: DeliveryId; required: boolean; reason: string; approvedBy: string }): Promise<CommandResult>;
```

- [ ] **Step 1: Write failing recommendation/decision tests.**

```ts
it('recommends Design for a feature with a public API impact but does not advance state', async () => {
  const assessment = await service.assessDesign({ deliveryId: 'DLV-001', impacts: ['public_api_change'], reason: 'Adds an endpoint' });
  expect(assessment).toMatchObject({ recommendation: 'RECOMMENDED', required: false });
  expect((await service.getStatus({ deliveryId: 'DLV-001' })).delivery.state).toBe('REQUIREMENT');
});

it('records only a human Design decision and audits it', async () => {
  await service.decideDesign({ deliveryId: 'DLV-001', required: false, reason: 'Approved narrow change', approvedBy: 'reviewer' });
  expect(await service.events({ deliveryId: 'DLV-001' })).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'design.decided' })]));
});
```

- [ ] **Step 2: Run RED.**

Run: `npm test -- tests/workflow/service.test.ts tests/mcp/tools.test.ts tests/cli.test.ts`

Expected: FAIL because assessment/decision APIs and CLI/MCP commands do not exist.

- [ ] **Step 3: Implement bounded recommendation and decision.**

`assessDesign` only returns a recommendation and does not mutate metadata. `decideDesign` is the human mutation boundary, requires a non-empty approver/reason, preserves recommendation/impacts when present, and appends `design.decided`. APPLICATION_INIT rejects a non-required decision. Add `sdd design assess <delivery> --impact <impact...> --reason <reason>` and `sdd design decide <delivery> --required|--not-required --reason <reason> --by <human>` with mutually exclusive flags. Expose matching MCP methods and strict Zod inputs.

- [ ] **Step 4: Run GREEN.**

Run: `npm test -- tests/workflow/service.test.ts tests/mcp/tools.test.ts tests/cli.test.ts && npm run typecheck`

Expected: PASS; recommendation cannot change state and only human decision changes metadata.

- [ ] **Step 5: Commit.**

```bash
git add src/domain src/storage src/workflow/service.ts src/mcp src/cli.ts tests/workflow/service.test.ts tests/mcp/tools.test.ts tests/cli.test.ts
git commit -m "feat: add auditable Design decisions"
```

### Task 4: Enforce Requirement-to-Design-to-Spec coverage

**Files:**
- Create: `src/gates/coverage.ts`
- Modify: `src/skills/requirement.ts`
- Modify: `src/skills/technical-design.ts`
- Modify: `src/skills/spec-split.ts`
- Modify: `src/gates/requirements.ts`
- Modify: `src/gates/specs.ts`
- Modify: `tests/gates/requirements.test.ts`
- Modify: `tests/gates/specs.test.ts`
- Modify: `tests/skills/registry.test.ts`

**Interfaces:**

```ts
export function requirementIds(markdown: string): readonly string[];
export function coveredRequirementIds(markdown: string, heading: 'Requirement Coverage' | 'Requirement Sources'): readonly string[];
export function coverageFindings(input: { required: readonly string[]; covered: readonly string[]; artifact: string; code: string; label: string }): GateFinding[];
```

- [ ] **Step 1: Write failing coverage tests.**

```ts
it('rejects Design that omits a stable Requirement ID', async () => {
  await writeRequirement('REQ-001 ...\nBR-001 ...');
  await writeDesign('## Requirement Coverage\n\n- REQ-001');
  await expect(evaluateDesignGate(input)).resolves.toMatchObject({ ok: false, findings: [expect.objectContaining({ code: 'DESIGN_REQUIREMENT_COVERAGE_MISSING' })] });
});

it('requires the union of Spec Requirement Sources to cover every Requirement ID', async () => {
  await writeSpecs({ 'SP-001': 'REQ-001', 'SP-002': 'BR-001' });
  await expect(evaluateSpecGate(input)).resolves.toMatchObject({ ok: true });
});
```

- [ ] **Step 2: Run RED.**

Run: `npm test -- tests/gates/requirements.test.ts tests/gates/specs.test.ts tests/skills/registry.test.ts`

Expected: FAIL because IDs/coverage parsing and findings are absent.

- [ ] **Step 3: Implement canonical coverage parsing and template contracts.**

`requirementIds` extracts unique `REQ-\d+` and `BR-\d+` tokens only from Requirement Scope/Business Rules sections. Requirement Gate rejects a Requirement that has neither stable ID. Design Gate requires every ID under `## Requirement Coverage`. Spec Gate requires each Spec to cite at least one ID in `## Requirement Sources` and validates full union coverage. Keep existing headings and approvals. Update deterministic templates with exact coverage headings/examples and no placeholders.

- [ ] **Step 4: Run GREEN.**

Run: `npm test -- tests/gates/requirements.test.ts tests/gates/specs.test.ts tests/skills/registry.test.ts && npm run typecheck`

Expected: PASS; unknown IDs, omitted IDs, and partial coverage return actionable findings.

- [ ] **Step 5: Commit.**

```bash
git add src/gates src/skills tests/gates tests/skills
git commit -m "feat: enforce requirement coverage gates"
```

### Task 5: Complete Plan and Check Gate evidence semantics

**Files:**
- Modify: `src/gates/specs.ts`
- Modify: `src/workflow/service.ts`
- Modify: `tests/gates/specs.test.ts`
- Modify: `tests/workflow/delivery-submission.test.ts`
- Modify: `tests/workflow/spec-execution.test.ts`

**Interfaces:**

```ts
export type PlanTask = { title: string; body: string; completed: boolean };
export function parsePlanTasks(markdown: string): readonly PlanTask[];
export function planProgress(markdown: string): { completed: number; total: number };
```

- [ ] **Step 1: Write failing Plan/Check tests.**

```ts
it('rejects a Plan task without Test, Implementation, and Verification sections', async () => {
  await writePlan('### Task 1: API\n\n#### Test\n...\n\n#### Implementation\n...');
  await expect(evaluatePlanGate(input)).resolves.toMatchObject({ ok: false, findings: [expect.objectContaining({ code: 'PLAN_TASK_VERIFICATION_MISSING' })] });
});

it('rejects planning a Spec whose dependency is not DONE', async () => {
  await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'plan', specId: 'SP-002' })).rejects.toMatchObject({ code: 'SPEC_DEPENDENCY_NOT_READY' });
});

it('rejects Check evidence with an Important review issue or missing AC result', async () => {
  await writeCheck('## Code Review\n\nCritical Issues: 0\nImportant Issues: 1');
  await expect(evaluateCheckGate(input)).resolves.toMatchObject({ ok: false, findings: expect.arrayContaining([expect.objectContaining({ code: 'CHECK_REVIEW_IMPORTANT_ISSUES' })]) });
});
```

- [ ] **Step 2: Run RED.**

Run: `npm test -- tests/gates/specs.test.ts tests/workflow/delivery-submission.test.ts tests/workflow/spec-execution.test.ts`

Expected: FAIL because the current Gate only detects one generic verification word and unstructured Check strings.

- [ ] **Step 3: Implement exact task/evidence parsing.**

Parse Plan tasks by `### Task` headings. Each task must have `#### Test`, `#### Implementation`, and `#### Verification`; coverage of every `AC-###` is accepted only when at least one task body names it. Before plan acceptance, every declared dependency must have state DONE.

Require Check sections `Automated Verification`, `Acceptance Criteria`, `Code Review`, `Fresh Verification Evidence`. Require one `AC-###: PASS` line per active Spec acceptance criterion, `Critical Issues: 0`, `Important Issues: 0`, and non-empty fresh evidence. Preserve service evidence inputs for tests/build/static checks. Delivery Check additionally requires its structured sections plus current integration/regression/delivery acceptance inputs.

- [ ] **Step 4: Run GREEN.**

Run: `npm test -- tests/gates/specs.test.ts tests/workflow/delivery-submission.test.ts tests/workflow/spec-execution.test.ts && npm run typecheck`

Expected: PASS; failed Check stays CODE and successful Check emits CHECK → DONE events.

- [ ] **Step 5: Commit.**

```bash
git add src/gates/specs.ts src/workflow/service.ts tests/gates/specs.test.ts tests/workflow/delivery-submission.test.ts tests/workflow/spec-execution.test.ts
git commit -m "feat: complete plan and check gates"
```

### Task 6: Expose resolved runtime through CLI, MCP, NEXT, and Status

**Files:**
- Modify: `src/workflow/service.ts`
- Modify: `src/workflow/agent-context-service.ts`
- Modify: `src/cli.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/server.ts`
- Modify: `tests/cli.test.ts`
- Modify: `tests/cli-diagnostics.test.ts`
- Modify: `tests/mcp/tools.test.ts`
- Modify: `tests/mcp/server.test.ts`

**Interfaces:**

```ts
export type NextResult = {
  activity: Activity;
  requiredArtifacts: string[];
  blockers: GateFinding[];
  skillRuntime: ResolvedSkillRuntime;
  planProgress?: { completed: number; total: number };
};
```

- [ ] **Step 1: Write failing public-output tests.**

```ts
it('returns the same Superpowers runtime from CLI context and MCP context', async () => {
  const cli = JSON.parse((await runCli(['agent', 'context', 'DLV-001', '--json', '--skills'], root)).stdout);
  const mcp = await handlers.sdd_get_context({ root, deliveryId: 'DLV-001', capabilities: { skills: true } });
  expect(mcp).toMatchObject({ ok: true, data: { skillRuntime: cli.skillRuntime } });
});

it('renders next as a non-mutating provider instruction and Status plan progress', async () => {
  const next = await runCli(['next', 'DLV-001'], root);
  expect(next.stdout).toContain('Provider: superpowers');
  expect(next.stdout).toContain('writing-plans');
  expect((await runCli(['status', 'DLV-001'], root)).stdout).toContain('Plan\n1 / 2 tasks');
});
```

- [ ] **Step 2: Run RED.**

Run: `npm test -- tests/cli.test.ts tests/cli-diagnostics.test.ts tests/mcp/tools.test.ts tests/mcp/server.test.ts`

Expected: FAIL because NextResult has no runtime/progress and CLI/MCP cannot render them.

- [ ] **Step 3: Implement one resolved source of truth.**

Make `getNext` read project config, call `resolveSkillRuntime`, and return it with existing blockers. Make `sdd next` print Activity, Provider, Skills, Adapter, Execution, each runtime instruction, and blockers. It must not write artifacts, invoke a process, or transition state. Make Status render Plan progress only for active PLAN/CODE/CHECK with a plan file. Return identical `skillRuntime` in CLI JSON and MCP `sdd_get_context`.

- [ ] **Step 4: Run GREEN.**

Run: `npm test -- tests/cli.test.ts tests/cli-diagnostics.test.ts tests/mcp/tools.test.ts tests/mcp/server.test.ts && npm run typecheck && npm run build`

Expected: PASS; all consumers see the same resolved route and machine-readable output remains stable.

- [ ] **Step 5: Commit.**

```bash
git add src/workflow src/cli.ts src/mcp tests/cli.test.ts tests/cli-diagnostics.test.ts tests/mcp
git commit -m "feat: expose skill runtime through next and status"
```

### Task 7: Update project Agent templates and release documentation

**Files:**
- Modify: `templates/claude/commands/sdd/{next,status}.md`
- Modify: `templates/claude/skills/team-sdd/SKILL.md`
- Modify: `templates/codebuddy/.codebuddy/commands/sdd/{next,status}.md`
- Modify: `templates/codebuddy/.codebuddy/skills/team-sdd/SKILL.md`
- Modify: `templates/codex/plugins/team-sdd/skills/{sdd-next,sdd-status}/SKILL.md`
- Modify: `README.md`
- Modify: `tests/agents/template-contract.test.ts`
- Modify: `tests/integrations/native-agent-artifacts.test.ts`

**Interfaces:**
- Templates consume `skillRuntime.instructions` from `sdd_get_context`; no template declares a hard-coded `superpowers:` route.

- [ ] **Step 1: Write failing integration-template tests.**

```ts
it.each(agentNextTemplates)('uses Context Skill Runtime rather than a provider-specific branch: %s', async (path) => {
  const content = await readFile(path, 'utf8');
  expect(content).toContain('skillRuntime.instructions');
  expect(content).toContain('adapter');
  expect(content).not.toMatch(/if\s+(?:Claude|Codex|CodeBuddy)/i);
});
```

- [ ] **Step 2: Run RED.**

Run: `npm test -- tests/agents/template-contract.test.ts tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL because templates only describe static MCP calls.

- [ ] **Step 3: Update templates and Chinese docs.**

NEXT templates must call Context, display Activity/Provider/Skills/Adapter, execute the returned instruction through its supported adapter, and submit only through Core. STATUS templates must display Context/Status and Plan progress. Keep existing short command names, managed markers, MCP root configuration, and direct-mutation prohibition.

README documents defaults, optional `logical_skills` override, adapter fallback meaning, forced strategy failure recovery, Design assessment/decision, requirement coverage syntax, Plan/Check structured evidence, and all commands with Chinese examples. Do not document secret values or external Agent installation paths outside the existing project installer.

- [ ] **Step 4: Run GREEN and complete project verification.**

Run: `npm test -- tests/agents/template-contract.test.ts tests/integrations/native-agent-artifacts.test.ts && npm test && npm run typecheck && npm run build && npm --cache /private/tmp/zbp-sdd-npm-cache run pack:check && node dist/cli.js verify --ci`

Expected: PASS; all templates share Context-derived runtime behavior and the entire repository remains trusted.

- [ ] **Step 5: Commit.**

```bash
git add templates README.md tests/agents/template-contract.test.ts tests/integrations/native-agent-artifacts.test.ts
git commit -m "docs: complete provider-aware Agent workflow"
```

## Self-Review

### PRD coverage

- §8 Design Recommendation/human decision: Task 3.
- §10/§12/§15 coverage semantics: Task 4.
- §17–§22 Plan/Code/Check requirements: Tasks 2 and 5.
- §34/§38–§43 NEXT, Logical Skills, Skill Runtime, Agent Runtime, strategy and fallback: Tasks 1, 2, and 6.
- §52 Status plan progress: Task 6.
- §31–§32/§45 capability-driven integrations: Task 7.
- §47–§49 Hook/CI/verify already implemented and protected by final full verification; no duplicate CI mechanism is added.
- §54 V1 non-goals remain excluded by Global Constraints.

### Type consistency

`LogicalSkillRoute` normalizes all one/many Skill declarations to `skills`. `ResolvedSkillRuntime` is created only by `resolveSkillRuntime` and then moves unchanged through `NextResult`, `AgentContext`, CLI JSON, and MCP Context. `PlanTask`/`planProgress` are shared by Gate and Status paths.

### Placeholder scan

No implementation step depends on unspecified behavior: every public type, error code, command shape, test assertion, and verifier is named above.
