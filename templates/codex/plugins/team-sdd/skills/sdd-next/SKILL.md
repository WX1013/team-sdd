---
name: sdd-next
description: 查看并执行 Team SDD 的下一项受治理动作。用户要求 /sdd-next 或推进某个 Delivery 时使用。
---

<!-- Team SDD managed: v1 -->
# Team SDD：下一步

先以当前项目根目录和用户给出的 Delivery ID 调用 `mcp__team-sdd__sdd_get_context`，再调用 `mcp__team-sdd__sdd_next`。仅使用返回的 adapter 渲染并遵循 `skillRuntime.instructions`。指令中的 `superpowers:<name>` 打开当前项目 Agent 已安装的同名 Skill 正文，并先遵守其中「与 Team SDD 的衔接」。将工具响应仅作为内部结构化数据处理。面向用户的内容必须使用简体中文；不得展示原始 JSON、MCP 响应包络或 Core 结果原文。保留 Delivery/Spec ID、状态枚举和错误码。

向用户展示当前活动、阻塞项、推荐动作和下一条可执行的快捷指令；如失败，展示错误码、中文原因和建议操作。只能写入 Context 返回的产物路径。产物完成后调用 `mcp__team-sdd__sdd_submit_artifact`。Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
