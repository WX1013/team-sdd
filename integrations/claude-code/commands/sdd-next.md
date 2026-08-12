---
description: Show the next governed Team SDD activity.
argument-hint: <delivery-id>
disable-model-invocation: true
---

# Team SDD: next

Require a Delivery ID. Call the scoped plugin MCP tool `mcp__plugin_team-sdd_team-sdd__sdd_next` with `root` set to `${CLAUDE_PROJECT_DIR}` and the supplied `deliveryId`.

Present the returned activity, blockers, findings, or error unchanged. Do not infer a state transition or edit any Team SDD files directly.
