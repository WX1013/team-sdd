---
name: spec-split
description: 把已批准的 Team SDD 需求和技术方案拆成可独立交付的 Spec Pack。当 sdd-next 要求 team-sdd:spec-split，或需要验收条件、依赖和需求追溯时使用。
---

# Team SDD Spec Split

将已批准的需求基线和技术方案拆成可独立交付、可独立验收的 Spec Pack。Team SDD Core 负责状态、路径和 Gate。不要在对话里另写一套拆分结果。

本 Skill 适用于任何项目。不写入具体业务的页面、表名、接口或参考仓库路径。某个交付怎么切分、覆盖哪些来源编号、验收条件怎么写，只放进该交付自己的 `spec.md`。

## 工作流

1. 使用工作区绝对路径、`deliveryId` 与可用能力调用 `sdd_get_context`。交付状态必须已经是 `SPEC`，且需求基线和技术方案的批准对应当前文件。否则停止，先完成对应批准，不创建 Pack。
2. 只依据这两份已批准产物划分。每个 Pack 是用户或运营方可以单独演示的一条纵向能力，并带上该能力需要的接口、数据、行为和验证。不要按前端、后端或数据库分层。不要单拆一个没有独立结果的公共底座。
3. 多个 Pack 都会用到的基线规则，写入各自的 `Constraints`。无法单独证明价值的切片，并入它服务的那条能力。
4. 用当前仓库已安装的 Team SDD 命令创建 Pack：`sdd spec create <deliveryId> <specId> --title <title> --acceptance-criterion <AC-n>`。有前置时加上 `--depends-on`。Spec ID 形如 `SP-` 后接字母或数字。前置必须已经存在，所以先创建没有前置的 Pack。不要手改 Delivery 元数据或事件日志。当前 MCP 没有创建 Pack 的工具。
5. 创建命令只生成带必需章节的 `spec.md`，依赖关系记在元数据中，正文里的 `Dependencies` 初始为 `None`。接着只改这个 `spec.md`。有前置时，把同样的 Spec ID 写入 `Dependencies`；没有前置时保持 `None`。这一节只出现真正的前置 ID。
6. 在 `Requirement Sources` 中，为每项覆盖需求逐字复制需求基线的 `- 编号：<值>` 行。不得改变拼写、格式或含义，也不要另造一套编号。基线中如果存在 `REQ-` 或 `BR-`，每个标识至少出现在一个 Pack 的该节里。
7. 每条验收条件使用稳定的 `AC-<数字>`，并写成可以判定通过或失败的可观察结果。创建之后不改号。后续 Plan 和 Check 会按这些标识逐项要求覆盖。
8. `Constraints` 记录本 Pack 必须遵守的既有技术、安全、兼容和交付限制，直接沿用技术方案，不在这里重新选型。`Expected Impact` 说明本 Pack 会影响的模块、接口、数据、权限、迁移和测试。
9. 全部 Pack 写完后再请人工批准整组 Spec。批准前不要调用 `sdd_submit_artifact`。批准后，提交任意一个 Pack 都会评估整组；整组合格时，交付进入 `EXECUTION`。门禁只检查八个英文章节标题是否存在，以及整组批准是否对应当前内容。标题在、正文空，也可能通过，所以空模板不能提交，也不能建议批准。
10. 本 Skill 不写 `plan.md`。交付进入执行后，每个 Pack 再单独做计划。

必需章节名为 `Goal`、`Requirement Sources`、`Scope`、`Out of Scope`、`Acceptance Criteria`、`Dependencies`、`Constraints`、`Expected Impact`。产物中不得出现 `TBD` 或 `TODO`。

## 章节结果

| 章节 | 必须达成的结果 |
| --- | --- |
| Goal | 一句话说明这个 Pack 单独交付后可以演示的能力。 |
| Requirement Sources | 覆盖的来源编号逐字可追溯。同一编号可以被多个 Pack 引用。 |
| Scope / Out of Scope | 写明包含和不包含的行为，使相邻 Pack 的边界能够接上。 |
| Acceptance Criteria | 每条都有 `AC-<数字>`，以及通过和失败的边界。 |
| Dependencies | 只列真实前置，单向且无环。没有前置时写 `None`。 |
| Constraints | 只记录本 Pack 不能违反的既有决策。 |
| Expected Impact | 说明模块、接口、数据、权限、迁移和测试上的影响。 |

## 停止条件

来源需求仍然含糊、验收条件无法判定、依赖成环，或 Pack 只是隐藏的基础设施时，先改拆分。未解决的产品决定回到 Requirement，技术上不可行的决定回到 Technical Design。没有明确授权不得批准产物。
