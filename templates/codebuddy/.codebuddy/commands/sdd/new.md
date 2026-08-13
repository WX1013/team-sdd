---
description: Create a governed Team SDD Delivery.
argument-hint: <delivery-id> <title> <APPLICATION_INIT|FEATURE_CHANGE>
allowed-tools: mcp__team-sdd__sdd_new
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD: new

Require Delivery ID `$1`, title `$2`, and type `$3`, then call `mcp__team-sdd__sdd_new` with the active project root. Present the Core result unchanged. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
