# Team SDD V1 Design Spec

## 1. 产品定位

Team SDD 是一套面向团队的软件研发流程编排框架，用于将：

> 需求 → 技术方案 → Spec Pack → Plan → Code → Check

转化为一套 **Agent 无关、状态可追踪、过程可验证、结果可审计** 的研发工作流。

支持团队成员在 Claude Code、Codex、CodeBuddy 等开发 Agent 中使用，同时保留 CLI、MCP、Git Hook、CI 等执行入口。

核心原则：

> **内部强约束，外部低复杂度。**

开发者不需要理解状态机、Gate Engine、Event Store、Adapter 等内部实现，只需要理解：

- Delivery：这次要交付什么
- Spec Pack：拆出来的独立研发单元
- PLAN → CODE → CHECK：Spec Pack 的执行流程

---

# 2. 核心设计目标

## 2.1 流程标准化

将团队当前研发流程固化为：

```text
PRD / Change Requirement
        ↓
Requirement
        ↓
Technical Design
        ↓
Spec Split
        ↓
PLAN
        ↓
CODE
        ↓
CHECK
        ↓
DONE
```

其中：

- 新应用必须经过 Technical Design。
- 功能迭代可根据影响范围决定是否需要 Technical Design。
- PLAN、CODE、CHECK 尽量复用 Superpowers。
- 所有状态转换由 SDD Engine 控制。

---

## 2.2 Agent 无关

核心 Workflow 不依赖：

- Claude
- Codex
- CodeBuddy
- Superpowers

而通过抽象层连接：

```text
Workflow Engine
      ↓
Skill Runtime
      ↓
Agent Runtime
```

未来可以继续扩展：

- Gemini CLI
- OpenCode
- Cursor
- VS Code / JetBrains Plugin
- 其他 Coding Agent

---

## 2.3 强状态机

Agent 可以：

- 分析需求
- 生成技术方案
- 拆 Spec
- 编写计划
- 修改代码
- 执行测试

但：

> Agent 无权自行修改研发状态。

状态迁移只能经过：

```text
Artifact
   ↓
Validation
   ↓
Gate
   ↓
Workflow Engine
   ↓
State Transition
```

---

# 3. 用户心智模型

团队开发人员只需要理解两个对象。

## 3.1 Delivery

一次完整研发交付。

例如：

```text
DLV-001 学籍管理应用 V1
DLV-002 增加学籍异动审批
DLV-003 增加批量导入
```

Delivery 类型 V1 只支持：

```text
APPLICATION_INIT
FEATURE_CHANGE
```

未来可扩：

```text
BUGFIX
REFACTOR
MIGRATION
TECH_CHANGE
```

---

## 3.2 Spec Pack

Delivery 技术方案完成后，拆出的最小独立研发单元。

例如：

```text
DLV-001

├── SP-001 学生档案管理
├── SP-002 学籍异动申请
├── SP-003 学籍异动审批
└── SP-004 消息通知
```

Spec Pack 应：

- 能独立 Plan
- 能独立 Code
- 能独立 Check
- 有明确 Acceptance Criteria
- 尽可能减少跨 Spec 依赖
- 能在合理 Agent Context 中完成

禁止按纯技术层拆：

```text
❌ SP-001 Database
❌ SP-002 Controller
❌ SP-003 Frontend
```

推荐按能力拆：

```text
✓ SP-001 学籍异动申请
✓ SP-002 学籍异动审批
```

---

# 4. Application 模型

Application 不作为研发人员日常操作对象。

原则：

> 一个 Git Repository 默认对应一个 Application。

项目级信息保存在：

```text
.sdd/config.yaml
```

不提供：

```text
sdd application create
sdd application select
```

避免增加用户心智负担。

---

# 5. Delivery 状态机

用户可见状态：

```text
REQUIREMENT
     ↓
DESIGN
     ↓
SPEC
     ↓
EXECUTION
     ↓
CHECK
     ↓
DONE
```

其中 DESIGN 可以条件跳过。

内部可以使用更精确枚举，例如：

