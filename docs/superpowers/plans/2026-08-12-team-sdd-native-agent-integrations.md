# Team SDD Native Agent Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship repository-native Claude Code and CodeBuddy command/Skill artifacts that delegate all Team SDD workflow decisions to the existing MCP server and CLI.

**Architecture:** Source-controlled integration packages contain only prompt adapters and local MCP configuration. Claude Code uses an official plugin layout; CodeBuddy uses its project command/Skill layout. A shared test suite reads the artifacts as a consumer and guarantees every action obtains context and forbids direct metadata/event mutation.

**Tech Stack:** Markdown, JSON, YAML, Vitest, official Claude Code and CodeBuddy project extension conventions.

## Global Constraints

- Commands may delegate to `sdd` or MCP but cannot describe or implement Gate/state logic.
- Authored artifact work starts with `sdd_get_context` and ends with `sdd_submit_artifact`.
- No global user configuration is written.
- Build the package before local plugin use so `dist/mcp-server.js` exists.

---

### Task 1: Add a reusable prompt-adapter contract and consumer tests

**Files:** Create `tests/integrations/native-agent-artifacts.test.ts`; create `integrations/README.md`.

**Interfaces:** Every generated command exposes one of `new`, `next`, `approve`, `status`, or `doctor` and includes a single action-focused frontmatter description. The shared Skill must describe the five-step governed workflow.

- [ ] **Step 1: Write failing integration artifact tests.**

```ts
it.each(['new', 'next', 'approve', 'status', 'doctor'])('%s is available for both Agents', async (action) => {
  await expect(readFile(`integrations/claude-code/commands/sdd-${action}.md`, 'utf8')).resolves.toContain('Team SDD');
  await expect(readFile(`integrations/codebuddy/.codebuddy/commands/sdd-${action}.md`, 'utf8')).resolves.toContain('Team SDD');
});

it('keeps Agent instructions governed by MCP context and submission', async () => {
  const skill = await readFile('integrations/claude-code/skills/team-sdd/SKILL.md', 'utf8');
  expect(skill).toContain('sdd_get_context');
  expect(skill).toContain('sdd_submit_artifact');
  expect(skill).not.toMatch(/write.*delivery\.yaml|append.*event/i);
});
```

- [ ] **Step 2: Run the test to verify RED.**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL because native integration packages do not exist.

- [ ] **Step 3: Write `integrations/README.md`.**

Describe the two source packages, their current official directory conventions, build prerequisite, and non-global local installation instructions. State that Agent integrations are thin adapters over the standard MCP server and cite the canonical repository-local MCP command.

- [ ] **Step 4: Keep test RED until concrete packages are added in the next tasks.**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL only for the absent concrete Agent files.

### Task 2: Add the Claude Code plugin, commands, and governed Skill

**Files:** Create `integrations/claude-code/.claude-plugin/plugin.json`, `integrations/claude-code/.mcp.json`, `integrations/claude-code/commands/sdd-{new,next,approve,status,doctor}.md`, `integrations/claude-code/skills/team-sdd/SKILL.md`.

- [ ] **Step 1: Extend the failing tests with Claude manifest expectations.**

```ts
it('declares a Claude Code plugin with commands, Skill, and local MCP configuration', async () => {
  const manifest = JSON.parse(await readFile('integrations/claude-code/.claude-plugin/plugin.json', 'utf8'));
  expect(manifest.name).toBe('team-sdd');
  expect(manifest.mcpServers).toBe('./.mcp.json');
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL because Claude files are absent.

- [ ] **Step 3: Author the Claude package.**

Use a valid `.claude-plugin/plugin.json` with `name`, `version`, `description`, `commands`, `skills`, and `mcpServers`. Configure `.mcp.json` as stdio `node` plus a repository-relative path to `dist/mcp-server.js`.

Each command uses frontmatter with `description`, `argument-hint`, and `disable-model-invocation: true`. `sdd-new` collects Delivery ID/title/type; `sdd-approve` requires Delivery ID, artifact, and approver; the read actions require Delivery ID. Commands instruct Claude to call the corresponding MCP tool and present returned findings unchanged.

The Claude Skill uses the same five-step procedure as the Codex Skill: context, capability/Gate blockers, canonical paths, submit/retry, and no direct state/event change.

- [ ] **Step 4: Run artifact tests and JSON validation.**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts && node -e "JSON.parse(require('node:fs').readFileSync('integrations/claude-code/.claude-plugin/plugin.json', 'utf8'))"`

Expected: PASS.

- [ ] **Step 5: Commit the Claude Code integration.**

```bash
git add integrations/claude-code tests/integrations/native-agent-artifacts.test.ts integrations/README.md
git commit -m "feat: add Team SDD Claude Code integration"
```

### Task 3: Add CodeBuddy commands and governed Skill

**Files:** Create `integrations/codebuddy/.codebuddy/commands/sdd-{new,next,approve,status,doctor}.md`, `integrations/codebuddy/.codebuddy/skills/team-sdd/SKILL.md`; modify `tests/integrations/native-agent-artifacts.test.ts`.

- [ ] **Step 1: Extend the test with CodeBuddy-specific frontmatter and argument contract.**

```ts
it('uses CodeBuddy command metadata and positional arguments', async () => {
  const command = await readFile('integrations/codebuddy/.codebuddy/commands/sdd-approve.md', 'utf8');
  expect(command).toContain('argument-hint:');
  expect(command).toContain('$1');
  expect(command).toContain('$2');
  expect(command).toContain('$3');
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL because CodeBuddy files are absent.

- [ ] **Step 3: Author CodeBuddy project-level files.**

Use documented YAML frontmatter fields `description`, `argument-hint`, `allowed-tools`, and `disable-model-invocation: true`. Use CodeBuddy positional placeholders `$1`, `$2`, `$3` for explicit action inputs. Allow only the required read/MCP/shell operations; commands must never contain a direct state mutation instruction. The CodeBuddy Skill repeats the five governed MCP steps and maps failures to the action’s next repair step.

- [ ] **Step 4: Run complete native integration tests.**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the CodeBuddy integration.**

```bash
git add integrations/codebuddy tests/integrations/native-agent-artifacts.test.ts integrations/README.md
git commit -m "feat: add Team SDD CodeBuddy integration"
```

### Task 4: Document and verify all Agent entry points

**Files:** Modify `README.md`; modify `tests/package.test.ts` only if a public integration export is added.

- [ ] **Step 1: Write a failing documentation check.**

```ts
it('documents Codex, Claude Code, and CodeBuddy integration locations', async () => {
  const readme = await readFile('README.md', 'utf8');
  expect(readme).toContain('Claude Code');
  expect(readme).toContain('CodeBuddy');
  expect(readme).toContain('integrations/');
});
```

- [ ] **Step 2: Run documentation test to verify RED.**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL because README lacks all native entry points.

- [ ] **Step 3: Document actual install/use paths only.**

Document Codex Plugin location, Claude package location and local plugin loading prerequisite, and CodeBuddy project `.codebuddy` directory placement. Do not claim that source artifacts were globally installed or that the package provides a remote Agent service.

- [ ] **Step 4: Execute final Agent integration verification.**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit documentation.**

```bash
git add README.md tests/integrations/native-agent-artifacts.test.ts
git commit -m "docs: document Team SDD native Agent integrations"
```

## Plan self-review

- [x] The plan covers Claude Code and CodeBuddy native Skills and commands plus documentation.
- [x] Every Agent command delegates to Core/MCP and tests prohibit direct workflow mutation guidance.
- [x] No user-global installation or platform-specific state is required.
