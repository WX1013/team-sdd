# README Onboarding and Command Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the user README lead teams through installation, a desktop-Agent-first first Delivery, and a separately discoverable command reference.

**Architecture:** Keep the three existing top-level chapters and the existing project-local install commands. Reduce first-install prose to action and prerequisites, add an explicit package-and-adapter update path, and organize the workflow chapter around lifecycle, command use, governance, and configuration.

**Tech Stack:** Markdown, Vitest documentation-contract test, npm package files.

## Global Constraints

- Preserve the documented project-level commands for Claude Code, CodeBuddy, and Codex.
- Codex commands use `/sdd-*`; Claude Code and CodeBuddy commands use `/sdd:*`.
- Do not disclose registry credentials or place publishing instructions in the user README.
- Keep maintenance and Nexus-release material in `MAINTAINERS.md`.

---

### Task 1: Lock the onboarding documentation contract

**Files:**
- Modify: `tests/integrations/native-agent-artifacts.test.ts`

**Interfaces:**
- Consumes: root `README.md` as the user-facing npm package documentation.
- Produces: assertions for the update command, desktop Agent examples, and command-reference subsection.

- [x] **Step 1: Write the failing contract test**

```ts
expect(readme).toContain('### 更新 Team SDD');
expect(readme).toContain('npm install -D @zbp/sdd@latest');
expect(readme).toContain('### 命令参考');
expect(readme).toContain('### CodeBuddy 桌面程序');
expect(readme).toContain('### Codex 桌面程序');
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL because the existing README has no update subsection or command-reference subsection.

- [x] **Step 3: Rewrite only the README sections covered by the contract**

Shorten first installation to Node/Nexus setup, one command per Agent, reload instruction, and the version update path. Keep the first Delivery chapter Agent-oriented and make the desktop examples explicit. Add a command-reference subsection in chapter 3 before governance and configuration content.

- [x] **Step 4: Re-run the focused test to verify it passes**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: PASS.

### Task 2: Verify the published documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: package installation behavior and the documented command surface.
- Produces: README included in the npm package tarball.

- [x] **Step 1: Run full project verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: all tests pass and TypeScript compilation succeeds.

- [x] **Step 2: Verify npm package contents**

Run: `NPM_CONFIG_CACHE=/private/tmp/zbp-sdd-npm-cache npm run pack:check`

Expected: the tarball contains root `README.md` and no credentials.

- [x] **Step 3: Validate whitespace**

Run: `git diff --check`

Expected: no whitespace errors.
