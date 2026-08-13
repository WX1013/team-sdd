---
description: Approve a Team SDD artifact with explicit user authorization.
argument-hint: <delivery-id> <artifact> <approved-by>
allowed-tools: mcp__team-sdd__sdd_get_context, mcp__team-sdd__sdd_approve
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD: approve

Call `mcp__team-sdd__sdd_get_context` for `$1`, confirm `$2` and `$3` with the user, then call `mcp__team-sdd__sdd_approve`. Present the Core result unchanged. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