```text
REQUIREMENT
DESIGN
SPEC_SPLIT
EXECUTION
CHECK
DONE
```

但 UI 统一显示 `SPEC`。

---

# 6. 新应用流程

对于：

```yaml
type: APPLICATION_INIT
```

流程固定：

```text
REQUIREMENT
     │
Requirement Gate
     ▼
DESIGN
     │
Design Gate
     ▼
SPEC
     │
Spec Gate
     ▼
EXECUTION
     │
Execution Gate
     ▼
CHECK
     │
Delivery Check
     ▼
DONE
```

Technical Design 不允许跳过。

---

# 7. 功能迭代流程

对于：

```yaml
type: FEATURE_CHANGE
```

流程：

```text
REQUIREMENT
     │
     ▼
Design Decision
   /        \
Required   Not Required
   │            │
   ▼            │
DESIGN          │
   │            │
   └──────┬─────┘
          ▼
         SPEC
          ↓
      EXECUTION
          ↓
        CHECK
          ↓
         DONE
```

Design Decision 不是状态。

它是 Requirement 阶段的决策结果。

例如：

```yaml
design:
  required: false
  reason: >
    本次仅增加已有 API 的一个可选返回字段，
    不涉及架构、数据库、权限或跨模块变化。
```

Agent 可以提出建议。

最终由 Human Gate 确认。

---

# 8. 技术方案触发条件

APPLICATION_INIT：

```text
永远 required
```

FEATURE_CHANGE：

Agent 根据以下影响因素分析：

```text
architecture_change
database_schema_change
public_api_change
external_integration_change
security_change
permission_change
deployment_change
cross_module_change
data_migration
```

输出：

```text
RECOMMENDED / NOT_RECOMMENDED
```

但不允许 Agent 最终自行批准跳过 Technical Design。

---

# 9. Requirement 阶段

Requirement 不再拆成多个文件。

统一：

```text
requirement.md
```

包含：

```text
Source
Understanding
Scope
Business Rules
Questions
Answers
Baseline
```

示例结构：

```markdown
# Requirement

## Source

原始 PRD / Change Requirement

## Understanding

开发侧对需求的结构化理解。

## Scope

### In Scope

...

### Out of Scope

...

## Business Rules

BR-001 ...

## Questions

### Q-001

Question:
...

Status:
resolved

Answer:
...

## Baseline

最终研发需求基线。
```

核心原则：

> 后续 Design 和 Spec 使用 Requirement Baseline，而不是重新自由解释原始 PRD。

---

# 10. Requirement Gate

最小规则集：

```text
1. Requirement Source 存在
2. Scope 已定义
3. Blocking Questions = 0
4. Baseline 已生成
5. 不存在 TBD / TODO
6. Human Approved
```

对于 FEATURE_CHANGE，还必须存在：

```text
Design Decision
```

---

# 11. Technical Design

Technical Design 属于 Delivery，而不是 Spec Pack。

即：

```text
Delivery
├── requirement.md
├── design.md
└── specs/
```

一个新应用或一次复杂迭代原则上只有一份整体技术方案。

design.md 负责：

```text
系统边界
总体架构
模块设计
数据模型
API
核心流程
权限
异常处理
性能
安全
可观测性
部署
兼容/迁移
测试策略
技术风险
```

禁止下沉到具体编码 Task。

---

# 12. Design Gate

最小规则：

```text
1. design.md 存在
2. 必填设计章节完整
3. 无 TBD / TODO
4. 无 Blocking Issue
5. Requirement 主要内容已覆盖
6. Human Approved
```

FEATURE_CHANGE 且 Design Decision 为不需要时：

```text
DESIGN 状态直接跳过。
```

---

# 13. Spec Split

输入只能来源于已经收敛的上下文：

```text
requirement.md
+
design.md（如果存在）
+
repository context
```

不建议 Agent 在这里重新从 PRD 开始理解需求。

输出：

```text
specs/
├── SP-001/
│   └── spec.md
├── SP-002/
│   └── spec.md
└── ...
```

---

