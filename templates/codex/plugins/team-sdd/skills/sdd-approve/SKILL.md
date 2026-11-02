---
name: sdd-approve
description: 在用户明确授权后批准 Team SDD 工件。用户要求 /sdd-approve，并给出 Delivery、requirement/design/spec 和审批人时使用。
---

<!-- Team SDD managed: v1 -->
# Team SDD：审批

先以当前项目根目录调用 `mcp__team-sdd__sdd_get_context`。向用户确认审批人和工件后，再调用 `mcp__team-sdd__sdd_approve`。`artifact` 只能是 `requirement`、`design` 或 `spec`。将工具响应仅作为内部结构化数据处理。面向用户的内容必须使用简体中文；不得展示原始 JSON、MCP 响应包络或 Core 结果原文。保留 Delivery/Spec ID、状态枚举和错误码。

没有用户在本次对话中明确给出的审批人和工件时，不得调用 `sdd_approve`。向用户展示“审批结果”、工件、审批人和状态变化；如失败，展示错误码、中文原因和建议操作。Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
