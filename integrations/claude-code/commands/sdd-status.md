---
description: Read the governed status of a Team SDD Delivery.
argument-hint: <delivery-id>
disable-model-invocation: true
---

# Team SDD: status

Require a Delivery ID. Call the scoped plugin MCP tool `mcp__plugin_team-sdd_team-sdd__sdd_status` with `root` set to `${CLAUDE_PROJECT_DIR}` and the supplied `deliveryId`.

Present the returned status, findings, or error unchanged. Do not infer a workflow state or modify Team SDD metadata or events.
