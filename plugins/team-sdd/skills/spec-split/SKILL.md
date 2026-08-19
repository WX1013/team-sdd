---
name: spec-split
description: Use when a Team SDD Delivery needs an approved Requirement and Design divided into independently deliverable Spec Packs with scope, dependencies, observable acceptance criteria, and requirement traceability.
---

# Team SDD Spec Split

将已批准的需求基线和技术设计拆分为可独立交付的纵向 Spec Pack。每个 Pack 必须有清晰结果，能被实现、检查与发布。

## 工作流

1. 使用工作区绝对路径、`deliveryId` 与可用能力调用 `sdd_get_context`。确认需求基线与技术设计可用，只使用 Context 返回的当前 Spec Pack 和产物路径。
2. 识别面向用户或运营方的结果。优先包含必要 API、数据、行为和验证工作的纵向切片；不要仅按前端、后端或数据库层拆分。
3. 对每个 Pack 完成 Context 模板：`Goal`、`Requirement Sources`、`Scope`、`Out of Scope`、`Acceptance Criteria`、`Dependencies`、`Constraints`、`Expected Impact`。
4. 在 `Requirement Sources` 中，为每项覆盖需求逐字复制 `requirement.md` 的 `- 编号：<值>` 行。不得改变来源编号的拼写、格式或含义。
5. 每项验收条件使用稳定的 `AC-<数字>` 标识，并表述为具有通过/失败边界的可观察结果。
6. 仅列出真实前置 Pack 或外部依赖。保持依赖单向且最小；出现环路时修改拆分。无法独立证明价值的 Pack 应重划范围或合并。
7. 在 Expected Impact 中说明受影响模块、API、数据、权限、迁移与测试；在 Constraints 中记录技术、安全、兼容性和交付限制。
8. 通过 `sdd_submit_artifact` 分别提交每个完成的 Pack 产物。先解决 Gate findings 再重新提交；不得直接编辑 Delivery 元数据或未授权批准产物。

## 重新拆分的条件

若来源需求仍模糊、Pack 缺少可验证验收条件、依赖成环，或 Pack 只是没有独立边界的隐藏基础设施，则应修改拆分。未解决的产品决定回到 Requirement，技术可行性问题回到 Technical Design。
