# Agent Status UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every installed Team SDD Agent render the PRD Status UX instead of exposing raw MCP JSON.

**Architecture:** The Core MCP server remains the authoritative structured-data boundary. The three project Agent command templates call Core context and status tools, then render one common textual view from the returned delivery, activity, blockers, and required-artifact data. No workflow state is mutated.

**Tech Stack:** Markdown Agent commands, Vitest template-contract tests, TypeScript package templates.

## Global Constraints

- Keep Core as the sole workflow authority; commands must not change `.sdd`, Delivery metadata, approvals, or Event Log files.
- Claude Code and CodeBuddy retain `/sdd:status`; Codex retains `/sdd-status`.
- Never render raw MCP JSON in the user-facing status response.
- Render the PRD §52 sections: Workflow, Spec Packs, Current, Plan when available, and Next.
- When blockers exist, include each Core finding's message and `→ nextStep` beneath the status; do not invent blockers.

---

### Task 1: Lock the cross-Agent Status rendering contract

**Files:**
- Modify: `tests/agents/template-contract.test.ts`
- Modify: `tests/integrations/native-agent-artifacts.test.ts`

**Interfaces:**
- Consumes: the existing `sdd_status` and `sdd_get_context` command templates.
- Produces: a regression contract that rejects the previous `Present/Return the Core result unchanged` behavior and requires the Status UX instructions.

- [x] **Step 1: Write failing tests**

```ts
expect(command).toContain('Do not show raw MCP JSON');
expect(command).toContain('Workflow');
expect(command).toContain('Spec Packs');
expect(command).toContain('Current');
expect(command).toContain('Next');
expect(command).toContain('→');
expect(command).not.toMatch(/(?:Present|Return) the Core result unchanged/);
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/agents/template-contract.test.ts tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL because each current status template requires an unchanged Core result.

- [x] **Step 3: Implement only the command-template instructions needed by the test**

Replace the unchanged-result instruction in each status template with a shared, explicit presentation contract that maps Core fields to the PRD headings, uses activity/spec state to mark the current step, includes plan progress only when available, and prints Core blockers as actionable items.

- [x] **Step 4: Re-run the focused test to verify it passes**

Run: `npm test -- tests/agents/template-contract.test.ts tests/integrations/native-agent-artifacts.test.ts`

Expected: PASS.

### Task 2: Verify the published-template behavior

**Files:**
- Modify: `templates/claude/commands/sdd/status.md`
- Modify: `templates/codebuddy/.codebuddy/commands/sdd/status.md`
- Modify: `templates/codex/plugins/team-sdd/skills/sdd-status/SKILL.md`

**Interfaces:**
- Consumes: `mcp__team-sdd__sdd_get_context` (`activity`, `blockers`, `artifacts`) and `mcp__team-sdd__sdd_status` (`delivery`).
- Produces: consistent human-facing slash/Skill command responses across Claude, CodeBuddy, and Codex.

- [x] **Step 1: Validate generated package templates**

Run: `npm run build && npm test`

Expected: build exits 0 and all template and workflow tests pass.

- [x] **Step 2: Inspect the package contents**

Run: `NPM_CONFIG_CACHE=/private/tmp/zbp-sdd-npm-cache npm run pack:check`

Expected: the three edited templates are included in the npm tarball.

- [x] **Step 3: Check the final diff**

Run: `git diff --check`

Expected: no whitespace errors.
