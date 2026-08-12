---
description: Create a governed Team SDD Delivery.
argument-hint: <delivery-id> <title> <APPLICATION_INIT|FEATURE_CHANGE>
allowed-tools: mcp__team-sdd__sdd_new
disable-model-invocation: true
---

# Team SDD: new

Require Delivery ID `$1`, title `$2`, and type `$3`; ask the user for any missing value and do not infer the type. Call `mcp__team-sdd__sdd_new` with the active workspace's absolute `root`, `id: $1`, `title: $2`, and `type: $3`. Include a Design requirement only when the user explicitly provides one.

Present the returned data, findings, or error unchanged. If a governed call returns findings or an error, direct the user to `/sdd-doctor` for repository diagnostics, then perform only the next repair step it reports. Do not mutate Delivery state, metadata, approvals, or events directly.
