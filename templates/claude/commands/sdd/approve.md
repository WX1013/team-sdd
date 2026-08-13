---
description: Approve a Team SDD artifact with explicit user authorization.
argument-hint: <delivery-id> <artifact> <approved-by>
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD: approve

Call `mcp__team-sdd__sdd_get_context` first. Confirm the approving person and artifact with the user, then call `mcp__team-sdd__sdd_approve`. Return the Core result unchanged. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
