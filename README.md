# Team SDD Core

`@zbp/sdd` 是面向项目的受治理开发工作流工具。它提供 CLI、MCP Server 和 Claude Code、Codex、CodeBuddy 的项目级适配：你创建 Delivery、按提示编写产物、提交产物，Core 负责校验 Gate、审批状态和事件审计。

本页只说明如何在业务项目中安装、使用和配置。维护本包、运行测试、发布 Nexus 版本，请阅读 [MAINTAINERS.md](./MAINTAINERS.md)。

## 安装与初始化

前提：Node.js 20 或更高版本，且项目根目录已有 `package.json`。

首次使用时，在个人 `~/.npmrc` 或 CI Secret 中配置 Nexus；不要把 Token 或 `.npmrc` 提交到项目：

```ini
registry=https://nexus.zyzbp.cn/repository/npm-group/
@zbp:registry=https://nexus.zyzbp.cn/repository/npm-hosted/
```

在目标项目根目录执行一次初始化。下列命令会安装当前包为项目开发依赖、创建 `.sdd/config.yaml`、安全合并 `.mcp.json` 的 `team-sdd` Server，并安装三种 Agent 的项目级适配：

```bash
npx @zbp/sdd init --agents all --install --register-codex
```

只使用部分 Agent 时可改为：

```bash
# 只安装 Claude Code
npx @zbp/sdd init --agents claude --install

# 安装 Codex 与 CodeBuddy；Codex 需要显式注册本项目插件
npx @zbp/sdd init --agents codex,codebuddy --install --register-codex
```

安装完成后，后续在项目根目录使用 `npx sdd ...`。已安装版本会来自当前项目的 `node_modules`，不会依赖一次性的 npx 缓存。

## 快速开始

```bash
# 1. 创建工作项
npx sdd new DLV-001 --title "会员资料查询" --type FEATURE_CHANGE

# 2. 对 Feature 先评估是否需要技术设计；此步骤不改变状态
npx sdd design assess DLV-001 \
  --impact public_api_change \
  --reason "新增查询接口"

# 3. 由人类记录最终决定，才允许需求向后推进
npx sdd design decide DLV-001 \
  --required true \
  --reason "接口变更需要设计评审" \
  --by "wangx"

# 4. 查看状态与下一步
npx sdd status DLV-001
npx sdd next DLV-001
```

`next` 不会自动启动外部 Agent。它会显示当前活动、实际 Provider/Skill、可用适配方式、执行策略、产物路径和必须先解决的阻塞项。按照其指令完成产物后，通过 `submit` 提交；不要直接修改 `delivery.yaml` 或事件日志。

## 日常工作流

| 目标 | 命令 |
|---|---|
| 查看当前进度、Spec 与计划任务完成数 | `npx sdd status DLV-001` |
| 获取下一步与 Skill 指令 | `npx sdd next DLV-001` |
| 生成 Requirement / Design / Spec 模板 | `npx sdd template requirement DLV-001`<br>`npx sdd template design DLV-001`<br>`npx sdd template spec DLV-001 --spec SP-001` |
| 人类审批 Requirement、Design 或 Spec 集 | `npx sdd approve DLV-001 requirement --by "姓名"` |
| 创建 Spec Pack | `npx sdd spec create DLV-001 SP-001 --title "查询接口" --acceptance-criterion AC-001` |
| 提交产物 | `npx sdd submit DLV-001 requirement`<br>`npx sdd submit DLV-001 design`<br>`npx sdd submit DLV-001 spec --spec SP-001` |
| 提交计划和检查证据 | `npx sdd submit DLV-001 plan --spec SP-001`<br>`npx sdd submit DLV-001 check --spec SP-001 --tests "npm test" --build "npm run build" --static-check "npm run typecheck"` |
| 校验当前 Gate | `npx sdd verify DLV-001` |

产物约定由 Gate 强制校验：Requirement 中使用 `REQ-###` 与 `BR-###`；Design 的 `Requirement Coverage` 和全部 Spec 的 `Requirement Sources` 覆盖这些标识；每个 Plan Task 要有 Test、Implementation、Verification；Spec Check 要记录每个 AC 的 PASS、零 Critical/Important 审查问题和新鲜验证证据。

## 原生 Agent 如何介入

三个 Agent 都遵循同一边界：先从项目内 Core 获取 Context，再按 `skillRuntime.instructions` 执行，最后仅通过 Core 提交产物或审批。它们不直接改动 `.sdd`、Delivery metadata、审批或 Event Log。选择你正在使用的桌面应用即可，无需同时安装三者。

### CodeBuddy：在桌面会话中介入

