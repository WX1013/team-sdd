---
description: Show the governed status of a Team SDD Delivery.
argument-hint: <delivery-id>
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD: status

Call `mcp__team-sdd__sdd_get_context` first, then call `mcp__team-sdd__sdd_status` with the active project root and Delivery ID. Return the Core result unchanged. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
