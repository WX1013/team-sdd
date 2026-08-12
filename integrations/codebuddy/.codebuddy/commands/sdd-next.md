---
description: Show the next governed Team SDD activity.
argument-hint: <delivery-id>
allowed-tools: mcp__team-sdd__sdd_next
disable-model-invocation: true
---

# Team SDD: next

Require Delivery ID `$1`. Call `mcp__team-sdd__sdd_next` with the active workspace's absolute `root` and `deliveryId: $1`.

Present the returned activity, blockers, findings, or error unchanged. If a governed call returns findings or an error, direct the user to `/sdd-doctor` for repository diagnostics, then perform only the next repair step it reports. Do not mutate Delivery state, metadata, approvals, or events directly.
