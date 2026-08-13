---
name: team-sdd
description: Operate Team SDD Deliveries through the project-local Core MCP server.
allowed-tools: Read, Write, mcp__team-sdd__sdd_new, mcp__team-sdd__sdd_status, mcp__team-sdd__sdd_next, mcp__team-sdd__sdd_verify, mcp__team-sdd__sdd_approve, mcp__team-sdd__sdd_submit_artifact, mcp__team-sdd__sdd_get_context
---

<!-- Team SDD managed: v1 -->
# Team SDD

Core is the workflow authority. For an existing Delivery, first call `mcp__team-sdd__sdd_get_context` with the project root and Delivery ID. Read and work only on canonical artifact paths returned by Context. Call `mcp__team-sdd__sdd_submit_artifact` as the sole submission boundary. Return Core findings unchanged and direct repository problems to `/sdd:doctor`; do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
