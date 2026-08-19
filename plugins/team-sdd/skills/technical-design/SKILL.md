---
name: technical-design
description: Use when a Team SDD Delivery needs a concrete, governed Technical Design after Requirement Baseline approval, including architecture, interfaces, risks, validation strategy, and requirement traceability.
---

# Team SDD Technical Design

将已批准的需求基线转为可实施的技术决策。Team SDD Core 负责活动状态、路径与 Gate 评估；不要以对话中的设计替代受治理产物。

## 工作流

1. 使用工作区绝对路径、`deliveryId` 与可用能力调用 `sdd_get_context`。确认需求基线可用，只写入 Context 返回的设计产物路径。
2. 在选择方案前检查相关代码、运行时约束与既有契约；优先复用能满足基线的仓库模式。
3. 完成 Context 提供的所有设计章节，并为每项适用章节写明具体决策、受影响组件或接口、约束和验证方式。
4. 在 `Requirement Coverage` 中，为每一项已覆盖需求逐字复制 `requirement.md` 的 `- 编号：<值>` 行。不得重新编号、简写或改变来源编号格式。
5. 将产品意图与技术选择分开。缺失或冲突的需求决定若改变可观察行为，应退回 Requirement 澄清。
6. Test Strategy 应将关键行为与风险映射到可执行或可观察证据；变更既有契约时，Compatibility / Migration 应说明发布、迁移与回滚预期。
7. 设计可执行后调用 `sdd_submit_artifact`。先解决所有 Gate findings 再重新提交；没有明确授权不得编辑 Delivery 元数据或批准产物。

## 停止条件

不得提交仅复述需求、遗漏实现关键决策、未说明消费者与失败行为的设计。通过受治理工作流报告能力缺口、仓库证据不足与未解决的产品决定。
