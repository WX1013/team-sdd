---
description: Create a governed Team SDD Delivery.
argument-hint: <delivery-id> <title> <APPLICATION_INIT|FEATURE_CHANGE>
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD: new

Collect the Delivery ID, title, and type. Call `mcp__team-sdd__sdd_new` with the active project root and the supplied values. Return Core data, findings, or errors unchanged. Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
