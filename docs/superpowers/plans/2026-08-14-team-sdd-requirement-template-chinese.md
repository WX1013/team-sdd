# Team SDD Requirement Chinese Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Chinese Requirement artifacts, preserve arbitrary PRD identifiers, and verify their coverage in Design and Spec artifacts.

**Architecture:** The native Requirement Skill identifies an identifier in source PRD content and writes it as an exact `编号：<值>` marker. The Core never interprets that value's syntax: coverage helpers extract marker values from Requirements and compare them with markers in Design and Spec coverage sections. Legacy artifacts without markers retain `REQ-*`/`BR-*` fallback detection.

**Tech Stack:** TypeScript, Vitest, Markdown, YAML, Team SDD Core Gate APIs.

## Global Constraints

- Do not add a deterministic Core parser for external PRD files or change Delivery transitions.
- Use Chinese headings in new Requirement templates: `来源`, `需求理解`, `范围`, `业务规则`, `问题`, `答复`, `需求基线`.
- Preserve a PRD identifier exactly in `编号：<值>`; generate `REQ-<number>` or `BR-<number>` only when no identifier is identifiable.
- Require the same exact marker in Design `Requirement Coverage` and Spec `Requirement Sources`.
- Accept legacy English and new Chinese Requirement Gate headings and unresolved-question markers.

---

### Task 1: Write failing template and coverage tests

**Files:**
- Modify: `tests/skills/registry.test.ts`
- Modify: `tests/gates/coverage.test.ts`
- Modify: `tests/gates/requirements.test.ts`

**Interfaces:**
- Consumes: `renderTemplate`, `requirementIds`, `coverageFindingIds`, and `evaluateRequirementGate`.
- Produces: test contracts for Chinese authoring, arbitrary marker values, legacy fallback identifiers, and bilingual Requirement headings.

- [ ] **Step 1: Assert the Chinese Requirement template**

```ts
expect(template).toContain('## 来源');
expect(template).toContain('## 需求理解');
expect(template).toContain('## 范围');
expect(template).toContain('## 业务规则');
expect(template).toContain('## 问题');
expect(template).toContain('## 答复');
expect(template).toContain('## 需求基线');
expect(template).toContain('编号：');
expect(template).not.toContain('REQ-001');
expect(template).not.toContain('BR-001');
```

- [ ] **Step 2: Assert exact, format-independent coverage markers**

```ts
const requirement = '## 范围\n\n- 编号：订单导出-2.3\n- 编号：ORD_EXPORT_A\n- 编号：订单导出-2.3';
expect(requirementIds(requirement)).toEqual(['订单导出-2.3', 'ORD_EXPORT_A']);
expect(coverageFindingIds(['订单导出-2.3', 'ORD_EXPORT_A'], '## Requirement Coverage\n\n- 编号：订单导出-2.3')).toEqual(['ORD_EXPORT_A']);
expect(requirementIds('- REQ-001\n- BR-001')).toEqual(['REQ-001', 'BR-001']);
```

- [ ] **Step 3: Add Chinese Gate tests**

Add a complete Chinese Requirement containing `来源`, `范围`, `问题`, and `需求基线`; assert only approval is missing. Add another with `状态：未解决`; assert `REQUIREMENT_BLOCKING_QUESTION` is present.

- [ ] **Step 4: Verify RED**

Run: `npm test -- tests/skills/registry.test.ts tests/gates/coverage.test.ts tests/gates/requirements.test.ts`

Expected: FAIL because the template is English and pre-seeds identifiers, coverage only recognizes `REQ-*`/`BR-*`, and the Requirement Gate recognizes only English headings.

### Task 2: Implement marker-aware coverage and Chinese template

**Files:**
- Modify: `src/gates/coverage.ts`
- Modify: `src/skills/requirement.ts`
- Modify: `src/skills/technical-design.ts`
- Modify: `src/skills/spec-split.ts`

**Interfaces:**
- Produces: `requirementIds(markdown)` that first extracts exact `编号：<值>` lines and falls back to legacy identifiers when no markers exist; `coverageFindingIds(required, coveredText)` that uses the same marker parsing.

- [ ] **Step 1: Implement marker extraction**

```ts
const markerPattern = /^\s*-\s*编号\s*[:：]\s*(\S(?:.*?\S)?)\s*$/gm;
const legacyIdentifierPattern = /\b(?:REQ|BR)-\d+\b/g;

function markerIds(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(markerPattern)].map((match) => match[1]!.trim()))];
}
```

