---
description: 在用户明确授权后批准 Team SDD 工件。
argument-hint: <delivery-id> <artifact> <approved-by>
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD：审批

先调用 `mcp__team-sdd__sdd_get_context`。向用户确认审批人和工件后，调用 `mcp__team-sdd__sdd_approve`。将工具响应仅作为内部结构化数据处理。面向用户的内容必须使用简体中文；不得展示原始 JSON、MCP 响应包络或 Core 结果原文。保留 Delivery/Spec ID、状态枚举和错误码。

向用户展示“审批结果”、工件、审批人和状态变化；如失败，展示错误码、中文原因和建议操作。Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
