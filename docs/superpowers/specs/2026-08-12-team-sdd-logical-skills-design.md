# Team SDD Logical Skills Design

## Goal

Implement Team SDD's three agent-agnostic logical skills as shared Artifact templates and writing contracts that are consumable by CLI and Agent Runtime without embedding a model provider in the npm package.

## Scope

### In scope

- `requirement-analysis`, `technical-design`, and `spec-split` Skill definitions.
- Canonical Markdown template rendering from current Delivery and Spec metadata.
- `sdd template requirement`, `sdd template design`, and `sdd template spec` commands.
- Runtime Prompt enrichment for the three self-developed logical skills.
- Tests ensuring templates contain exact required sections, no prohibited placeholders, and consistent CLI/Runtime output.

### Out of scope

- Calling an LLM, starting an Agent, or writing an Artifact automatically.
- Native Codex, Claude, or CodeBuddy Skill installation.
- Templates for implementation planning, coding, verification, MCP, or CI.

## Architecture

`src/skills` is a pure definition layer. Each Skill Definition provides the logical skill name, Artifact kind, required sections, a renderer, and its canonical `sdd submit` command. CLI template commands and Runtime Prompt building both resolve the same definition from the registry, preventing content drift.

```text
sdd template / agent context
            |
       skill registry
       /            \
template renderer   submission command
       |
canonical Markdown instruction
```

The CLI only reads metadata and prints a rendered template. It never writes the Artifact. The Agent writes the canonical path and invokes the existing `sdd submit` command; Gates remain the final authority.

## Models

```ts
type TemplateArtifactKind = 'requirement' | 'design' | 'spec';

type SkillDefinition = {
  logicalSkill:
    | 'requirement-analysis'
    | 'technical-design'
    | 'spec-split';
  artifactKind: TemplateArtifactKind;
  requiredSections: readonly string[];
  renderTemplate(input: {
    delivery: DeliveryMetadata;
    spec?: SpecSummary;
  }): string;
  submissionCommand(input: { deliveryId: DeliveryId; specId?: SpecId }): string;
};
```

The registry rejects a Logical Skill without a self-developed definition. `spec-split` requires a Spec Pack and rejects an omitted `specId`; Requirement and Design reject a supplied `specId`.

## Artifact Contracts

| Logical Skill | Artifact | Required headings | Submission |
| --- | --- | --- | --- |
| `requirement-analysis` | `requirement.md` | Source, Understanding, Scope, Business Rules, Questions, Answers, Baseline | `sdd submit <delivery> requirement` |
| `technical-design` | `design.md` | System Boundary, Overall Architecture, Module Design, Data Model, API, Core Flow, Permissions, Error Handling, Performance, Security, Observability, Deployment, Compatibility / Migration, Test Strategy, Technical Risks | `sdd submit <delivery> design` |
| `spec-split` | `<spec>/spec.md` | Goal, Requirement Sources, Scope, Out of Scope, Acceptance Criteria, Dependencies, Constraints, Expected Impact | `sdd submit <delivery> spec --spec <spec>` |

Templates use explanatory prose, not `TBD` or `TODO`. They include Delivery title and ID; the Spec template also includes Spec title, metadata dependencies, and acceptance criteria as declared context. A template instructs the Agent to replace the guidance with concrete content before submission.

## Runtime Prompt Enrichment

When `logicalSkill` resolves to a registry definition, Agent Context appends:

1. `## Artifact Template` containing the exact template output.
2. `## Submission` containing the exact submission command.

The existing Prompt rules remain unchanged. When the logical skill is not self-developed, no template section is added. This is deterministic and read-only.

## CLI

```text
sdd template requirement <deliveryId>
sdd template design <deliveryId>
sdd template spec <deliveryId> --spec <specId>
```

All commands write a template to stdout and return exit code 0. Invalid artifact names, missing required `--spec`, a missing Delivery, a missing Spec Pack, and using a Spec ID with Requirement or Design return exit code 1. A template may be previewed outside its current workflow activity; it is labelled `Preview only: current activity is <activity>` if it cannot be submitted in the current activity.

## Test Strategy

Unit tests resolve all definitions and assert the exact required headings, contextual Delivery/Spec values, and absence of case-insensitive `TBD`/`TODO`. Runtime tests assert the template and submission command are present only for the three self-developed skills. CLI tests invoke `runCli` against temporary metadata and compare stdout to `SkillDefinition.renderTemplate`, proving both callers share the same definition.

## Constraints

- Node.js 20+, ESM TypeScript, Vitest, Zod, YAML, and Commander only.
- No model provider, Agent name, or external process may appear in Skill definitions.
- Template generation and Agent Context remain read-only.
- All new behavior must be implemented test-first.
