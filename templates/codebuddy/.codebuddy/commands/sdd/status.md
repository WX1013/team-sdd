---
description: 查看 Team SDD Delivery 的受治理状态。
argument-hint: <delivery-id>
allowed-tools: mcp__team-sdd__sdd_get_context, mcp__team-sdd__sdd_status
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
# Team SDD：状态

为 `$1` 先调用 `mcp__team-sdd__sdd_get_context`，再调用 `mcp__team-sdd__sdd_status`。将两项工具响应仅作为内部结构化数据处理。面向用户的内容必须使用简体中文；不得展示原始 JSON、MCP 响应包络或 Core 结果原文。保留 Delivery/Spec ID、状态枚举和错误码。

只按以下 Status UX 向用户呈现：

```text
<delivery.id> · <delivery.title>

工作流
────────────────────
需求        <✓|●|○>
技术设计    <✓|●|○>
规格        <✓|●|○>
执行        <✓|●|○>
检查        <✓|●|○>
完成        <✓|●|○>

规格包
────────────────────
<每个规格包一行：ID、标题、状态；或“暂无规格包”>

当前
────────────────────
<context.activity；当未完成规格包处于 PLAN、CODE 或 CHECK 时，显示“SP-… / 活动”>

计划
────────────────────
<已完成 / 总任务数；仅当 Core 提供任务统计时显示>

下一步
────────────────────
/sdd:next <delivery.id>
```

已完成的工作流步骤标记为 `✓`，Delivery 当前状态标记为 `●`，后续步骤标记为 `○`。Core 未提供任务统计时省略整个“计划”区块。若 `context.blockers` 非空，按 Core 顺序追加“阻塞项”，每项保留错误码，并将说明和 `→ <nextStep>` 译为中文；为空时不得虚构阻塞项。Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.