# 14. Spec 标准结构

每个 `spec.md` 至少包含：

```text
Goal
Requirement Sources
Scope
Out of Scope
Acceptance Criteria
Dependencies
Constraints
Expected Impact
```

Technical Design 负责“总体怎么设计”。

Spec 负责：

> 这一包具体交付什么，以及如何判断交付正确。

---

# 15. Spec Gate

最小规则：

```text
1. 至少一个 Spec Pack
2. 每个 Spec 有 Goal
3. Scope / Out of Scope 明确
4. Acceptance Criteria 存在
5. Dependencies 有效
6. 不存在循环依赖
7. Requirement Coverage = 100%
8. 整体 Spec Split Human Approved
```

审批针对整个拆包结果。

不做：

```text
SP-001 approve
SP-002 approve
SP-003 approve
```

---

# 16. Spec Pack 状态机

最终采用极简状态：

```text
READY
  ↓
PLAN
  ↓
CODE
  ↓
CHECK
  ↓
DONE
```

内部归档行为随 `CHECK → DONE` 自动完成。

不额外暴露：

```text
PLAN_APPROVED
CODE_COMPLETE
TESTING
VERIFIED
ARCHIVED
```

这些应属于 Gate / Event，而非 Workflow State。

---

# 17. PLAN

输入：

```text
spec.md
design.md
repository context
```

默认能力：

```text
superpowers:writing-plans
```

输出：

```text
plan.md
```

Plan 应拆成：

> 可以独立开发、独立测试、独立 Review 的实施任务。

每个 Task 内应包含：

```text
Test
Implementation
Verification
```

而不是普通 TODO List。

---

# 18. Plan Gate

最小规则：

```text
1. plan.md 存在
2. 无 TBD / TODO
3. Spec Acceptance Criteria 有 Task 覆盖
4. 每个 Task 有验证方式
5. Spec Dependencies 已满足
```

PLAN 不设置 Human Approval。

Gate 通过后自动进入 CODE。

---

# 19. CODE

CODE 阶段按照 Plan 执行。

默认执行能力：

```text
superpowers:test-driven-development

+

superpowers:subagent-driven-development
或
superpowers:executing-plans
```

执行策略默认：

```yaml
execution:
  strategy: auto
```

判断：

```text
supports subagents
       ?
     /   \
   YES   NO
    ↓     ↓
subagent inline
```

---

# 20. CODE 与测试关系

取消独立 TESTING 状态不代表取消测试。

测试分布在：

```text
PLAN
  ↓
设计测试

CODE
  ↓
TDD 持续测试

CHECK
  ↓
独立最终验证
```

CODE 原则：

```text
RED
 ↓
GREEN
 ↓
REFACTOR
 ↓
Review
```

---

# 21. CHECK

CHECK 定义为：

> Spec Pack 进入 DONE 前的独立综合验证。

包含：

```text
CHECK
│
├── Automated Verification
│   ├── unit test
│   ├── integration test
│   ├── e2e（需要时）
│   ├── lint
│   ├── typecheck
│   └── build
│
├── Spec Verification
│   └── Acceptance Criteria
│
├── Code Review
│
└── Completion Verification
```

默认使用：

```text
superpowers:requesting-code-review
superpowers:verification-before-completion
```

输出：

```text
check.md
```

---

# 22. Check Gate

最小规则：

```text
1. Tests PASS
2. Build PASS
3. 必需 Static Checks PASS
4. Acceptance Criteria PASS
5. Critical Review Issues = 0
6. Important Review Issues = 0
7. Fresh Verification Evidence 存在
```

PASS：

```text
CHECK → DONE
```

自动归档。

FAIL：

原则上：

```text
CHECK → CODE
```

不增加：

```text
CHECK_FAILED
```

这种额外状态。

---

# 23. Delivery EXECUTION

Delivery 进入 EXECUTION 后管理多个 Spec Pack。

例如：

```text
SP-001 DONE
SP-002 CODE
SP-003 READY
SP-004 PLAN
```

Delivery 状态仍然：

```text
EXECUTION
```

