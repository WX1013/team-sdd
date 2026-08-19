# Team SDD Core

`@zbp/sdd` 是面向团队的受治理研发工作流：Agent 负责完成产物，Core 负责 Gate、审批、状态和事件审计。它可用于 Node、Java、Go、Python、.NET 等任意工程，并支持 Claude Code、CodeBuddy 与 Codex 的项目级使用。

本页面向业务项目使用者。维护、测试和 Nexus 发布请阅读 [MAINTAINERS.md](./MAINTAINERS.md)。

## 1. 首次安装

需要 Node.js 20+，并能访问团队 Nexus。首次使用时，在个人 `~/.npmrc` 配置一次团队 Registry：

```ini
@zbp:registry=https://nexus.zyzbp.cn/repository/npm-group/
```

在目标工程根目录选择一个正在使用的 Agent，执行对应命令。无论工程是 Java、Go、Python、.NET 还是 Node，都可以安装；没有 `package.json` 时会自动创建最小私有清单。

### Claude Code

```bash
npx @zbp/sdd init --agents claude --install
```

重新打开项目后即可使用 `/sdd:new`、`/sdd:next` 等命令。

### CodeBuddy

```bash
npx @zbp/sdd init --agents codebuddy --install
```

重新打开项目后即可使用 `/sdd:new`、`/sdd:next` 等命令。

### Codex

```bash
npx @zbp/sdd init --agents codex --install --register-codex
```

重新打开项目后即可使用 `/sdd-new`、`/sdd-next` 等命令。Codex 使用连字符形式。

### 更新 Team SDD

在项目根目录更新包，再同步当前使用的 Agent：

```bash
npm install -D @zbp/sdd@latest

npx sdd agents sync --agents claude
```

将第二行替换为 `codebuddy`；Codex 则使用 `npx sdd agents sync --agents codex --register-codex`。完成后重新打开对应 Agent。

## 2. 完成第一个 Delivery

下面以 `DLV-001` 演示。三种入口共享同一个 Core；无论使用哪个 Agent，状态、审批和事件记录都一致。Agent 负责产物与提交，人只在需要审批时授权。

### CodeBuddy 桌面程序

安装并打开 CodeBuddy 桌面程序，选择 **Open Folder** 打开已安装 Team SDD 的项目。在聊天框依次输入：

```text
/sdd:new DLV-001 "会员中心 V1" APPLICATION_INIT
/sdd:next DLV-001
```

根据 `/sdd:next` 的指引完成 Requirement。随后由产品负责人在同一聊天中授权：

```text
/sdd:approve DLV-001 requirement "产品负责人"
/sdd:next DLV-001
```

继续按每次 `/sdd:next DLV-001` 的指引完成 Design、Spec Pack、Plan、Code 与 Check；随时用 `/sdd:status DLV-001` 查看进度。

### Codex 桌面程序

安装并打开 Codex 桌面程序，选择项目文件夹并重新加载项目。在聊天框使用连字符形式：

```text
/sdd-new DLV-001 "会员中心 V1" APPLICATION_INIT
/sdd-next DLV-001
```

完成 Requirement 后，由产品负责人在同一聊天中授权：

```text
/sdd-approve DLV-001 requirement "产品负责人"
/sdd-next DLV-001
```

之后按 `/sdd-next DLV-001` 的指引完成余下阶段，用 `/sdd-status DLV-001` 查看进度。Codex 不使用冒号形式。

### Claude Code 命令行

在终端进入项目根目录，启动 Claude Code：

```bash
claude
```

然后在 Claude Code 中使用冒号形式：

```text
/sdd:new DLV-001 "会员中心 V1" APPLICATION_INIT
/sdd:next DLV-001
```

完成 Requirement 后，由产品负责人在同一会话中授权：

```text
/sdd:approve DLV-001 requirement "产品负责人"
/sdd:next DLV-001
```

之后按 `/sdd:next DLV-001` 的指引完成余下阶段，用 `/sdd:status DLV-001` 查看进度。

共同节奏：创建 Delivery → `next` 完成当前产物 → 人工 `approve`（Requirement、Design、Spec）→ 再次 `next`。最后 `/sdd:status` 显示 `DONE`。如果 `next` 返回阻塞项，先修复该项。

`npx sdd` 是备用入口，适合 CI、脚本或排障；日常协作优先使用对应 Agent 的短命令。

## 3. Team SDD 工作流、治理与自定义

核心流程遵循 PRD：

```text
Requirement → Technical Design（按类型/人工决定） → Spec Pack → Plan → Code → Check → Done
```

`APPLICATION_INIT` 必须经过 Technical Design。`FEATURE_CHANGE` 需要由人记录 Design Decision；只有明确决定“不需要”时才跳过 Design。Agent 可以分析、写产物、执行代码和测试；Engine 才能校验 Gate、保存事件并推进状态；Human Gate 只发生在 Requirement、Design、Spec Split 三处。