`requirementIds` returns marker values when present, otherwise legacy values. `coverageFindingIds` parses covered markers first; if none exist, it uses legacy values. Compare values with strict equality.

- [ ] **Step 2: Render Chinese Requirement guidance**

Change `requiredSections` and `renderTemplate` in `src/skills/requirement.ts` to Chinese headings. In `范围` and `业务规则`, instruct authors to write `- 编号：<PRD 原始编号>` for a discovered source identifier and use a fallback Team SDD identifier only when the PRD has none. Do not include a literal identifier example.

- [ ] **Step 3: Require marker-based downstream traceability**

Replace the literal `REQ-001`/`BR-001` coverage guidance in `technical-design.ts` with `- 编号：<Requirement 中的原始编号>` under `Requirement Coverage`. Replace the literal `REQ-001` source guidance in `spec-split.ts` with the same marker under `Requirement Sources`.

- [ ] **Step 4: Verify coverage and Registry tests**

Run: `npm test -- tests/skills/registry.test.ts tests/gates/coverage.test.ts`

Expected: PASS.

### Task 3: Implement bilingual Requirement Gate behavior

**Files:**
- Modify: `src/gates/requirements.ts`

**Interfaces:**
- Produces: existing Requirement finding codes with Chinese/English heading aliases and question-state aliases.

- [ ] **Step 1: Add a heading alias matcher**

Implement a local `hasHeading(markdown, aliases)` helper using an escaped exact H2 heading matcher. Use it for `['来源', 'Source']`, `['范围', 'Scope']`, and `['需求基线', 'Baseline']`. Keep `REQUIREMENT_BASELINE_MISSING` for a missing Baseline alias and preserve placeholder findings with `validateRequiredSections(markdown, [])`.

- [ ] **Step 2: Add question-state aliases**

Treat either `## Questions` followed by `Status: unresolved` or `## 问题` followed by `状态：未解决` / `状态: 未解决` as unresolved. Keep the existing finding code and approval behavior.

- [ ] **Step 3: Verify Gate tests**

Run: `npm test -- tests/gates/requirements.test.ts`

Expected: PASS; Chinese and legacy English sections pass structural validation, while an unresolved Chinese question blocks submission.

### Task 4: Update native Skill writing contracts

**Files:**
- Modify: `plugins/team-sdd/skills/requirement/SKILL.md`
- Modify: `plugins/team-sdd/skills/technical-design/SKILL.md`
- Modify: `plugins/team-sdd/skills/spec-split/SKILL.md`

**Interfaces:**
- Produces: PRD-aware, marker-preserving authoring guidance for all three native Skills.

- [ ] **Step 1: Update Requirement guidance**

State that the Skill identifies identifiers from labelled fields, Markdown tables, headings, and repeated source patterns; preserves the discovered value in `编号：<值>`; and creates `REQ-*`/`BR-*` fallback values only when none is identifiable.

- [ ] **Step 2: Update Design and Spec guidance**

Require Design `Requirement Coverage` and Spec `Requirement Sources` to copy every covered Requirement marker exactly. Explicitly prohibit changing the source identifier's spelling.

- [ ] **Step 3: Validate all three Skills**

Run: `for skill in requirement technical-design spec-split; do python3 /Users/wangx/.codex/skills/.system/skill-creator/scripts/quick_validate.py "plugins/team-sdd/skills/$skill" || exit 1; done`

Expected: exit code 0.

### Task 5: Run complete verification

**Files:**
- Verify: modified source, tests, Skills, and plugin files

- [ ] **Step 1: Scan for deferred-work placeholders**

Run: `rg -n -i '\\b(TBD|TODO)\\b' src/skills plugins/team-sdd/skills`

Expected: exit code 1 with no matches in modified templates or Skills.

- [ ] **Step 2: Run all verification commands**

Run: `npm test && npm run typecheck && npm run build && python3 /Users/wangx/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/team-sdd`

Expected: all tests pass, TypeScript compiles, the build succeeds, and the plugin validator reports valid.

- [ ] **Step 3: Inspect changes**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and no unintended modifications to pre-existing user work.

## Plan Self-Review

- [x] Spec coverage: Tasks 1–4 implement Chinese authoring, semantic identifier preservation, structured marker coverage, legacy compatibility, and native Skill guidance.
- [x] Placeholder scan: Marker spellings appear only in exact validation commands.
- [x] Type consistency: Existing exported Gate functions and Delivery transitions remain unchanged.
