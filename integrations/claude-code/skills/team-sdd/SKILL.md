---
name: team-sdd
description: Operate Team SDD Deliveries through the repository-local Team SDD MCP server and its governed Core workflow.
---

# Team SDD

Use the Team SDD MCP server as the workflow authority. The server owns Delivery state, Gate evaluation, canonical artifact paths, and submission results; do not recreate those decisions in chat.

## Operating procedure

1. Call the scoped plugin MCP tool `mcp__plugin_team-sdd_team-sdd__sdd_get_context` with the active workspace's absolute `root`, `deliveryId`, and available Claude capabilities before beginning authored Artifact work.
2. Resolve every capability gap and Gate blocker returned by Context before drafting or changing an Artifact.
3. Read and write only the canonical artifact paths returned by Context, and keep the work within the active activity and acceptance criteria.
4. After writing an Artifact or collecting Check evidence, call the scoped plugin MCP tool `mcp__plugin_team-sdd_team-sdd__sdd_submit_artifact`. If it returns `{ ok: false, findings }`, repair the reported issue and resubmit only after it is resolved.
5. Never change Delivery state or append workflow events directly. Call `mcp__plugin_team-sdd_team-sdd__sdd_approve` only with explicit user authorization, and report workflow completion only after a successful Core result.

## Tool use

- Use `mcp__plugin_team-sdd_team-sdd__sdd_new` only to create a requested Delivery.
- Use `mcp__plugin_team-sdd_team-sdd__sdd_status`, `mcp__plugin_team-sdd_team-sdd__sdd_next`, and `mcp__plugin_team-sdd_team-sdd__sdd_verify` only for governed read operations.
- Use `mcp__plugin_team-sdd_team-sdd__sdd_submit_artifact` as the sole Artifact submission boundary.
- Call `mcp__plugin_team-sdd_team-sdd__sdd_get_context` again after a Delivery state change and before starting the next authored activity.

If a tool returns `{ ok: false, error }`, present the error and correct its input or repository prerequisite. For environment problems, run the repository-local `sdd doctor` command; do not invent a state transition or bypass a Gate.
