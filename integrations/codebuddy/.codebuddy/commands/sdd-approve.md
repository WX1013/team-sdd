---
description: Record an explicitly authorized Team SDD artifact approval.
argument-hint: <delivery-id> <requirement|design|spec> <approver>
allowed-tools: mcp__team-sdd__sdd_approve
disable-model-invocation: true
---

# Team SDD: approve

Require Delivery ID `$1`, artifact kind `$2`, and approver `$3`. Confirm that the user explicitly authorizes this approval; a request to inspect an artifact is not approval. Call `mcp__team-sdd__sdd_approve` with the active workspace's absolute `root`, `deliveryId: $1`, `artifact: $2`, and `approvedBy: $3`.

Present the returned data, findings, or error unchanged. If a governed call returns findings or an error, direct the user to `/sdd-doctor` for repository diagnostics, then perform only the next repair step it reports. Do not mutate Delivery state, metadata, approvals, or events directly.