| 环节 | 主要产物 | 通过条件 | 常用动作 |
|---|---|---|---|
| Requirement | `requirement.md` | Source、Scope、无阻塞问题、Baseline、人工审批 | `template requirement`、`approve`、`submit` |
| Technical Design | `design.md` | 必填设计章节、需求覆盖、人工审批 | `template design`、`approve`、`submit` |
| Spec Pack | `specs/SP-*/spec.md` | 完整结构、依赖合法、需求覆盖、整体人工审批 | `spec create`、`template spec`、`approve`、`submit` |
| Plan | `plan.md` | 每个 AC 有 Task 覆盖；每项有 Test、Implementation、Verification | `submit ... plan` |
| Code | 项目代码与测试 | 按 `next` 给出的 Provider、Skill 和策略完成 | `next` |
| Check | Spec/Delivery `check.md` | 测试、构建、静态检查、AC、审查与新鲜证据均通过 | `submit ... check` |

### 命令参考

日常使用时优先在 Agent 中输入以下命令：

| 动作 | Claude Code / CodeBuddy | Codex | 用途 |
|---|---|---|---|
| 创建 | `/sdd:new <id> "<标题>" <类型>` | `/sdd-new <id> "<标题>" <类型>` | 创建 Delivery。类型为 `APPLICATION_INIT` 或 `FEATURE_CHANGE`。 |
| 下一步 | `/sdd:next <id>` | `/sdd-next <id>` | 获取当前唯一允许的工作与阻塞项。 |
| 状态 | `/sdd:status <id>` | `/sdd-status <id>` | 查看 Workflow、Spec Packs、Current 与 Next。 |
| 审批 | `/sdd:approve <id> <artifact> "<审批人>"` | `/sdd-approve <id> <artifact> "<审批人>"` | 审批 `requirement`、`design` 或 `spec`。 |
| 诊断 | `/sdd:doctor` | `/sdd-doctor` | 检查项目、Agent 配置与 Git Hook。 |

没有 Agent、在脚本中或需要排障时使用 CLI：

```bash
npx sdd new DLV-001 --title "会员中心 V1" --type APPLICATION_INIT
npx sdd status DLV-001
npx sdd next DLV-001
npx sdd inspect DLV-001
npx sdd events DLV-001
npx sdd verify DLV-001
npx sdd doctor
```

### 审批、状态与事件

Requirement、Design、Spec 的审批均绑定当前产物的 SHA-256 hash。审批后修改文件会自动使审批失效，必须重新审批。`delivery.yaml` 和 `.sdd/events/*.jsonl` 是 Engine 管理的事实记录；不要手工修改它们。

### 执行策略

项目配置位于 `.sdd/config.yaml`。执行策略决定 `next` 为当前 Agent 推荐内联执行还是子 Agent 执行：

```bash
npx sdd config show
npx sdd config set execution.strategy auto
```

| 策略 | 行为 |
|---|---|
| `auto` | Agent 支持 subagent 时使用子 Agent，否则在当前会话内执行。 |
| `inline` | 始终在当前 Agent 会话内执行。 |
| `subagent` | 强制要求子 Agent；当前 Agent 不支持时，`next` 会明确阻塞。 |

### Logical Skills 与固定检查

可选 `logical_skills` 只能在 PRD 规定的 Provider/Skill 组合内调整，不能接入任意外部命令或 Skill。以下示例把实现阶段限定为 TDD：

```yaml
version: 1
execution:
  strategy: auto

logical_skills:
  implementation:
    provider: superpowers
    skills:
      - test-driven-development

checks:
  test: [npm, test]
  typecheck: [npm, run, typecheck]
  build: [npm, run, build]
```

默认路由为：

| 逻辑阶段 | Provider / Skill |
|---|---|
| Requirement | `team-sdd / requirement` |
| Technical Design | `team-sdd / technical-design` |
| Spec Split | `team-sdd / spec-split` |
| Implementation Plan | `superpowers / writing-plans` |
| Implementation | `superpowers / test-driven-development`、`subagent-driven-development` |
| Verification | `superpowers / requesting-code-review`、`verification-before-completion` |

`checks` 是固定可信基线：`npm test`、`npm run typecheck`、`npm run build`。不能通过项目配置改成任意 Shell 命令。

### 团队诊断、Git Hook 与 CI

```bash
# 只读诊断；有问题时先按结果修复
npx sdd doctor

# 仅修复 Doctor 明确列出的安全本地项
npx sdd doctor --fix

# 正常 Delivery 校验、快速 Hook 校验、完整 CI 校验
npx sdd verify DLV-001
npx sdd verify --hook
npx sdd verify --ci
```

Git Hook 只运行快速流程完整性校验；CI 先审计仓库、审批、事件和 Gate，再运行固定三项检查。Agent 适配或 MCP 配置有冲突时，先运行 `doctor` 和 `agents sync`；不要覆盖现有 `.mcp.json` 或用户自定义的同名命令。
