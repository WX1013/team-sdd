---
description: 诊断 Team SDD 仓库前置条件。
allowed-tools: Bash(node node_modules/@zbp/sdd/dist/cli.js doctor --json)
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD：诊断

从项目根目录准确运行 `node node_modules/@zbp/sdd/dist/cli.js doctor --json`，且不得使用 `--fix`。将命令输出仅作为内部结构化数据处理。面向用户的内容必须使用简体中文；不得展示原始 JSON、MCP 响应包络或 Core 结果原文。保留错误码。

向用户展示通过项、诊断问题、错误码和建议修复动作；不要执行修复。
