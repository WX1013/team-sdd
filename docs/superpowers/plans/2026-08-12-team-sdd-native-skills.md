# Team SDD Native Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three independently discoverable Team SDD Plugin Skills that guide governed Requirement, Technical Design, and Spec splitting work.

**Architecture:** Add three sibling Skill folders below the existing plugin `skills/` directory. Each concise `SKILL.md` delegates workflow authority to the existing MCP server while specialising the analysis and artifact-writing procedure for one activity. Each companion `agents/openai.yaml` supplies UI metadata and an explicit invocation prompt. The existing generic `team-sdd` Skill remains unchanged as the delivery-wide entry point.

**Tech Stack:** Codex Plugin Skill format, Markdown, YAML, Team SDD stdio MCP tools, Python validation scripts.

## Global Constraints

- Keep all new files under `plugins/team-sdd/skills/`.
- Do not modify Team SDD Core, Gate rules, plugin manifest, MCP configuration, marketplace metadata, or existing generic Skill.
- Start all specialist work with `sdd_get_context`; write only returned artifact paths; submit only through `sdd_submit_artifact`.
- Use no deferred-work placeholder markers.
- Validate each Skill independently before proceeding to the next one.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `plugins/team-sdd/skills/requirement/SKILL.md` | Guide source analysis, clarification, and Requirement Baseline submission. |
| `plugins/team-sdd/skills/requirement/agents/openai.yaml` | Expose Requirement Skill UI metadata. |
| `plugins/team-sdd/skills/technical-design/SKILL.md` | Guide concrete Design decisions and Design submission. |
| `plugins/team-sdd/skills/technical-design/agents/openai.yaml` | Expose Technical Design Skill UI metadata. |
| `plugins/team-sdd/skills/spec-split/SKILL.md` | Guide vertical Spec Pack splitting and Spec submission. |
| `plugins/team-sdd/skills/spec-split/agents/openai.yaml` | Expose Spec Split Skill UI metadata. |

### Task 1: Create and validate `team-sdd:requirement`

**Files:**
- Create: `plugins/team-sdd/skills/requirement/SKILL.md`
- Create: `plugins/team-sdd/skills/requirement/agents/openai.yaml`

**Interfaces:**
- Consumes: `sdd_get_context(root, deliveryId, capabilities)` output for the Requirement activity.
- Produces: a governed Requirement artifact with `Source`, `Understanding`, `Scope`, `Business Rules`, `Questions`, `Answers`, and `Baseline` sections; `sdd_submit_artifact` submission.

- [ ] **Step 1: Record a no-specialist-skill baseline**

Ask an agent to turn an ambiguous request into a Requirement without the new Skill. Record whether it omits exclusions, business-rule IDs, unresolved questions, or a stable baseline. Use the observed omissions to keep the new Skill focused.

- [ ] **Step 2: Write the specialist contract**

Create `SKILL.md` with frontmatter:

```yaml
---
name: requirement
description: Use when a Team SDD Delivery is in requirement analysis and needs source clarification, scope boundaries, business rules, or a submit-ready Requirement Baseline.
---
```

Require Context-first operation; prescribe the canonical headings; require concise blocking-question follow-up before Baseline; forbid invented answers; and require Gate-finding resolution before re-submission.

- [ ] **Step 3: Add deterministic UI metadata**

Create `agents/openai.yaml` with these values:

```yaml
interface:
  display_name: "Team SDD Requirement"
  short_description: "Clarify and baseline requirements"
  default_prompt: "Use $requirement to turn this Team SDD Delivery into a clarified, submit-ready Requirement Baseline."
```

- [ ] **Step 4: Validate the Skill**

Run: `python3 /Users/wangx/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/team-sdd/skills/requirement`

Expected: exit code 0 and no frontmatter or naming findings.

### Task 2: Create and validate `team-sdd:technical-design`

**Files:**
- Create: `plugins/team-sdd/skills/technical-design/SKILL.md`
- Create: `plugins/team-sdd/skills/technical-design/agents/openai.yaml`

**Interfaces:**
- Consumes: `sdd_get_context(root, deliveryId, capabilities)` output for Technical Design and an approved Requirement Baseline.
- Produces: a governed Design artifact covering every canonical design heading; `sdd_submit_artifact` submission.

- [ ] **Step 1: Record a no-specialist-skill baseline**

Ask an agent to draft a Technical Design without the new Skill. Record missing decision evidence, API/data contracts, risks, or test strategy. Use the omissions to keep the new Skill’s heading and decision guidance concrete.

