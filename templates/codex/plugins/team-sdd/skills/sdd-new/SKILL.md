---
name: sdd-new
description: 创建受治理的 Team SDD Delivery。
---

<!-- Team SDD managed: v1 -->
# Team SDD 新建

使用项目根目录以及用户提供的 Delivery ID、标题和类型调用 `mcp__team-sdd__sdd_new`。将工具响应仅作为内部结构化数据处理。面向用户的内容必须使用简体中文；不得展示原始 JSON、MCP 响应包络或 Core 结果原文。保留 Delivery/Spec ID、状态枚举和错误码。

向用户展示“创建结果”、Delivery ID、标题、当前状态和下一步；如创建失败，展示错误码、中文原因和建议操作。Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
