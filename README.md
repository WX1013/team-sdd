# Team SDD Core

`@zbp/sdd` 是面向团队的受治理研发工作流：Agent 负责完成产物，Core 负责 Gate、审批、状态和事件审计。它可用于 Node、Java、Go、Python、.NET 等任意工程，并支持 Claude Code、CodeBuddy 与 Codex 的项目级使用。

本页面向业务项目使用者。维护、测试和 Nexus 发布请阅读 [MAINTAINERS.md](./MAINTAINERS.md)。

## 1. 首次安装

前提是 Node.js 20 或更高版本，以及能访问团队 Nexus。首次使用时，在个人 `~/.npmrc` 或 CI Secret 配置 Scope Registry；不要将 Token 或 `.npmrc` 提交到项目：

```ini
@zbp:registry=https://nexus.zyzbp.cn/repository/npm-hosted/
```

在目标工程根目录选择正在使用的 Agent，执行对应的一条命令。无论项目原本是何种技术栈，显式 `--install` 都会将 Team SDD 安装为该项目的开发依赖，并创建 `.sdd/`、所选 Agent 的项目级命令，以及所需的 MCP 配置。

`package.json` 不存在时，安装器只会创建下面这个最小私有清单，再安装 Team SDD；不会创建或修改 Maven、Gradle、Cargo、Poetry、pip、NuGet 等其他依赖文件。已有的普通 `package.json` 不会被覆盖。

```json
{
  "private": true
}
```

### Claude Code

```bash
npx @zbp/sdd init --agents claude --install
```

重新加载当前项目后，使用 `/sdd:new`、`/sdd:next`、`/sdd:status`、`/sdd:approve`、`/sdd:doctor`。命令和 Skill 会写入 `.claude/`，项目根目录 `.mcp.json` 中会安全合并 `team-sdd` Server。

### CodeBuddy

```bash
npx @zbp/sdd init --agents codebuddy --install
```

重新打开当前项目后，使用 `/sdd:new`、`/sdd:next`、`/sdd:status`、`/sdd:approve`、`/sdd:doctor`。命令和 Skill 会写入 `.codebuddy/`。若项目已有 `.mcp.json`，安装器保留全部已有 MCP Server，只合并 `team-sdd`，绝不覆盖原配置。

### Codex

```bash
npx @zbp/sdd init --agents codex --install --register-codex
```

`--register-codex` 会显式注册本项目的本地 Marketplace；完成后重新打开项目。在 Codex 使用 `/sdd-new`、`/sdd-next`、`/sdd-status`、`/sdd-approve`、`/sdd-doctor`。Codex 使用连字符命令，插件文件位于 `.agents/plugins/team-sdd/`。

安装完成后，所有工程都可在根目录用 `npx sdd ...` 调用当前项目已安装的版本。后续增加或更新适配时运行：

```bash
npx sdd agents sync --agents claude
npx sdd agents sync --agents codebuddy
npx sdd agents sync --agents codex --register-codex
```

同步只更新 Team SDD 记录且未被用户修改的文件；出现同名命令或 `team-sdd` MCP 冲突时会停止，而不会覆盖用户配置。

## 2. 完成第一个 Delivery

下面用新应用 `DLV-001` 演示从开始到完成的完整过程。请按实际使用的入口执行；三种方式都调用同一个 Core，状态、审批和事件记录完全一致。Agent 负责按 `next` 返回的指引创建产物、调用受治理的 Core 提交；人只在需要审批时明确授权。

### CodeBuddy 桌面程序

在 CodeBuddy 桌面程序中打开项目，依次输入：

```text
/sdd:new DLV-001 "会员中心 V1" APPLICATION_INIT
/sdd:next DLV-001
```

根据 `next` 的结果让 Agent 完成当前产物。Requirement 完成后，由产品负责人明确授权并输入：

```text
/sdd:approve DLV-001 requirement "产品负责人"
/sdd:next DLV-001
```

`APPLICATION_INIT` 接着会要求完成并审批 Technical Design；随后创建和审批 Spec Pack。每完成一个阶段，都执行 `/sdd:next DLV-001` 获取唯一允许的下一步。实现、测试与 Check 由 Agent 按返回的 Provider、Skill 和检查项完成；随时可用 `/sdd:status DLV-001` 查看状态。

### Codex 桌面程序

在 Codex 桌面程序中打开项目，使用连字符形式：

```text
/sdd-new DLV-001 "会员中心 V1" APPLICATION_INIT
/sdd-next DLV-001
```

完成 Requirement 后，由产品负责人明确授权：

```text
/sdd-approve DLV-001 requirement "产品负责人"
/sdd-next DLV-001
```

之后按照每次 `/sdd-next DLV-001` 的指引完成 Design、Spec Pack、Plan、Code 与 Check。用 `/sdd-status DLV-001` 查看进度。Codex 不使用冒号形式，这是它的命令语法限制。

### Claude Code 命令行

在项目根目录启动 Claude Code 后，在 Claude Code 的命令行中使用冒号形式：

```text
/sdd:new DLV-001 "会员中心 V1" APPLICATION_INIT
/sdd:next DLV-001
```

Requirement 完成后，由产品负责人明确授权：

```text
/sdd:approve DLV-001 requirement "产品负责人"
/sdd:next DLV-001
```

此后继续按 `/sdd:next DLV-001` 返回的步骤完成 Design、Spec Pack、Plan、Code 与 Check；用 `/sdd:status DLV-001` 查看进度。Claude Code 的命令运行在终端，但与桌面 Agent 使用相同的项目级 MCP 和治理边界。

三个入口的共同节奏是：创建 Delivery → `next` 完成当前产物 → 人工 `approve`（Requirement、Design、Spec）→ 再次 `next`。最后 `/sdd:status` 显示 `DONE`。如果 `next` 返回阻塞项，先修复该项，不要手工修改 `delivery.yaml` 或事件文件。

`npx sdd` 是备用入口，适合没有 Agent、CI、脚本或排障；它不是上述团队日常协作的主入口。例如可运行 `npx sdd doctor`、`npx sdd status DLV-001` 和 `npx sdd verify DLV-001`。

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

### 审批、状态与事件

Requirement、Design、Spec 的审批均绑定当前产物的 SHA-256 hash。审批后修改文件会自动使审批失效，必须重新审批。`delivery.yaml` 和 `.sdd/events/*.jsonl` 是 Engine 管理的事实记录；不要手工修改它们。需要诊断时使用：

```bash
npx sdd status DLV-001
npx sdd inspect DLV-001
npx sdd events DLV-001
npx sdd verify DLV-001
```

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
