---
name: technical-design
description: Use when a Team SDD Delivery needs a concrete, governed Technical Design after Requirement Baseline approval, including architecture, interfaces, risks, and validation strategy.
---

# Team SDD Technical Design

Convert an approved Requirement Baseline into implementation-ready technical decisions. Team SDD Core owns activity state, paths, and Gate evaluation; never substitute a chat-only design for its governed artifact.

## Workflow

1. Call `sdd_get_context` with the workspace's absolute `root`, `deliveryId`, and available capabilities. Confirm the Requirement Baseline is available and write only to the Design artifact path returned by Context.
2. Inspect the applicable code, runtime constraints, and existing contracts before selecting a design. Reuse established repository patterns where they satisfy the Baseline.
3. Complete every Context-provided heading: `System Boundary`, `Overall Architecture`, `Module Design`, `Data Model`, `API`, `Core Flow`, `Permissions`, `Error Handling`, `Performance`, `Security`, `Observability`, `Deployment`, `Compatibility / Migration`, `Test Strategy`, and `Technical Risks`.
4. In each applicable section, state the concrete decision, affected components or interfaces, constraints, and how the decision will be verified. Name material alternatives and rejection reasons only when they help a later implementer avoid a real trade-off.
5. Keep product intent separate from technical choice. When a missing or conflicting Requirement decision changes observable behavior, return it for clarification instead of choosing on the requester's behalf.
6. Make Test Strategy map each significant behavior and risk to executable or observable evidence. Make Compatibility / Migration specify rollout, data transition, and rollback expectations whenever an existing contract changes.
7. Call `sdd_submit_artifact` once the design is actionable. Resolve all returned Gate findings before re-submission. Do not edit Delivery metadata or approve an artifact without explicit authorization.

## Decision quality

| Concern | Design must establish |
| --- | --- |
| Boundary and architecture | Ownership, dependencies, and why the selected path fits repository constraints. |
| Modules, data, and API | Exact responsibilities, contracts, state changes, and compatibility behavior. |
| Flow, permissions, and errors | Success path, authorization, failure modes, user-visible behavior, and recovery. |
| Operations | Performance limits, security controls, logging/metrics, deployment, migration, and rollback. |
| Verification | Tests and checks that demonstrate the Baseline and risks are satisfied. |

## Stop conditions

Do not submit a design that merely repeats the Requirement, leaves an implementation-critical decision implicit, or proposes an interface without consumer and failure behavior. Report missing capabilities, unavailable repository evidence, and unresolved product decisions through the governed workflow before continuing.
