---
name: team-sdd
description: Operate Team SDD Deliveries through the project-local Core MCP server.
---

<!-- Team SDD managed: v1 -->
# Team SDD

Core is the workflow authority. For an existing Delivery, first call `mcp__team-sdd__sdd_get_context` with the project root and Delivery ID. Use `mcp__team-sdd__sdd_new`, `mcp__team-sdd__sdd_status`, `mcp__team-sdd__sdd_next`, and `mcp__team-sdd__sdd_approve` only for their governed operations. After producing a governed artifact, call `mcp__team-sdd__sdd_submit_artifact` as the sole submission boundary. Return Core findings unchanged; do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