只有：

```text
所有 Spec Pack = DONE
```

才进入 Delivery CHECK。

---

# 24. Delivery CHECK

Delivery CHECK 不重复 Spec Pack Code Review。

主要验证：

```text
Requirement Coverage
Cross-Spec Integration
Regression
E2E
Delivery-level Acceptance
```

最小 Gate：

```text
1. All Spec Packs = DONE
2. Requirement Coverage = 100%
3. Integration Verification PASS
4. Regression PASS
5. Delivery Acceptance PASS
```

通过：

```text
CHECK → DONE
```

---

# 25. Human Gate

V1 只保留三个 Human Gate：

```text
Requirement Baseline
Technical Design
Spec Split
```

其中 Technical Design 在跳过 DESIGN 时不存在。

不设置：

```text
Plan Human Approval
Code Human Approval
Check Human Approval
```

代码层的人类 Review 继续复用团队已有 GitHub / GitLab PR Review。

避免重复建设审批系统。

---

# 26. Approval 安全模型

Human Approval 必须绑定 Artifact Hash。

例如：

```yaml
approvals:

  requirement:
    hash: sha256:xxx
    actor_type: human
    approved_by: wangxin

  design:
    hash: sha256:yyy
    actor_type: human
    approved_by: architect-a

  spec:
    hash: sha256:zzz
    actor_type: human
    approved_by: wangxin
```

如果审批后文件发生改变：

```text
Old Hash != New Hash
```

审批立即失效。

Agent 可以：

```text
recommend approval
```

但不能：

```text
approve
```

---

# 27. 项目目录

推荐最终目录：

```text
project/
│
├── .sdd/
│   ├── config.yaml
│   ├── events/
│   └── runtime/
│
├── sdd/
│   └── deliveries/
│       └── DLV-001/
│           ├── delivery.yaml
│           ├── requirement.md
│           ├── design.md
│           │
│           └── specs/
│               ├── SP-001/
│               │   ├── spec.md
│               │   ├── plan.md
│               │   └── check.md
│               │
│               └── SP-002/
│                   ├── spec.md
│                   ├── plan.md
│                   └── check.md
│
├── src/
└── tests/
```

FEATURE_CHANGE 不需要 Design 时：

```text
design.md
```

不创建。

---

# 28. 文件设计原则

明确分成：

## Human Artifacts

```text
requirement.md
design.md
spec.md
plan.md
check.md
```

开发人员和 Agent 阅读。

## Machine Metadata

统一：

```text
delivery.yaml
```

不在每个目录继续增加：

```text
state.yaml
review.yaml
metadata.yaml
manifest.yaml
```

尽量减少文件数量。

---

# 29. `.sdd` 内部目录

```text
.sdd/
```

主要服务框架：

```text
config.yaml
events/
runtime/
cache（如后续需要）
```

原则：

```text
.sdd/  → 给机器看
sdd/   → 给人和 Agent 看
```

---

# 30. Event Store

状态变化保留 Append-only Event Log。

例如：

```text
delivery.created
requirement.generated
requirement.approved
design.generated
design.approved
spec.generated
spec.approved
plan.generated
code.started
check.failed
check.passed
spec.completed
delivery.completed
```

Event Log 默认隐藏。

用户不需要直接操作。

---

# 31. 用户交互入口

SDD 不再定位成纯 CLI 工具。

正式定位：

> Agent-Agnostic SDD Workflow Engine。

支持：

```text
Claude Skills / Slash
Codex Skills
CodeBuddy Commands / Skills
MCP
CLI
Git Hook
CI
```

---

# 32. Logical Actions

Core 不认识具体命令语法。

只定义：

```text
NEW
NEXT
APPROVE
STATUS
DOCTOR
VERIFY
```

不同入口负责映射。

例如：

