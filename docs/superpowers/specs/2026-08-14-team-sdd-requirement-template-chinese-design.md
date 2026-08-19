# Team SDD Requirement Chinese Template Design

## Goal

Make the Team SDD Requirement template Chinese-first, preserve identifiers already defined by a product PRD, and carry those identifiers through Design and Spec coverage without imposing an identifier format.

## Scope

Update the logical Requirement template, native Requirement/Design/Spec writing contracts, identifier coverage helpers, Requirement Gate heading validator, and their tests. Do not add a deterministic Core PRD parser or alter Delivery transitions.

## Template

Render the existing seven Requirement sections in Chinese: `来源`, `需求理解`, `范围`, `业务规则`, `问题`, `答复`, and `需求基线`. Keep the Markdown heading level and Delivery identity unchanged. Replace English writing guidance with Chinese instructions and do not pre-populate `REQ-001` or `BR-001` examples.

## Identifier policy

The Requirement Skill semantically identifies explicit PRD identifiers from labelled fields, tables, headings, and repeated source patterns. Treat the selected identifier as authoritative and copy it exactly into a structured `编号：<值>` line in the corresponding Requirement entry; do not rename, renumber, or create a parallel `REQ-*` identifier. If a source item has no identifiable value, assign the next `REQ-<number>` identifier; for an unnumbered business rule, assign `BR-<number>`. Keep assigned values stable within the artifact.

## Format-independent coverage

The Core does not infer identifiers from a PRD. It extracts complete values from `编号：<值>` lines in `requirement.md` and requires the exact same structured line in Design `Requirement Coverage` and Spec `Requirement Sources`. The marker, not the identifier's spelling, is the machine contract; any non-empty value is supported. A repeated identifier is deduplicated. This keeps coverage deterministic while allowing the Requirement Skill to preserve arbitrary source conventions.

## Gate compatibility

The Requirement Gate must accept either Chinese or legacy English names for each of its current mandatory headings: `来源` or `Source`, `范围` or `Scope`, and `需求基线` or `Baseline`. It must treat a heading pair as one logical requirement and report a Chinese missing-section message for the Chinese template. Existing English artifacts must continue to pass without rewrites. Preserve the unresolved-question and approval semantics; recognize both `Status: unresolved` and `状态：未解决` in their corresponding headings.

## Skill contract

The native Requirement Skill must inspect the PRD before drafting. It must explicitly state the semantic source-identifier-first policy, write the selected identifier in the `编号：` marker, distinguish copied identifiers from Team SDD-assigned fallback identifiers, and preserve existing rules for scope clarification, unresolved questions, Baseline freeze, Core submission, and Gate findings. Native Design and Spec Skills must copy the exact marker value into their coverage/source sections.

## Verification

Update Registry tests to assert the seven Chinese headings, `编号：` guidance, absence of pre-seeded `REQ-001` and `BR-001`, absence of deferred-work placeholder tokens, and the unchanged submission command. Add unit tests for arbitrary structured identifiers and exact coverage matching. Add Gate tests for a Chinese artifact, a legacy English artifact, and a missing logical heading. Run the targeted tests, the full suite, type check, build, native Skill validation, and plugin validation.

## Non-goals

Do not add a deterministic Core parser for external PRD formats. Do not require rewriting existing English Requirement artifacts; Gate support for English headings remains a compatibility contract. Legacy artifacts without structured markers retain their current `REQ-*`/`BR-*` coverage behavior.
