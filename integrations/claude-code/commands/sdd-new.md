---
description: Create a governed Team SDD Delivery.
argument-hint: <delivery-id> <title> <APPLICATION_INIT|FEATURE_CHANGE>
disable-model-invocation: true
---

# Team SDD: new

Collect a Delivery ID, title, and type from the user. If any are absent, ask for it; do not infer a Delivery type.

Call the scoped plugin MCP tool `mcp__plugin_team-sdd_team-sdd__sdd_new` with `root` set to `${CLAUDE_PROJECT_DIR}`, the supplied `id`, `title`, and `type`. Include an optional Design requirement only when the user explicitly supplies one.

Present the returned `data`, `findings`, or `error` unchanged. Do not create files, edit Delivery metadata, or append workflow events directly.