适用于在 CodeBuddy 桌面应用中对当前项目进行需求、设计、实现或验证。首次在项目根目录执行：

```bash
npx @zbp/sdd init --agents codebuddy --install
```

重新打开该项目后，使用 `/sdd:new` 创建工作项，使用 `/sdd:next` 获取下一步并继续；也可使用 `/sdd:status`、`/sdd:approve`、`/sdd:doctor`。安装结果位于 `.codebuddy/commands/sdd/`。

### Codex：通过项目插件介入

适用于在 Codex 桌面应用中把 Team SDD 作为项目插件使用。首次执行：

```bash
npx @zbp/sdd init --agents codex --install --register-codex
```

`--register-codex` 会显式注册当前项目的本地 Marketplace；完成后重新打开项目。在 Codex 中使用 `/sdd-new`、`/sdd-next`、`/sdd-status`、`/sdd-approve`、`/sdd-doctor`。插件文件位于 `.agents/plugins/team-sdd/`；Codex 使用连字符而不是冒号。

### Claude Code：通过项目命令介入

适用于在 Claude Code 中围绕当前项目执行受治理开发流程。首次执行：

```bash
npx @zbp/sdd init --agents claude --install
```

重新加载 Claude Code 的项目后，使用 `/sdd:new`、`/sdd:next`、`/sdd:status`、`/sdd:approve`、`/sdd:doctor`。命令文件位于 `.claude/commands/sdd/`，并使用当前项目内的 MCP Server。

### 同步或切换 Agent

需要新增、更新或组合多个 Agent 时，运行：

```bash
npx sdd agents sync --agents all --register-codex
```

同步只更新 Team SDD 清单记录且未被修改的文件，并保留其他 MCP Server。若发现同名自定义内容或 `team-sdd` MCP 配置冲突，它会停止；先运行 `npx sdd doctor`，手工处理冲突，不要删除或覆盖用户已有配置。

## 自定义项目配置

配置位于 `.sdd/config.yaml`。可先查看和调整执行策略：

```bash
npx sdd config show
npx sdd config set execution.strategy auto
# 也可设为 inline 或 subagent
```

| 策略 | 行为 |
|---|---|
| `auto` | Agent 支持 subagent 时使用它，否则内联执行。 |
| `inline` | 始终在当前 Agent 会话执行。 |
| `subagent` | 强制要求 subagent；当前 Agent 不支持时，`next` 会明确阻塞。 |

也可手工在 `.sdd/config.yaml` 添加 `logical_skills`，只覆盖需要调整的一条路由。Provider 与 Skill 必须保持 PRD 定义的组合，不能指向任意外部技能；单个 `skill` 会自动归一化为 `skills`：

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

默认逻辑路由如下：

| 逻辑阶段 | Provider / Skill |
|---|---|
| Requirement | `team-sdd / requirement` |
| Design | `team-sdd / technical-design` |
| Spec Split | `team-sdd / spec-split` |
| Implementation Plan | `superpowers / writing-plans` |
| Implementation | `superpowers / test-driven-development`、`subagent-driven-development` |
| Verification | `superpowers / requesting-code-review`、`verification-before-completion` |

`checks` 是 CI 可信基线，固定为 `npm test`、`npm run typecheck`、`npm run build`，不能通过项目配置改写。

## 诊断与修复

```bash
# 只读诊断（推荐先执行）
npx sdd doctor

# 仅修复 Doctor 明确列出的安全本地配置项
npx sdd doctor --fix

# 查看完整状态、事件和审批有效性
npx sdd inspect DLV-001
npx sdd events DLV-001

# 仅预览可创建的派生目录；需要 --apply 才会写入
npx sdd repair DLV-001 --dry-run
npx sdd repair DLV-001 --apply
```

需要供脚本调用时，大多数诊断和读取命令支持 `--json`。业务 Gate 未通过时退出码为 `2`，参数或环境错误为 `1`。

## 原生 Agent 集成

通常只需运行初始化命令。下面路径用于确认是否已写入项目：Claude Code 位于 `.claude/commands/sdd/`，CodeBuddy 位于 `.codebuddy/commands/sdd/`，Codex 位于 `.agents/plugins/team-sdd/`。所有适配均使用 `node_modules/@zbp/sdd/dist/mcp-server.js`。

源码仓库直接调试原生集成时，可参考 `plugins/team-sdd`、`integrations/claude-code` 和 `integrations/codebuddy`；维护步骤见 [MAINTAINERS.md](./MAINTAINERS.md)。CodeBuddy **绝不能替换已有目标 `.mcp.json`**：`.mcp.json` 不存在时才复制；`.mcp.json` 已存在时保留所有 `mcpServers`，只合并 `team-sdd` 条目。
