# Agent 适配开发入口

项目级 Claude Code、CodeBuddy、Codex 适配的唯一权威源是 [`../templates/`](../templates/)。本目录不保存命令、Skill、MCP 配置或插件 manifest 的副本。

## 本地验证

1. 在本仓库运行 `npm run build`。
2. 在临时或目标 Node 项目中运行 `node <本仓库绝对路径>/dist/cli.js init --agents claude,codebuddy,codex`。
3. 在生成的 `.claude/`、`.codebuddy/`、`.agents/` 与 `.mcp.json` 中加载或检查对应 Agent。

项目安装器从 `templates/` 写入适配文件，并安全合并根目录 `.mcp.json` 的 `mcpServers.team-sdd`。绝不能手动覆盖已有 `.mcp.json` 或其中的其他 MCP Server。

Codex 的工作流、需求、技术设计和 Spec 拆分 Logical Skills 的权威源是 [`../plugins/team-sdd/`](../plugins/team-sdd/)；它们不是项目级安装模板。
