---
name: requirement
description: Use when a Team SDD Delivery is in requirement analysis and needs PRD source clarification, scope boundaries, source identifier traceability, business rules, or a submit-ready Requirement Baseline.
---

# Team SDD Requirement

将 PRD 转为可治理、可追溯的需求基线。Team SDD Core 是工作流权威；不要在对话中重建状态规则。

## 工作流

1. 使用工作区绝对路径、`deliveryId` 与可用能力调用 `sdd_get_context`。只能写入 Context 返回的产物路径。
2. 阅读 PRD、变更请求与仓库上下文。忠实记录来源，区分已确认事实与假设。
3. 使用 Context 模板写入：`来源`、`需求理解`、`范围`、`业务规则`、`问题`、`答复`、`需求基线`。
4. 先从 PRD 的“需求编号 / 功能点编号 / 规则编号”等标注字段、Markdown 表格、标题、列表和重复编号模式中识别来源编号。识别到时，逐字保留为 `- 编号：<原始值>`；不要创建并行的 Team SDD 编号，也不要改变其拼写或格式。
5. 仅当来源项没有可识别编号时，分配递增的 Team SDD 编号；需求使用 `REQ-<数字>`，业务规则使用 `BR-<数字>`，并同样记录为 `- 编号：<值>`。
6. 对阻塞范围、规则、验收边界、权限、数据、兼容性或交付优先级的事实提出简洁问题。每项标注 `状态：已解决` 或 `状态：未解决`，并在答复中记录确认结论。
7. 存在阻塞问题时，不得臆造答案或冻结需求基线。所有阻塞事实确认后，基线应成为精确的实现契约。
8. 仅在产物完成后调用 `sdd_submit_artifact`。若返回 Gate findings，先解决所列问题并更新产物，再次提交。不得编辑 Delivery 元数据或在没有明确授权时批准产物。

## 质量要求

| 章节 | 必须达成的结果 |
| --- | --- |
| 来源 | 链接、引用或定位 PRD 与相关仓库证据。 |
| 需求理解 | 用可观察行为说明目标，而不是实现猜测。 |
| 范围与业务规则 | 明确包含、排除、参与者、边界、规则与例外；每个可追溯项记录 `编号：`。 |
| 问题与答复 | 保留从不确定性到确认结论的追溯关系。 |
| 需求基线 | 形成可供 Design 和 Spec 拆分使用的稳定、可执行契约。 |

## 需要暂停的情况

缺失的决定若会实质改变交付内容，应向请求方升级。例如导出数据范围、角色授权、保留策略、计费逻辑或兼容性。缺少 Core Context、PRD 证据或必要用户决定时，可以完成发现工作但不提交。
