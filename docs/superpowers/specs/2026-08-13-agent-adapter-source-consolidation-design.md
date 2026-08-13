# Agent 适配源收敛设计

## 目标

消除 Claude Code 与 CodeBuddy 适配在 `integrations/` 和 `templates/` 中的双份维护，同时不改变 `npx @zbp/sdd init --agents …` 的项目级安装体验。

## 权威边界

| 目录 | 责任 | 是否随 npm 包发布 |
|---|---|---|
| `templates/` | 唯一的项目级 Agent 安装源：Claude Code、CodeBuddy、Codex 的命令、Skill、插件元数据与 MCP 配置 | 是 |
| `integrations/` | 源码仓库中的调试说明和入口，不再保存任何可执行命令、Skill 或 MCP 配置副本 | 否 |
| `plugins/team-sdd/` | Codex 的 Logical Skills 源：工作流、需求、技术设计、Spec 拆分 | 否 |

`templates/codex/` 是面向最终用户的项目级快捷命令插件；它不替代 `plugins/team-sdd/` 中的 Logical Skills，也不复制其内容。

## 迁移与兼容性

1. 删除 `integrations/claude-code/` 和 `integrations/codebuddy/` 中重复的插件、命令、Skill 和 MCP 文件。
2. 将 `integrations/README.md` 改为源码调试索引：明确 Claude、CodeBuddy 的调试输入均来自对应 `templates/` 目录；通过项目级 `init --agents` 安装到临时或当前项目后进行验证。
3. 保持 `src/agents/project-agent-installer.ts` 的模板解析和输出路径不变，确保已安装项目与既有命令完全兼容。
4. 保持 `.mcp.json` 非破坏性合并、受管文件冲突拒绝、Codex Marketplace 注册等已有安全约束不变。
5. `README.md` 面向使用者，仅描述初始化命令和生成后的项目路径；`MAINTAINERS.md` 描述三目录的维护边界与源码调试流程。

不会迁移或删除 `plugins/team-sdd/` 的 Logical Skills，也不会改变 Delivery、Gate、MCP 工具或 CLI 的业务行为。

## 验证

- 将原生集成契约测试改为检查 `templates/` 的 Claude、CodeBuddy、Codex 产物，并断言 `integrations/` 不再承载重复可执行适配文件。
- 保留并运行项目安装器测试，证明三个 Agent 的生成路径、MCP 合并与 Marketplace 行为没有回归。
- 执行完整测试、类型检查、构建、CI 验证和 npm 打包边界检查；打包清单仍只包含 `dist/`、`templates/` 和 `README.md`。

## 非目标

- 不将 `integrations/` 发布为第二种安装方式。
- 不自动生成或动态写入模板文件。
- 不改变用户命令：Claude Code、CodeBuddy 使用 `/sdd:new` 等冒号命令；Codex 使用 `/sdd-new` 等连字符命令。
