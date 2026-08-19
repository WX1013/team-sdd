# Agent 人类可读输出设计

## 目标

项目级 Claude、CodeBuddy 与 Codex 的 Team SDD 快捷指令必须把 MCP 和 CLI 的结构化结果作为内部数据处理，向用户输出中文的可读结果，而非原始 JSON。

## 范围

覆盖每个平台的 `sdd-new`、`sdd-status`、`sdd-next`、`sdd-approve` 与 `sdd-doctor` 模板。命令形式保持不变：Claude 与 CodeBuddy 使用 `/sdd:<动作>`，Codex 使用 `/sdd-<动作>`。

MCP 工具调用、CLI 的 `--json` 输出、错误代码、Delivery/Spec ID 和状态枚举保持原样，确保脚本、CI 与现有协议兼容。

## 输出契约

所有模板均要求面向用户的叙述、标题、问题和下一步使用简体中文；不得展示 MCP 响应包络、原始 JSON 或“Core 结果”原文。

| 指令 | 面向用户的结果 |
| --- | --- |
| `new` | 创建结果、Delivery ID、标题、当前状态和下一步。 |
| `status` | 固定 Status UX：工作流、规格包、当前、计划（存在任务统计时）和下一步；阻塞项显示错误码并将说明与建议译为中文。 |
| `next` | 当前活动、阻塞项、推荐动作和可执行的下一条快捷指令。 |
| `approve` | 审批结果、工件、审批人和状态变化。 |
| `doctor` | 通过项、诊断问题、错误码和建议修复动作；只诊断，不使用 `--fix`。 |

工具失败时，保留稳定的错误码和标识符，并用中文说明失败原因与建议下一步。Agent 不得直接修改 `.sdd`、Delivery 元数据、审批记录或事件日志。

## 实施边界

仅修改发布在 `templates/` 中的项目级 Agent 模板及其契约测试；不改变 MCP 返回结构、CLI 的 `--json` 输出或领域模型。用户更新包后通过 `npx sdd agents sync --agents <agent>` 刷新已安装模板。

## 验证

契约测试将断言三套平台的全部快捷指令：

1. 禁止原样呈现 JSON、MCP 包络或 Core 结果；
2. 明确要求简体中文的用户可见输出；
3. `status` 保持完整中文 Status UX；
4. 保持既有的 MCP 工具、治理和无直接写入约束。
