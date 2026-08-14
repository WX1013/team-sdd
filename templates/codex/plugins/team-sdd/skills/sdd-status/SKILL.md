---
name: sdd-status
description: Show the governed status of a Team SDD Delivery.
---

<!-- Team SDD managed: v1 -->
# Team SDD status

Call `mcp__team-sdd__sdd_get_context` before `mcp__team-sdd__sdd_status` for the supplied Delivery. Treat both tool responses as internal structured data. Do not show raw MCP JSON, envelopes, or a separate Core-result summary.

Return only the PRD Status UX below:

```text
<delivery.id> · <delivery.title>

Workflow
────────────────────
Requirement   <✓|●|○>
Design        <✓|●|○>
Spec          <✓|●|○>
Execution     <✓|●|○>
Check         <✓|●|○>
Done          <✓|●|○>

Spec Packs
────────────────────
<one line per Spec Pack: id, title, state; or "No Spec Packs">

Current
────────────────────
<context.activity; when an unfinished Spec Pack is in PLAN, CODE, or CHECK, show "SP-… / Activity">

Plan
────────────────────
<completed / total tasks, only when Core has supplied those counts>

Next
────────────────────
/sdd-next <delivery.id>
```

Mark completed Workflow steps with `✓`, the Delivery state with `●`, and later steps with `○`. Omit the entire Plan section when Core has not supplied plan task counts. If `context.blockers` is nonempty, append `Blockers` with numbered items in Core order: `<message>` followed by `→ <nextStep>`. If it is empty, do not invent a blocker. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
