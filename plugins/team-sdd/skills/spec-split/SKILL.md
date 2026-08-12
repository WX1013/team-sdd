---
name: spec-split
description: Use when a Team SDD Delivery needs an approved Requirement and Design divided into independently deliverable Spec Packs with scope, dependencies, and observable acceptance criteria.
---

# Team SDD Spec Split

Divide an approved Requirement Baseline and Technical Design into small, governed vertical delivery units. A Spec Pack is useful only when it can be implemented, checked, and released with a clear outcome.

## Workflow

1. Call `sdd_get_context` with the workspace's absolute `root`, `deliveryId`, and available capabilities. Confirm that the Requirement Baseline and Technical Design are available. Use only the active Spec Pack and artifact paths returned by Context.
2. Identify user- or operator-visible outcomes. Prefer vertical slices that include the necessary API, data, behavior, and verification work; do not split merely by frontend, backend, or database layer.
3. For each Pack, complete the Context template: `Goal`, `Requirement Sources`, `Scope`, `Out of Scope`, `Acceptance Criteria`, `Dependencies`, `Constraints`, and `Expected Impact`.
4. Link each Pack to specific Requirement Baseline sections or `BR-<number>` rules. Give every acceptance criterion a stable `AC-<number>` identifier and phrase it as an observable outcome with a pass/fail boundary.
5. List only real prerequisite Packs or external dependencies. Keep dependencies directional, minimize them, and revise the split when it creates a cycle. A Pack that cannot demonstrate value without another Pack is not independently deliverable and must be re-scoped or merged.
6. State affected modules, APIs, data, permissions, migration needs, and tests in Expected Impact. Record technical, security, compatibility, and delivery limits in Constraints.
7. Submit each completed Pack artifact through `sdd_submit_artifact`. Resolve returned Gate findings before re-submission. Never directly edit Delivery metadata or approve an artifact without explicit authorization.

## Split quality checks

| Check | Pass condition |
| --- | --- |
| Outcome | Goal describes one meaningful capability, not an implementation layer. |
| Traceability | Requirement Sources identify the Baseline decision that justifies the Pack. |
| Scope | Included and excluded work create a clear handoff boundary. |
| Acceptance | Every `AC-<number>` is observable, testable, and owned by this Pack. |
| Dependencies | No circular dependency; prerequisite order is minimal and explicit. |
| Impact | Implementers can find the affected contracts, data, code areas, and checks. |

## Revise rather than force a split

Stop and revise if the source requirement is still ambiguous, a Pack lacks a verifiable acceptance criterion, dependencies are circular, or a Pack consists only of hidden infrastructure with no separately useful boundary. Escalate unresolved product decisions to Requirement work and unresolved technical feasibility to Technical Design before submitting a misleading Spec.
