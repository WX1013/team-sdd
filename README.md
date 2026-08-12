# Team SDD Core

Team SDD Core 用于治理从 Requirement 到 Check 的完整 Delivery 流程。它提供本地 CLI、标准 stdio MCP Server 以及仓库本地 Codex Plugin，且不会重复实现工作流或 Gate 规则。

## 快速开始

```bash
npm run build
node dist/mcp-server.js
```

MCP Server 仅通过标准输入输出通信。每次 Tool 调用都必须在 `root` 中提供目标仓库的绝对路径。

## 命令行（CLI）

从 `dist` 运行 CLI 前，请先构建包：

```bash
npm run build
node dist/cli.js init
node dist/cli.js status DLV-001
node dist/cli.js doctor
node dist/cli.js inspect DLV-001
node dist/cli.js events DLV-001
node dist/cli.js config show
node dist/cli.js config set execution.strategy subagent
node dist/cli.js repair DLV-001
node dist/cli.js repair DLV-001 --dry-run
node dist/cli.js repair DLV-001 --apply
node dist/cli.js verify DLV-001
node dist/cli.js verify --hook
node dist/cli.js verify --ci
```

仓库验证依赖仓库自有的 `.sdd/config.yaml`。新仓库可通过 `node dist/cli.js init` 创建它；本仓库已提交默认配置。Hook 模式无需 Delivery 参数，只执行仓库完整性验证，绝不会执行项目命令。CI 模式会先验证每个 Delivery，仅当审计通过后，才按已提交配置运行下列固定、无 Shell 的命令：

```text
npm test
npm run typecheck
npm run build
```

这些命令数组是严格配置，而不是调用方输入。命令失败会生成 `CI_CHECK_FAILED` 发现项，其中包含固定命令及简明输出。

为便于集成，下列命令支持通过 `--json` 取得稳定的 JSON 结果：`status`、`verify`（普通、Hook 和 CI 模式）、`doctor`、`inspect`、`events`、`config show`、`config set` 和 `repair`。JSON 响应会在 stdout 输出相应服务结果；结构化发现项仍返回退出码 2。

`repair` 默认预览将要创建的准确派生路径；`--dry-run` 显式请求同样的预览。创建任何派生路径都必须提供 `--apply`，且它不能与 `--dry-run` 同时使用。

包的 CI 命令会运行已构建的 CLI。干净检出后可执行：

```bash
npm ci
npm run build
npm run verify:ci
```

## GitHub Actions 可信门禁

已提交的 [Team SDD CI 工作流](./.github/workflows/team-sdd.yml) 会在每次 push 与 pull request 时运行。它安装锁定依赖、构建包，然后运行 `npm run verify:ci`，在接受改动前验证仓库可信度。此自动门禁是对常规 Pull Request 实现与产品决策审查的补充，而非替代。

## MCP 工具

- `sdd_new` — 创建 Delivery。
- `sdd_status` — 读取 Delivery 状态和产物。
- `sdd_next` — 读取由 Engine 决定的下一项活动。
- `sdd_verify` — 评估当前 Gate，不修改状态。
- `sdd_approve` — 记录经授权的产物审批。
- `sdd_submit_artifact` — 通过 Core Gates 提交产物及其证据。
- `sdd_get_context` — 获取 Agent 指令、允许路径和阻塞项。

Business Gate 阻塞项会以 `{ "ok": false, "findings": [...] }` 返回。输入、领域和文件系统失败会以 `{ "ok": false, "error": { "code", "message" } }` 返回。

## Codex 插件

仓库本地插件位于 [`plugins/team-sdd`](./plugins/team-sdd)。启用前请构建包，以便其 MCP 配置能够运行 `dist/mcp-server.js`。

随附的 `team-sdd` Skill 会以 `sdd_get_context` 开始工作，只写入 Context 返回的产物路径，并通过 `sdd_submit_artifact` 提交每一个工作流产物。

## 原生 Agent 集成

这些是 Team SDD Core 所在仓库的源产物。它们不是全局安装，也不提供远程 Agent 服务。

- **Codex Plugin：**构建包后，使用 [`plugins/team-sdd`](./plugins/team-sdd) 中的仓库本地插件。它的 Skill 与 MCP 配置使用本地 `dist/mcp-server.js` 运行时。
- **Claude Code：**源插件位于 [`integrations/claude-code`](./integrations/claude-code)。在目标仓库中运行 `npm run build` 后，执行 `claude --plugin-dir ./integrations/claude-code` 加载它。它的 MCP 配置会启动 `${CLAUDE_PROJECT_DIR}/dist/mcp-server.js`，因此 Claude Code 始终使用目标仓库中已构建的运行时。
- **CodeBuddy：**源包位于 [`integrations/codebuddy`](./integrations/codebuddy)。在目标仓库中运行 `npm run build` 后，安装其 `.codebuddy` 目录，并按下方无覆盖协议配置目标根目录 `.mcp.json`。CodeBuddy 首次启动本地 MCP Server 前可能要求批准。

### CodeBuddy `.mcp.json` 无覆盖协议

绝不能替换已有目标 `.mcp.json`，也不能使用直接覆盖的复制方式。

1. `.mcp.json` 不存在时，将 `integrations/codebuddy/.mcp.json` 的源配置复制到目标仓库根目录。
2. `.mcp.json` 已存在时，保留每个既有 `mcpServers` 条目。仅将 [`integrations/codebuddy/.mcp.json`](./integrations/codebuddy/.mcp.json) 中的 `team-sdd` 定义手动合并到既有 `mcpServers` 对象。
3. 不要替换既有 `mcpServers` 对象或其中任一条目。保存前确认既有服务器和新增的 `team-sdd` 服务器都存在。

例如，保留既有条目，仅添加源 `team-sdd` 条目：

```json
{
  "mcpServers": {
    "existing-server": { "command": "existing-command" },
    "team-sdd": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/mcp-server.js"]
    }
  }
}
```

三种集成都将工作流操作委派给本地 Core MCP Server。集成使用期间请保留生成的 `dist` 目录。
