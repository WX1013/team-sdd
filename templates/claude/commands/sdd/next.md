---
description: Show the next governed Team SDD action.
argument-hint: <delivery-id>
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD: next

Call `mcp__team-sdd__sdd_get_context` first, then call `mcp__team-sdd__sdd_next` with the active project root and Delivery ID. Render and follow `skillRuntime.instructions` using its returned adapter only; return Core findings and next steps unchanged. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
