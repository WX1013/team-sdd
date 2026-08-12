# Team SDD Logical Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide shared, agent-agnostic Artifact templates for Team SDD requirement analysis, technical design, and Spec splitting through CLI and Runtime contexts.

**Architecture:** A pure Skill Registry maps the three self-developed logical skills to deterministic Markdown renderers and submission commands. `sdd template` reads metadata and prints the Registry's renderer output; Agent Context resolves the identical definition to enrich its Prompt. Neither component writes Artifacts or changes workflow state.

**Tech Stack:** Node.js 20+, ESM TypeScript, Vitest, Commander.

## Global Constraints

- Develop each behavior test-first with Vitest.
- Skill definitions have no model provider, Agent name, external process, or state-mutation code.
- Templates contain concrete writing guidance and may not contain `TBD` or `TODO`.
- Template and Agent Context generation remain read-only.
- Requirement and Design templates reject a Spec ID; Spec template requires a valid existing Spec Pack ID.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/skills/types.ts` | Skill Definition and template input contracts |
| `src/skills/requirement.ts` | Requirement template and submit command |
| `src/skills/technical-design.ts` | Design template and submit command |
| `src/skills/spec-split.ts` | Spec template and submit command |
| `src/skills/registry.ts` | Lookup from Logical Skill to Skill Definition |
| `src/runtime/agent-context.ts` | Optional template and submission Prompt enrichment |
| `src/cli.ts` | `sdd template` subcommands |
| `src/index.ts` | Public registry exports |
| `tests/skills/registry.test.ts` | Definition content and placeholder behavior |
| `tests/runtime/agent-context.test.ts` | Prompt enrichment behavior |
| `tests/cli.test.ts` | Template CLI output and validation |

### Task 1: Define and register the three self-developed Skills

**Files:**
- Create: `src/skills/types.ts`
- Create: `src/skills/requirement.ts`
- Create: `src/skills/technical-design.ts`
- Create: `src/skills/spec-split.ts`
- Create: `src/skills/registry.ts`
- Create: `tests/skills/registry.test.ts`

**Interfaces:**
- Produces `SkillDefinition`, `getSkillDefinition(skill)`, and `isSelfDevelopedSkill(skill)`.

- [ ] **Step 1: Write failing registry contract tests**

```ts
it('renders a Requirement template with all contract headings and no prohibited placeholders', () => {
  const definition = getSkillDefinition('requirement-analysis');
  const template = definition?.renderTemplate({ delivery });

  expect(template).toContain('## Understanding');
  expect(template).toContain('## Baseline');
  expect(template).not.toMatch(/\b(TBD|TODO)\b/i);
});

it('renders Spec context from the current Spec Pack and creates its submit command', () => {
  const definition = getSkillDefinition('spec-split');
  expect(definition?.renderTemplate({ delivery, spec })).toContain('SP-001 · Records');
  expect(definition?.submissionCommand({ deliveryId: 'DLV-001', specId: 'SP-001' })).toBe('sdd submit DLV-001 spec --spec SP-001');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/skills/registry.test.ts`

Expected: FAIL because the Skill Registry does not exist.

- [ ] **Step 3: Implement exact deterministic definitions**

```ts
export type SkillDefinition = {
  logicalSkill: 'requirement-analysis' | 'technical-design' | 'spec-split';
  artifactKind: 'requirement' | 'design' | 'spec';
  requiredSections: readonly string[];
  renderTemplate(input: TemplateInput): string;
  submissionCommand(input: { deliveryId: DeliveryId; specId?: SpecId }): string;
};
```

Render every required `##` heading from the approved design. Include contextual Delivery identity in every template; include Spec title, dependency IDs, and AC IDs in the Spec template. Use `Describe…`, `List…`, and `State…` guidance rather than prohibited placeholders.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/skills/registry.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/skills tests/skills
git commit -m "feat: add Team SDD logical skill definitions"
```

### Task 2: Enrich Agent Context from the shared Registry

**Files:**
- Modify: `src/runtime/agent-context.ts`
- Modify: `tests/runtime/agent-context.test.ts`

**Interfaces:**
- Consumes: Registry and `LogicalSkill`.
- Produces: Prompt `## Artifact Template` and `## Submission` sections only for self-developed Skills.

- [ ] **Step 1: Write failing context enrichment tests**

```ts
it('adds the registered Requirement template and submission command to Agent Context', () => {
  const context = buildAgentContext({ delivery, activity: 'REQUIREMENT', artifacts: [], blockers: [], capabilities: defaultCapabilities });

  expect(context.prompt).toContain('## Artifact Template');
  expect(context.prompt).toContain('## Understanding');
  expect(context.prompt).toContain('sdd submit DLV-001 requirement');
});

it('does not add a template for implementation planning', () => {
  const context = buildAgentContext({ delivery, activity: 'PLAN', artifacts: [], blockers: [], capabilities: defaultCapabilities });

  expect(context.prompt).not.toContain('## Artifact Template');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/runtime/agent-context.test.ts`

Expected: FAIL because Agent Context does not consult the Registry.

- [ ] **Step 3: Use Registry output inside Prompt assembly**

Resolve the definition from `logicalSkill`. For `spec-split`, select the active or first supplied Spec Summary; omit enrichment when no Spec Pack is present. Insert template and submission sections after Rules and before Blockers. Do not add a second template source.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/runtime/agent-context.test.ts && npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/agent-context.ts tests/runtime/agent-context.test.ts
git commit -m "feat: include logical skill contracts in agent context"
```

### Task 3: Expose read-only templates through CLI

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/index.ts`
- Modify: `tests/cli.test.ts`

**Interfaces:**
- Produces `sdd template requirement <deliveryId>`, `sdd template design <deliveryId>`, and `sdd template spec <deliveryId> --spec <specId>`.

- [ ] **Step 1: Write failing CLI output and error tests**

```ts
it('prints the same Requirement template the Registry renders', async () => {
  const result = await runCli(['template', 'requirement', 'DLV-001'], root);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('## Business Rules');
  expect(result.stdout).not.toMatch(/\b(TBD|TODO)\b/i);
});

it('rejects a Spec template without a Spec Pack ID', async () => {
  const result = await runCli(['template', 'spec', 'DLV-001'], root);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('requires --spec');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/cli.test.ts`

Expected: FAIL because `template` is unregistered.

- [ ] **Step 3: Register thin template command adapters**

Add a nested `template` command. Read Delivery metadata with `service.getStatus`; resolve exact Registry definition; for `spec`, require `--spec` and select the existing Spec Summary. Print a preview label if the Activity does not map to the selected template. Render with `definition.renderTemplate`; never call ArtifactStore, `submitArtifact`, or a transition from these handlers.

- [ ] **Step 4: Final verification and template smoke test**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

Run: `node dist/cli.js template requirement DLV-001`

Expected: Requirement Markdown template with Source through Baseline headings.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/index.ts tests/cli.test.ts
git commit -m "feat: expose Team SDD templates through CLI"
```

## Plan Self-Review

- [x] Spec coverage: Tasks 1-3 cover shared definitions, all required templates, Runtime prompt enrichment, CLI rendering, preview behavior, errors, and consistency tests.
- [x] Placeholder scan: Every task has named files, interfaces, real test behavior, commands, expected outcomes, and implementation guidance.
- [x] Type consistency: `SkillDefinition`, `TemplateInput`, `LogicalSkill`, and `AgentContext` match the approved design.
