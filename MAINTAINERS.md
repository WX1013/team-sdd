# Team SDD Core 维护指南

本文件面向 `@zbp/sdd` 的源码维护者和发布负责人。业务项目的安装、使用、Agent 短命令与项目配置请阅读 [README.md](./README.md)。

## 本地开发

要求 Node.js 20 或更高版本：

```bash
npm ci
npm test
npm run typecheck
npm run build
node dist/cli.js verify --ci
```

完整测试、类型检查、构建和 CI 验证都应在提交前通过。需要检查发布包边界时，使用隔离缓存避免本机 npm 缓存权限影响：

```bash
NPM_CONFIG_CACHE=/private/tmp/zbp-sdd-npm-cache npm run pack:check
```

## 代码与工作流边界

- Core 是唯一的状态、审批、事件和 Gate 权威；Agent 只能通过 MCP/CLI 的审批或提交接口推进状态。
- `src/runtime/` 负责 Logical Skill、Provider、能力和执行策略解析；不得在 Workflow 中按 Claude、Codex 或 CodeBuddy 分支。
- `templates/` 是会随 npm 包安装到用户项目的适配源；`integrations/` 与 `plugins/` 是源码仓库中的原生集成参考产物。
- 改动行为时遵循 TDD：先新增失败测试，再做最小实现，最后运行聚焦与全量验证。
- 修改 Agent 安装逻辑时，必须保留用户已有的非 `team-sdd` `.mcp.json` 条目，并拒绝覆盖已自定义的受管文件。

## 配置与兼容性

`.sdd/config.yaml` 的 `checks` 是固定可信基线，禁止开放成任意 Shell 命令。`logical_skills` 只允许覆盖既有 PRD 路由的同一 Provider 与允许的 Skill 子集。修改配置 Schema、默认路由或 Gate 契约时，需要同时更新 README、运行时测试和相应 Gate 测试。

## CI 与 Git Hook

GitHub Actions 位于 [`.github/workflows/team-sdd.yml`](./.github/workflows/team-sdd.yml)，在 push 与 pull request 中执行：

```bash
npm ci
npm run build
npm run verify:ci
```

`verify --ci` 先审计仓库和全部 Delivery，只在通过后运行固定检查。Git Hook 仅运行 `sdd verify --hook`，不得在 Hook 中执行业务项目的任意脚本。

## 发布到 Nexus

包名为 `@zbp/sdd`，发布目标为 `https://nexus.zyzbp.cn/repository/npm-hosted/`。Token 只允许存在于维护者的 `~/.npmrc` 或 CI Secret，禁止写入源码、测试输出或文档示例。

发布负责人按以下顺序操作：

```bash
# 已在自己的 ~/.npmrc 配置 @zbp scope 与 Nexus Bearer Token
npm run prepublishOnly
NPM_CONFIG_CACHE=/private/tmp/zbp-sdd-npm-cache npm run pack:check
npm publish --dry-run --registry=https://nexus.zyzbp.cn/repository/npm-hosted/

# 仅在负责人明确授权后执行；会向 Nexus 写入不可覆盖的版本
npm publish --registry=https://nexus.zyzbp.cn/repository/npm-hosted/
```

发布后，用 Nexus Group 的使用者配置验证安装和 CLI：

```bash
npm view @zbp/sdd version --registry=https://nexus.zyzbp.cn/repository/npm-group/
npx @zbp/sdd --help
```

## 原生 Agent 集成维护

- Claude Code 源适配：[`integrations/claude-code`](./integrations/claude-code)
- CodeBuddy 源适配：[`integrations/codebuddy`](./integrations/codebuddy)
- Codex 源插件：[`plugins/team-sdd`](./plugins/team-sdd)

CodeBuddy 使用项目根目录 `.mcp.json`。安装或文档更新时，必须说明：不存在时才复制配置；存在时保留全部 `mcpServers`，只手工合并 `team-sdd`。不得提供覆盖式复制命令。

对原生集成做改动后，至少运行：

```bash
npm test -- tests/integrations/native-agent-artifacts.test.ts
npm run typecheck
npm run build
```
