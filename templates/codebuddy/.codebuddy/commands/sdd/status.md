---
description: Show the governed status of a Team SDD Delivery.
argument-hint: <delivery-id>
allowed-tools: mcp__team-sdd__sdd_get_context, mcp__team-sdd__sdd_status
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD: status

Call `mcp__team-sdd__sdd_get_context` before `mcp__team-sdd__sdd_status` for `$1`. Present the Core result unchanged. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
