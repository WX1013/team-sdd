# Team SDD Native Skills Design

## Goal

Package Team SDD's three self-developed logical capabilities as independently discoverable Codex Plugin Skills: `team-sdd:requirement`, `team-sdd:technical-design`, and `team-sdd:spec-split`.

## Structure

Keep the existing `team-sdd` Skill as the workflow-wide entry point. Add three sibling Skill directories under `plugins/team-sdd/skills/`, each with `SKILL.md` and `agents/openai.yaml`. The plugin manifest already discovers `./skills/`; no manifest change is required.

## Shared contract

Every specialist Skill starts by calling `sdd_get_context` with the target workspace and Delivery. It uses only the artifact paths and current activity returned by Context, resolves stated capability gaps and Gate blockers, and submits completed artifacts only through `sdd_submit_artifact`. It must not edit Delivery metadata, infer transitions, or approve artifacts without explicit authorization.

## Specialist flows

### Requirement

Turn source material into an implementation baseline. Capture the source, structured understanding, scope boundaries, identified business rules, and open questions. Ask concise clarification questions for unresolved blocking facts. Do not submit until Questions and Answers establish a stable Baseline.

### Technical Design

Turn an approved Requirement Baseline into implementation-ready decisions. State concrete decisions and validation evidence for the canonical design headings: system boundary, architecture, modules, data, APIs, flows, permissions, errors, performance, security, observability, deployment, compatibility, tests, and technical risks. Surface conflicts or missing requirement decisions instead of inventing product behavior.

### Spec Split

Split the approved baseline and design into independently deliverable Spec Packs. Each Pack has one outcome, explicit Requirement Sources, scope boundaries, observable `AC-<number>` acceptance criteria, dependencies, constraints, and expected repository impact. Prefer vertical slices; keep cross-Pack dependencies directional and minimal. Treat circular dependencies or an unverifiable acceptance criterion as a reason to revise the split.

## Validation

Validate each Skill directory with `quick_validate.py`, validate the parent plugin with `validate_plugin.py`, and inspect the final file set. Since this task is documentation-only, no runtime TypeScript behavior changes are required.

## Non-goals

Do not modify Team SDD Core workflow, Gates, or TypeScript logical Skill definitions. Do not create a marketplace entry or change installation configuration.
