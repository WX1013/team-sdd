---
name: team-sdd
description: Operate a Team SDD Delivery through the installed Team SDD MCP tools. Use for requests to create or advance a Delivery, author Requirement, Design, Spec, Plan, or Check artifacts, inspect workflow status, resolve Gate findings, or report governed implementation progress.
---

# Team SDD

Use the Team SDD MCP server as the workflow authority. The server owns workflow state, Gate evaluation, and artifact submission; do not reproduce those rules in chat or edit its metadata directly.

## Operating procedure

1. Call `sdd_get_context` with the active workspace's absolute `root`, `deliveryId`, and available Codex capabilities.
2. Resolve reported capability gaps and Gate blockers before writing any governed artifact.
3. Read and write only the artifact paths returned in the Context. Keep implementation work within the Delivery's current activity and acceptance criteria.
4. After writing an artifact or collecting Check evidence, call `sdd_submit_artifact`. Treat `{ ok: false, findings }` as required follow-up work and submit again only after resolving them.
5. Never edit Delivery state or append workflow events directly. Only call `sdd_approve` with explicit authorization, and claim workflow completion only after a successful Core result.

## Tool use

- Use `sdd_new` only to create a requested Delivery.
- Use `sdd_status`, `sdd_next`, and `sdd_verify` to inspect workflow state without mutating it.
- Use `sdd_submit_artifact` as the sole artifact submission boundary.
- Use `sdd_get_context` again whenever the Delivery state changes, before starting the next activity.

If a tool returns `{ ok: false, error }`, report the error and correct its input or workspace condition. Do not treat it as a Gate finding or invent a state transition.