| Action | Claude | Codex | CodeBuddy | CLI |
|---|---|---|---|---|
| NEW | `/sdd:new` | Skill | `/sdd-new` | `sdd new` |
| NEXT | `/sdd:next` | Skill | `/sdd-next` | `sdd next` |
| APPROVE | `/sdd:approve` | Skill | `/sdd-approve` | `sdd approve` |
| STATUS | `/sdd:status` | Skill | `/sdd-status` | `sdd status` |
| DOCTOR | `/sdd:doctor` | Skill | `/sdd-doctor` | `sdd doctor` |

具体语法由对应 Agent Integration 决定。

---

# 33. CLI

V1 Basic Commands：

```text
sdd init
sdd new
sdd next
sdd approve
sdd status
sdd doctor
```

Advanced / Internal：

```text
sdd verify
sdd inspect
sdd events
sdd repair
sdd config
```

普通开发人员主要使用：

```text
new
next
approve
status
```

---

# 34. `sdd next`

`next` 是最重要的 UX。

它不是：

```text
state++
```

而是：

> 执行当前上下文最合理的下一动作。

内部流程：

```text
Resolve Context
      ↓
Read State
      ↓
Determine Activity
      ↓
Execute Skill
      ↓
Validate Artifact
      ↓
Evaluate Gate
      ↓
Transition / Wait / Fail
      ↓
Write Event
```

---

# 35. Activity 模型

内部统一使用六个 Activity：

```text
REQUIREMENT
DESIGN
SPEC_SPLIT
PLAN
CODE
CHECK
```

State：

> 当前在哪。

Activity：

> 当前做什么。

例如：

```text
Delivery State = EXECUTION
Active Spec = SP-002
Spec State = CODE

Activity = CODE
```

---

# 36. Workflow Engine

Workflow Engine 是系统核心。

职责：

```text
Current State
Allowed Action
Required Artifact
Gate
Transition
Approval
```

外部模块不允许直接修改状态。

---

# 37. Artifact Manager

负责：

```text
路径
命名
模板
Schema
读写
Validation
Hash
```

Skill 负责生成内容。

Artifact Manager 决定内容写到哪里。

例如：

```text
Requirement
→ DLV-001/requirement.md

Design
→ DLV-001/design.md

Plan
→ SP-001/plan.md
```

禁止各 Agent 自己决定产物路径。

---

# 38. Logical Skills

Workflow 不直接依赖真实 Skill 名字。

定义逻辑能力：

```text
requirement-analysis
technical-design
spec-split
implementation-plan
implementation
verification
```

默认映射：

```yaml
requirement-analysis:
  provider: team-sdd
  skill: requirement

technical-design:
  provider: team-sdd
  skill: technical-design

spec-split:
  provider: team-sdd
  skill: spec-split

implementation-plan:
  provider: superpowers
  skill: writing-plans

implementation:
  provider: superpowers
  skills:
    - test-driven-development
    - subagent-driven-development

verification:
  provider: superpowers
  skills:
    - requesting-code-review
    - verification-before-completion
```

---

# 39. Team SDD 自研 Skill

V1 只自研三个：

```text
team-sdd:requirement
team-sdd:technical-design
team-sdd:spec-split
```

不重复实现：

```text
Planning
TDD
Execution
Review
Verification
```

这些优先复用 Superpowers。

---

# 40. Skill Runtime

职责：

```text
Activity
   ↓
Logical Skill
   ↓
Provider
   ↓
Actual Skill
```

Workflow Engine 不知道实际使用的是：

```text
Superpowers
Team SDD Skill
其他 Skill Provider
```

未来可以替换，不修改 Workflow Core。

---

# 41. Agent Runtime

Agent Runtime 不理解 SDD 业务。

只描述当前开发 Agent 能做什么。

统一 Capability Model：

```text
skills
slashCommands
subagents
worktrees
shell
fileRead
fileWrite
mcp
```

执行逻辑必须：

> Capability Driven，而不是 Agent Name Driven。

禁止：

```text
if Claude ...
if Codex ...
```

应使用：

```text
if supportsSubagents ...
```

---

# 42. Execution Strategy

V1 只支持：

```text
auto
inline
subagent
```

默认：

```yaml
execution:
  strategy: auto
```

自动判断：

