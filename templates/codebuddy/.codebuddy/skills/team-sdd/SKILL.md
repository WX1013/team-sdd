---
name: team-sdd
description: 通过项目级 Core MCP 服务操作 Team SDD Delivery。
allowed-tools: Read, Write, mcp__team-sdd__sdd_new, mcp__team-sdd__sdd_status, mcp__team-sdd__sdd_next, mcp__team-sdd__sdd_verify, mcp__team-sdd__sdd_approve, mcp__team-sdd__sdd_submit_artifact, mcp__team-sdd__sdd_get_context
---

<!-- Team SDD managed: v1 -->
# Team SDD 工作流

Core 是工作流的唯一权威。对于既有 Delivery，先以项目根目录和 Delivery ID 调用 `mcp__team-sdd__sdd_get_context`。仅读取并处理 Context 返回的规范工件路径。仅通过 `mcp__team-sdd__sdd_submit_artifact` 提交工件，并将仓库问题引导至 `/sdd:doctor`。

将所有工具响应仅作为内部结构化数据处理。面向用户的内容必须使用简体中文；不得展示原始 JSON、MCP 响应包络或 Core 结果原文。保留 Delivery/Spec ID、状态枚举和错误码；将问题和下一步译为中文。Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
