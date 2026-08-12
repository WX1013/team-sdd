# Team SDD Git Hook and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the fast repository Hook end-to-end and add an Agent-neutral GitHub Actions Trust Gate that both reuse unified verification.

**Architecture:** The already-installed executable Hook delegates to the installed `sdd` binary. CI uses `npm run verify:ci` after build and never reimplements SDD checks. This plan executes only after the audit/CLI plan provides `verify --hook`, `verify --ci`, `verify:ci`, and `installGitHook`.

**Tech Stack:** Node.js 20+, ESM TypeScript, Vitest, Git, GitHub Actions YAML.

## Global Constraints

- The Hook only runs `sdd verify --hook`; never tests, builds, approves, or changes state.
- Git configuration uses `git config --local core.hooksPath .githooks` only in the target repository.
- CI runs the fixed Node 20 workflow and `npm run verify:ci`; it contains no Agent-specific behavior.

---

### Task 1: Prove a Hook rejects invalid workflow integrity

**Files:** Create `tests/integrations/git-hook.test.ts`; no production source change expected unless the test exposes a defect.

- [ ] **Step 1: Write a failing end-to-end Hook test.**

```ts
it('rejects a commit when Hook verification finds an invalid event log', async () => {
  await prepareBuiltSddDependency(root);
  await installGitHook(root);
  await appendFile(join(root, '.sdd/events/DLV-001.jsonl'), 'not-json\n');
  const attempt = await runGit(root, ['commit', '--allow-empty', '-m', 'invalid']);
  expect(attempt.exitCode).not.toBe(0);
  expect(attempt.stderr).toContain('EVENT_LOG_INVALID');
});
```

- [ ] **Step 2: Run the end-to-end test to verify RED.**

Run: `npm run build && npm test -- tests/integrations/git-hook.test.ts`

Expected: FAIL until the temporary repository exposes the built `sdd` binary through `node_modules/.bin`.

- [ ] **Step 3: Implement only the test fixture needed to expose the built CLI.**

Create a symlink or platform-safe wrapper in the temporary repository’s `node_modules/.bin/sdd` that executes this project’s `dist/cli.js`. Keep production Hook content unchanged; it must remain usable by an npm-installed package.

- [ ] **Step 4: Re-run Hook integration tests.**

Run: `npm run build && npm test -- tests/integrations/git-hook.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Hook protocol verification.**

```bash
git add tests/integrations/git-hook.test.ts
git commit -m "test: verify Team SDD Hook rejects invalid workflow"
```

### Task 2: Add the GitHub Actions Trust Gate

**Files:** Create `.github/workflows/team-sdd.yml`; create `tests/ci-workflow.test.ts`; modify `README.md`.

- [ ] **Step 1: Write failing workflow wiring test.**

```ts
it('runs the Team SDD CI verifier after building on push and pull requests', async () => {
  const workflow = parse(await readFile('.github/workflows/team-sdd.yml', 'utf8')) as Record<string, unknown>;
  expect(workflow).toHaveProperty('on');
  expect(JSON.stringify(workflow)).toContain('node-version: 20');
  expect(JSON.stringify(workflow)).toContain('npm run verify:ci');
});
```

- [ ] **Step 2: Run workflow test to verify RED.**

Run: `npm test -- tests/ci-workflow.test.ts`

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Add the minimal CI workflow.**

```yaml
name: Team SDD CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npm run verify:ci
```

Document that CI validates repository trust and does not replace existing PR review.

- [ ] **Step 4: Run the wiring test and full local verification.**

Run: `npm test -- tests/ci-workflow.test.ts && npm run typecheck && npm run build && npm run verify:ci`

Expected: PASS.

- [ ] **Step 5: Commit the CI Trust Gate.**

```bash
git add .github/workflows/team-sdd.yml tests/ci-workflow.test.ts README.md
git commit -m "ci: add Team SDD trust gate"
```

## Plan self-review

- [x] Hook creation, local Git config, real rejected commit, CI wiring, and CI command are each independently tested.
- [x] Hook and CI both delegate to unified verification and do not duplicate Gate logic.
