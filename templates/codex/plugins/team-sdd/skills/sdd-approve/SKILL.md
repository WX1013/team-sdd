---
name: sdd-approve
description: Approve a Team SDD artifact with explicit user authorization.
---

<!-- Team SDD managed: v1 -->
# Team SDD approve

Call `mcp__team-sdd__sdd_get_context`, confirm the approving person and artifact, then call `mcp__team-sdd__sdd_approve`. Present the Core result unchanged. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