```text
supports subagents?
  ↓
YES → subagent
NO  → inline
```

---

# 43. Skill Fallback

建议执行优先级：

```text
Native Skill
     ↓
MCP
     ↓
Prompt Adapter
```

即使某个 Agent 没有原生 Skill 系统，只要能够：

```text
读取文件
修改代码
运行 Shell
```

依然可以通过 Prompt Adapter 执行 SDD Logical Skill。

---

# 44. MCP

MCP 不负责实现 Superpowers。

MCP 主要暴露 SDD Engine。

建议 V1 Tools：

```text
sdd_new
sdd_next
sdd_approve
sdd_status
sdd_verify
```

内部可增加：

```text
sdd_get_context
sdd_submit_artifact
```

其中：

### sdd_get_context

返回：

```text
当前 Delivery
当前 State
Active Spec
Activity
需要读取的 Artifact
约束
期望输出
```

### sdd_submit_artifact

Agent 完成工作后提交产物。

Engine 再：

```text
Validate
↓
Gate
↓
Transition
```

---

# 45. Interaction Layer

每个 Agent Integration 只负责：

```text
1. 安装交互入口
2. Logical Action 转换
3. Engine Result 展示
```

不能包含：

```text
状态判断
Gate 判断
状态修改
Artifact Schema
```

---

# 46. 强状态机闭环

最终标准链路：

```text
用户
 ↓
/sdd:next
 ↓
Logical NEXT
 ↓
Workflow Engine
 ↓
Activity
 ↓
Skill Runtime
 ↓
Agent Runtime
 ↓
执行
 ↓
Artifact
 ↓
SDD Engine
 ↓
Validation
 ↓
Gate
 ↓
State Transition
```

最核心的安全原则：

> Agent 能工作，但不能自行宣布工作已经完成。

---

# 47. Git Hook

采用 Fast Gate。

只检查明显流程违规：

```text
非法直接修改状态
阶段越界
关键文件损坏
Approval Hash 失效
```

不在 Git Hook 执行完整测试和复杂 Agent Verification。

目标：

> 快速、稳定、低干扰。

---

# 48. CI

CI 是最终 Trust Gate。

统一执行：

```text
sdd verify --ci
```

检查：

```text
Workflow integrity
Artifact validation
Approval integrity
State transition integrity
Required tests
Build
Required checks
```

CI 不关心：

```text
Claude
Codex
CodeBuddy
```

只关心 Repository 最终状态是否可信。

---

# 49. Verify 统一入口

避免 Git Hook、CLI、CI 维护三份校验代码。

统一：

```text
sdd verify
```

模式：

```text
sdd verify --hook
→ Fast

sdd verify
→ Normal

sdd verify --ci
→ Full
```

---

# 50. 初始化和团队分发

`sdd init` 是：

> 项目初始化命令。

项目负责人执行一次：

```text
sdd init
git add .
git commit
```

项目配置、Agent Integration 等可随 Git 分发。

团队成员：

```text
git clone
```

原则上即可使用大部分 SDD 能力。

个人环境异常：

```text
sdd doctor
```

修复：

```text
sdd doctor --fix
```

不要求每个人重新执行完整 `sdd init`。

---

# 51. Developer UX

新人培训只需要：

```text
收到新需求：
→ sdd new
或桌面 Agent 的 sdd:new

继续流程：
→ sdd next

需要人工确认：
→ sdd approve

不知道当前状态：
→ sdd status

环境异常：
→ sdd doctor
```

桌面端则映射为对应 Slash / Skill。

---

# 52. Status UX

示例：

```text
DLV-003 · 学籍异动审批优化

Workflow
────────────────────
Requirement   ✓
Design        ✓
Spec          ✓
Execution     ●
Check         ○
Done          ○

Spec Packs
────────────────────
SP-001 异动申请       DONE
SP-002 异动审批       CODE
SP-003 消息通知       READY

Current
────────────────────
SP-002 / CODE

Plan
8 / 12 tasks

Next
/sdd:next
```

Status 是用户恢复上下文的主要入口。

---