- [ ] **Step 2: Write the specialist contract**

Create `SKILL.md` with frontmatter:

```yaml
---
name: technical-design
description: Use when a Team SDD Delivery needs a concrete, governed Technical Design after Requirement Baseline approval, including architecture, interfaces, risks, and validation strategy.
---
```

Require the approved baseline as input; require all fifteen canonical headings; direct the agent to state decisions, alternatives rejected only when material, constraints, and validation evidence; and redirect unresolved product decisions to Requirement clarification.

- [ ] **Step 3: Add deterministic UI metadata**

Create `agents/openai.yaml` with these values:

```yaml
interface:
  display_name: "Team SDD Technical Design"
  short_description: "Create an implementation-ready design"
  default_prompt: "Use $technical-design to produce a concrete, governed Technical Design for this Team SDD Delivery."
```

- [ ] **Step 4: Validate the Skill**

Run: `python3 /Users/wangx/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/team-sdd/skills/technical-design`

Expected: exit code 0 and no frontmatter or naming findings.

### Task 3: Create and validate `team-sdd:spec-split`

**Files:**
- Create: `plugins/team-sdd/skills/spec-split/SKILL.md`
- Create: `plugins/team-sdd/skills/spec-split/agents/openai.yaml`

**Interfaces:**
- Consumes: `sdd_get_context(root, deliveryId, capabilities)` output for Spec splitting, the approved Requirement Baseline, Technical Design, and active Spec Pack metadata.
- Produces: a governed Spec artifact per Pack with `Goal`, `Requirement Sources`, `Scope`, `Out of Scope`, `Acceptance Criteria`, `Dependencies`, `Constraints`, and `Expected Impact`; `sdd_submit_artifact` submission.

- [ ] **Step 1: Record a no-specialist-skill baseline**

Ask an agent to split a multi-part change without the new Skill. Record whether the result creates horizontal layers, circular dependencies, non-observable acceptance criteria, or Pack scopes that cannot be independently delivered.

- [ ] **Step 2: Write the specialist contract**

Create `SKILL.md` with frontmatter:

```yaml
---
name: spec-split
description: Use when a Team SDD Delivery needs an approved Requirement and Design divided into independently deliverable Spec Packs with scope, dependencies, and observable acceptance criteria.
---
```

Require Context-first operation; prescribe one vertical outcome per Pack; require Requirement source traceability and `AC-<number>` criteria; reject circular dependencies and unverifiable criteria; and require separate submission of each Pack artifact.

- [ ] **Step 3: Add deterministic UI metadata**

Create `agents/openai.yaml` with these values:

```yaml
interface:
  display_name: "Team SDD Spec Split"
  short_description: "Split work into deliverable Spec Packs"
  default_prompt: "Use $spec-split to split this Team SDD Delivery into independently deliverable, governed Spec Packs."
```

- [ ] **Step 4: Validate the Skill**

Run: `python3 /Users/wangx/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/team-sdd/skills/spec-split`

Expected: exit code 0 and no frontmatter or naming findings.

### Task 4: Validate the packaged plugin

**Files:**
- Verify: `plugins/team-sdd/.codex-plugin/plugin.json`
- Verify: all files created in Tasks 1–3

**Interfaces:**
- Consumes: the plugin’s existing `skills: "./skills/"` discovery path.
- Produces: one valid plugin exposing the generic and three specialist Skills.

- [ ] **Step 1: Check all paths and prohibited placeholders**

Run: `rg -n -i '\\b(TBD|TODO)\\b' plugins/team-sdd/skills/requirement plugins/team-sdd/skills/technical-design plugins/team-sdd/skills/spec-split`

Expected: exit code 1 with no matches.

- [ ] **Step 2: Validate plugin manifest and child skills**

Run: `python3 /Users/wangx/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/team-sdd`

Expected: exit code 0, a valid manifest, and discovery of all four Skill folders.

- [ ] **Step 3: Inspect final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the design, plan, and six native-Skill files are newly added by this work.

## Plan Self-Review

- [x] Spec coverage: Tasks 1–3 implement exactly the three specialist flows; Task 4 verifies package discovery without changing Core.
- [x] Placeholder scan: The plan contains no deferred work markers and provides exact paths, metadata, commands, expected outcomes, and user-facing prompts.
- [x] Interface consistency: Every specialist Skill consumes Context and submits only through the existing Team SDD MCP contract.
