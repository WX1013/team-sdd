---
description: Record an explicitly authorized Team SDD artifact approval.
argument-hint: <delivery-id> <requirement|design|spec> <approver>
disable-model-invocation: true
---

# Team SDD: approve

Require the Delivery ID, artifact kind, and approver. Confirm the user has explicitly authorized this approval; do not treat a request to inspect an artifact as authorization.

Call the scoped plugin MCP tool `mcp__plugin_team-sdd_team-sdd__sdd_approve` with `root` set to `${CLAUDE_PROJECT_DIR}`, the supplied `deliveryId`, `artifact`, and `approvedBy` values.

Present the returned `data`, `findings`, or `error` unchanged. Never edit approvals, Delivery metadata, or workflow events directly.