# 53. Gate Failure UX

禁止只输出：

```text
RULE_041 FAILED
```

必须输出：

```text
Cannot enter CHECK.

2 issues need attention:

1. Plan task #7 is incomplete
   → Complete task #7

2. AC-006 has no integration test
   → Add a test covering approval workflow

Current state remains CODE.
```

Gate 必须：

> 可理解 + 可修复 + 给出明确下一步。

---

# 54. V1 明确不做

V1 不建设：

```text
中央管理后台
Web UI
Jira / 飞书深度集成
云端 State Store
多 Repository Delivery
自定义 Workflow DSL
用户自定义状态机
多层 Spec Pack
多级审批平台
自建 Coding Agent
自建测试框架
替代 GitHub / GitLab PR
复杂 Swarm / Multi-Agent Graph
```

避免框架演化成研发管理平台。

---

# 55. V1 产品边界

V1 只解决：

> 把需求 → 技术方案 → Spec Pack → Plan → Code → Check 变成一套 Agent 无关、可执行、可审计的团队研发流程。

---

# 56. V1 总体架构

```text
 Claude / Codex / CodeBuddy / CLI
               │
               ▼
      Interaction Layer
 Slash / Skill / MCP / CLI
               │
               ▼
         Logical Action
               │
               ▼
      ┌──────────────────┐
      │ Workflow Engine  │
      │                  │
      │ State            │
      │ Gate             │
      │ Approval         │
      │ Transition       │
      └────────┬─────────┘
               │
     ┌─────────┼────────────┐
     ▼         ▼            ▼
 Artifact    Skill       State/Event
 Manager     Runtime        Store
               │
               ▼
         Logical Skill
               │
        ┌──────┴──────┐
        ▼             ▼
  Team SDD Skills  Superpowers
        │             │
        └──────┬──────┘
               ▼
         Agent Runtime
         /     |      \
        ▼      ▼       ▼
     Claude  Codex  CodeBuddy

────────────────────────────────

 Repository Governance

 Git Hook
     ↓
 Fast Gate

 CI
     ↓
 Trust Gate
```

---

# 57. 最终设计原则

### P1. Strong internally, simple externally

复杂度留在 Engine 内部。

---

### P2. Agent does work, Engine decides state

Agent 负责研发工作。

SDD Engine 负责流程事实。

---

### P3. Artifacts are contracts

```text
requirement.md
design.md
spec.md
plan.md
check.md
```

是各阶段之间的正式契约。

---

### P4. State is phase, Gate is completion

不要为每个结果创造一个 State。

---

### P5. Human approval only where it matters

只保留：

```text
Requirement
Design
Spec
```

三个关键 Human Gate。

---

### P6. Capability-driven Agent integration

Workflow 永远不要写死 Claude / Codex / CodeBuddy。

---

### P7. Superpowers is a provider, not the framework

优先复用 Superpowers，但 SDD Core 不依赖 Superpowers。

---

### P8. Convention over configuration

团队默认配置应该能够直接工作。

---

### P9. One primary continuation action

正常研发统一使用：

```text
NEXT
```

---

### P10. Repository is the Source of Truth

V1 不依赖中央服务。

代码、Artifact、Metadata、Event 一起进入 Git。

---

# 58. V1 成功标准

Team SDD V1 可以认为成功，需要满足：

1. 新开发者能在较短培训后理解 Delivery + Spec Pack。
2. Claude、Codex、CodeBuddy 可以执行同一套 Workflow。
3. 用户无需学习三套 Agent 专属 SDD 流程。
4. Agent 无法绕过 Engine 合法推进状态。
5. Requirement、Design、Spec 的审批修改可被检测。
6. Spec Pack 可以独立 PLAN → CODE → CHECK。
7. CI 能独立判断 Repository 当前 SDD 状态是否合法。
8. 新增第四种 Coding Agent 不需要修改 Workflow Core。
9. 开发者日常主要只使用 NEXT / APPROVE / STATUS。
10. SDD 自身不会替代已有 Git、PR、CI 和测试体系。