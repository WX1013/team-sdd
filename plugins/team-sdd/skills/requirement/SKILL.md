---
name: requirement
description: Use when a Team SDD Delivery is in requirement analysis and needs source clarification, scope boundaries, business rules, or a submit-ready Requirement Baseline.
---

# Team SDD Requirement

Turn an input request into an unambiguous, governed implementation baseline. Team SDD Core is the workflow authority; do not recreate its state rules in chat.

## Workflow

1. Call `sdd_get_context` with the workspace's absolute `root`, `deliveryId`, and available capabilities. Work only at the artifact path returned in Context.
2. Read the source material and repository context. Record the source faithfully; separate confirmed facts from assumptions.
3. Write the Context template with these headings: `Source`, `Understanding`, `Scope`, `Business Rules`, `Questions`, `Answers`, and `Baseline`.
4. Give every business rule a stable `BR-<number>` identifier. Make Scope state both included behavior and explicitly excluded behavior.
5. Ask concise questions for each fact that blocks scope, a business rule, an acceptance boundary, permissions, data handling, compatibility, or delivery priority. Mark every question resolved or unresolved, and record confirmed responses in Answers.
6. Do not invent an answer or freeze a Baseline while a blocking question is unresolved. State the final Baseline as the precise implementation contract after all blocking facts are confirmed.
7. Call `sdd_submit_artifact` only after the artifact is complete. If it returns Gate findings, resolve the stated findings, update the artifact, and submit again. Never edit Delivery metadata or approve an artifact without explicit authorization.

## Quality bar

| Section | Required result |
| --- | --- |
| Source | Link, quote, or identify the change request and any relevant repository evidence. |
| Understanding | Restate the requested outcome as observable behavior, not an implementation guess. |
| Scope | Define included behavior, exclusions, actors, and boundaries. |
| Business Rules | List deterministic rules, identifiers, and exceptions. |
| Questions and Answers | Preserve traceability from uncertainty to confirmed decision. |
| Baseline | Provide one stable, actionable contract for Design and Spec splitting. |

## Do not proceed silently

Escalate to the requester when a missing decision materially changes what will be delivered. Examples include export data scope, role authorization, retention, pricing logic, or backwards compatibility. It is acceptable to complete discovery without submission when Core Context or a necessary user decision is unavailable.
