---
description: Show the next governed Team SDD action.
argument-hint: <delivery-id>
allowed-tools: mcp__team-sdd__sdd_get_context, mcp__team-sdd__sdd_next
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD: next

Call `mcp__team-sdd__sdd_get_context` before `mcp__team-sdd__sdd_next` for `$1`. Render and follow `skillRuntime.instructions` using its returned adapter only. Present Core findings and next steps unchanged. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
