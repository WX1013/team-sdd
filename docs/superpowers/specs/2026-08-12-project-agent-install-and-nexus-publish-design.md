# 项目级 Agent 安装与 Nexus npm 发布设计

## 目标

将 Team SDD 以私有 npm 包 `@zbp/sdd` 发布到 Nexus Hosted Registry，并让项目通过一条命令初始化 Core 与指定的 Agent 适配，降低首次安装和日常 Slash Command 的使用成本。

## 发布包

- npm 包名为 `@zbp/sdd`，发布到 `https://nexus.zyzbp.cn/repository/npm-hosted/`。
- 发布包包含已构建的 `dist/`、Claude、Codex、CodeBuddy 的项目级安装模板、README、许可证和必要包元数据。
- 包的 CLI 二进制名保持为 `sdd`；安装后可使用 `npx sdd` 或项目本地 `npx sdd`。
- 发布认证仅从用户或 CI 的 npm 配置读取；不将 Token、用户名或密码写入仓库。

## 安装命令

项目负责人运行：

```bash
npx @zbp/sdd init --agents all --install --register-codex
```

- `init` 创建或校验 `.sdd/config.yaml`，并执行项目级 Agent 安装。
- `--agents` 可为 `all`、单个 `claude`、`codex`、`codebuddy`，或逗号分隔的组合，如 `codex,codebuddy`。
- 未提供 `--agents` 时只初始化 Core。
- `--install` 将 `@zbp/sdd` 写入当前项目的开发依赖，确保 MCP Server 始终从项目本地包解析，而不是依赖一次性 npx 缓存。
- `--register-codex` 仅在选择 `codex` 或 `all` 时可用；它显式调用 Codex CLI，将当前项目的 `.agents/` 注册为项目本地 Marketplace，并安装 `team-sdd@team-sdd-project`。这是 Codex 能发现项目本地插件所需的一次性用户级注册；未提供该选项时绝不写入用户级 Codex 配置，并输出可复制的注册命令。
- `sdd agents sync --agents <selection>` 使用当前安装版本的模板更新指定适配；它也遵守所有非破坏性写入约束。

## Agent 命令体验

日常操作保持为 NEW、STATUS、NEXT、APPROVE、DOCTOR。

| Agent | 项目级文件布局 | 用户命令 |
|---|---|---|
| Claude Code | `.claude/commands/sdd/{new,status,next,approve,doctor}.md` 与项目 `.mcp.json` | `/sdd:new`、`/sdd:status`、`/sdd:next`、`/sdd:approve`、`/sdd:doctor` |
| CodeBuddy | `.codebuddy/commands/sdd/{new,status,next,approve,doctor}.md` 与项目 `.mcp.json` | `/sdd:new`、`/sdd:status`、`/sdd:next`、`/sdd:approve`、`/sdd:doctor` |
| Codex | `.agents/plugins/marketplace.json` 与 `.agents/plugins/team-sdd/` 项目本地插件 | `/sdd-new`、`/sdd-status`、`/sdd-next`、`/sdd-approve`、`/sdd-doctor` |

Claude Code 与 CodeBuddy 的子目录命令生成冒号形式。Codex 使用连字符形式，以适应其命令约定。

## MCP 与运行时解析

- 所有项目级 MCP 配置都指向项目本地安装的 `@zbp/sdd/dist/mcp-server.js`，不引用包安装模板目录外的路径。
- Claude 与 CodeBuddy 的 MCP 配置都仅添加名为 `team-sdd` 的服务器。
- Codex 适配也使用同一版本包内的 MCP Server 与 Skills。
- Agent 适配只调用 Engine 的 MCP 工具；不得自行变更 Delivery metadata、approval 或 Event Log。

## 非破坏性安装与同步

- 不覆盖已有 `.mcp.json`；仅合并或更新 `mcpServers.team-sdd`，并保留所有非 Team SDD Server。
- 不覆盖用户已有的同名 Slash Command 或 Skill。遇到冲突时停止并给出可修复提示；V1 不提供覆盖选项。
- 仅创建或更新由 Team SDD 明确拥有的文件和目录。
- `doctor` 检查项目配置、项目本地包、Agent 模板、MCP 条目与可启动的 MCP runtime；`doctor --fix` 仅修复安全且无冲突的 Team SDD 自有项。

## 验证

- 覆盖 `--agents` 参数解析、所有/单个/组合安装、冲突拒绝、MCP 深度合并与同步幂等性。
- 在临时项目中安装后，验证 Claude/CodeBuddy/Codex 生成的路径、短命令名称、MCP runtime 路径与治理约束。
- 对发布包执行 `npm pack --dry-run`，断言只包含允许的发布文件；在临时项目安装 tarball，验证 `npx sdd init --agents all --install` 的结果。
- 在 Nexus 凭据可用时，使用 `npm publish --dry-run --registry=https://nexus.zyzbp.cn/repository/npm-hosted/` 预检；实际发布必须由具备授权的用户确认后执行。

## 非目标

- 默认不写入用户全局 Claude、Codex、CodeBuddy 或 npm 配置；唯一例外是用户显式传入 `--register-codex` 时，为当前项目本地 Marketplace 执行 Codex 的一次性注册。
- 不发布到 npmjs。
- 不覆盖用户 Agent 配置、MCP Server 或自定义命令。
- 不修改 Workflow Engine、Gate 或状态机业务规则。
