---
name: team-sdd
description: Operate Team SDD Deliveries through the repository-local Team SDD MCP server and its governed Core workflow.
allowed-tools: Read, Write, mcp__team-sdd__sdd_new, mcp__team-sdd__sdd_status, mcp__team-sdd__sdd_next, mcp__team-sdd__sdd_verify, mcp__team-sdd__sdd_approve, mcp__team-sdd__sdd_submit_artifact, mcp__team-sdd__sdd_get_context
---

# Team SDD

Use the Team SDD MCP server as the workflow authority. The server owns Delivery state, Gate evaluation, canonical artifact paths, and submission results; do not recreate those decisions in chat.

## Operating procedure

1. Call `mcp__team-sdd__sdd_get_context` with the active workspace's absolute `root`, `deliveryId`, and available CodeBuddy capabilities before beginning authored Artifact work.
2. Resolve every capability gap and Gate blocker returned by Context before drafting or changing an Artifact. If Context fails, correct the supplied root or Delivery ID, or complete the stated repository prerequisite, then call Context again.
3. Read and write only the canonical artifact paths returned by Context, and keep the work within the active activity and acceptance criteria.
4. After writing an Artifact or collecting Check evidence, call `mcp__team-sdd__sdd_submit_artifact`. If it returns findings, repair the reported issue and resubmit only after the stated repair step is complete.
5. Never change Delivery state or append workflow events directly. Call `mcp__team-sdd__sdd_approve` only with explicit user authorization, and report workflow completion only after a successful Core result.

## Tool use

- Use `mcp__team-sdd__sdd_new` only to create a requested Delivery.
- Use `mcp__team-sdd__sdd_status`, `mcp__team-sdd__sdd_next`, and `mcp__team-sdd__sdd_verify` only for governed read operations.
- Use `mcp__team-sdd__sdd_submit_artifact` as the sole Artifact submission boundary.
- Call `mcp__team-sdd__sdd_get_context` again after a Delivery state change and before starting the next authored activity.

If a tool returns an error, present it and repair its input or repository prerequisite. Do not invent a transition, bypass a Gate, or write workflow metadata directly.

## Finding recovery

If any governed tool returns findings or an error, direct the user to `/sdd-doctor` for repository diagnostics, then perform only the next repair step it reports. Do not mutate Delivery state, metadata, approvals, or events directly.
