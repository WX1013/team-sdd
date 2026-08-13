# Agent 适配源收敛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目级 Agent 适配收敛到 `templates/`，移除 `integrations/` 中会漂移的重复产物，同时保持 npm 安装、Agent 命令与安全安装行为不变。

**Architecture:** `templates/` 继续作为 `ProjectAgentInstaller` 唯一读取的发布源。`integrations/` 退化为只含开发调试索引的目录；`plugins/team-sdd/` 继续只持有 Codex 的 Logical Skills。测试从“源码适配文件存在”转为“模板契约完整、安装器输出正确、重复源码目录不存在”。

**Tech Stack:** TypeScript、Vitest、Node.js 文件系统、npm 打包清单。

## Global Constraints

- `templates/` 是 Claude Code、CodeBuddy、Codex 项目级安装内容的唯一权威源，并随 `@zbp/sdd` 发布。
- `integrations/` 不得再保存命令、Skill、插件 manifest 或 `.mcp.json` 的副本。
- `plugins/team-sdd/` 保留 Codex Logical Skills，不能被 `templates/codex/` 替代或删除。
- Claude Code、CodeBuddy 命令保持 `/sdd:new`、`/sdd:status`、`/sdd:next`、`/sdd:approve`、`/sdd:doctor`；Codex 保持 `/sdd-new`、`/sdd-status`、`/sdd-next`、`/sdd-approve`、`/sdd-doctor`。
- 不得修改 Delivery、Gate、MCP 工具、CLI 业务语义，且必须保留 `.mcp.json` 合并与受管文件冲突拒绝。
- 包清单仍只能包含 `dist`、`templates` 和 `README.md`。

---

### Task 1: 用模板契约替换重复原生适配断言

**Files:**
- Modify: `tests/integrations/native-agent-artifacts.test.ts`
- Test: `tests/integrations/native-agent-artifacts.test.ts`

**Interfaces:**
- Consumes: `templates/claude/commands/sdd/<action>.md`、`templates/claude/skills/team-sdd/SKILL.md`、`templates/codebuddy/.codebuddy/commands/sdd/<action>.md`、`templates/codebuddy/.codebuddy/skills/team-sdd/SKILL.md`、`templates/codex/plugins/team-sdd/`
- Produces: 对 npm 安装模板、三个 Agent 命令形式、Core MCP 运行时和 `integrations/` 无重复可执行适配文件的回归保护。

- [ ] **Step 1: 写入失败的单一权威源测试**

将测试文件中的 `integrations/claude-code`、`integrations/codebuddy` 路径替换为模板路径，并新增以下行为测试：

```ts
it('keeps project Agent adapters only in published templates', async () => {
  await expect(stat('integrations/claude-code')).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(stat('integrations/codebuddy')).rejects.toMatchObject({ code: 'ENOENT' });

  await expect(readFile('templates/claude/commands/sdd/new.md', 'utf8'))
    .resolves.toContain('Team SDD');
  await expect(readFile('templates/codebuddy/.codebuddy/commands/sdd/new.md', 'utf8'))
    .resolves.toContain('Team SDD');
});
```

保留并调整现有断言，使 Claude 的模板命令、CodeBuddy 的模板命令与 Skill、CodeBuddy doctor 的受限 Bash、CodeBuddy `.mcp.json` 合并文档、以及 Codex 的项目插件路径都受到检查。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL，因为 `integrations/claude-code` 和 `integrations/codebuddy` 仍存在，失败原因必须是新增的“only in published templates”断言。

- [ ] **Step 3: 调整测试辅助代码为模板路径**

在 `tests/integrations/native-agent-artifacts.test.ts` 中导入 `stat`；为 Claude 和 CodeBuddy 定义清晰的模板路径常量。将每个行为断言指向安装器实际读取的文件，例如：

```ts
const claudeCommand = (action: string) => `templates/claude/commands/sdd/${action}.md`;
const codeBuddyCommand = (action: string) => `templates/codebuddy/.codebuddy/commands/sdd/${action}.md`;
```

Claude 的项目模板不使用插件作用域工具名；断言其 `node_modules/@zbp/sdd/dist/mcp-server.js`、`sdd_get_context` 和 `sdd_submit_artifact` 的受管上下文约束。CodeBuddy 的断言继续检查 `mcp__team-sdd__sdd_*`、无 Delivery 的 `doctor` 和无直接状态写入。

- [ ] **Step 4: 运行测试确认仍因目录未迁移而失败**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: 除“重复目录仍存在”外，其余模板契约通过；这证明 RED 测试只针对待迁移行为。

### Task 2: 删除重复源适配，并保留开发调试入口

**Files:**
- Delete: `integrations/claude-code/`
- Delete: `integrations/codebuddy/`
- Modify: `integrations/README.md`
- Test: `tests/integrations/native-agent-artifacts.test.ts`

**Interfaces:**
- Consumes: Task 1 的“仅模板承载适配”测试与 `src/agents/project-agent-installer.ts` 的模板读取路径。
- Produces: 一个只含调试说明的 `integrations/` 目录；安装行为仍由 `templates/` 提供。

- [ ] **Step 1: 删除重复的可执行适配目录**

删除以下精确目录及其全部内容：

```text
integrations/claude-code/
integrations/codebuddy/
```

不得删除 `integrations/README.md`，不得删除 `templates/` 或 `plugins/team-sdd/`。

- [ ] **Step 2: 将调试说明改为模板驱动的流程**

把 `integrations/README.md` 改为中文并只保留以下事实：

```markdown
# Agent 适配开发入口

项目级 Claude Code、CodeBuddy、Codex 适配的唯一权威源是 `../templates/`。
本目录不保存命令、Skill、MCP 配置或插件 manifest 的副本。

## 本地验证

1. `npm run build`
2. 在临时或目标项目执行 `node <本仓库>/dist/cli.js init --agents claude,codebuddy,codex`
3. 在生成的 `.claude/`、`.codebuddy/`、`.agents/` 与 `.mcp.json` 中验证对应 Agent。

Codex 的工作流、需求、技术设计和 Spec 拆分 Logical Skills 的权威源是 `../plugins/team-sdd/`；它们不是项目级安装模板。
```

说明 CodeBuddy `.mcp.json` 由安装器安全合并，禁止手动覆盖已有服务器。

- [ ] **Step 3: 运行聚焦测试确认 GREEN**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts tests/agents/template-contract.test.ts tests/agents/project-agent-installer.test.ts`

Expected: PASS；测试证明重复目录消失、模板完整、三个 Agent 的安装文件与 MCP 合并保持可用。

### Task 3: 更新使用与维护文档的边界描述

**Files:**
- Modify: `README.md`
- Modify: `MAINTAINERS.md`
- Modify: `tests/integrations/native-agent-artifacts.test.ts`
- Modify: `tests/package-publish.test.ts`
- Test: `tests/integrations/native-agent-artifacts.test.ts`
- Test: `tests/package-publish.test.ts`

**Interfaces:**
- Consumes: Task 2 的目录边界和实际 `init --agents` 安装路径。
- Produces: 使用者只看到项目级安装指导；维护者清楚 `templates/`、`integrations/`、`plugins/` 的职责与调试办法。

- [ ] **Step 1: 写入失败的文档契约测试**

在 `native-agent-artifacts.test.ts` 中替换旧的源码路径断言为：README 不将 `integrations/claude-code` 或 `integrations/codebuddy` 表述为用户入口；MAINTAINERS 明确包含下列三条边界：

```ts
expect(maintainers).toContain('`templates/` 是唯一的项目级 Agent 安装权威源');
expect(maintainers).toContain('`integrations/` 只保留源码调试说明');
expect(maintainers).toContain('`plugins/team-sdd/` 只保留 Codex Logical Skills');
```

在 `tests/package-publish.test.ts` 中断言包文件清单保持 `['dist', 'templates', 'README.md']`，且 README 仍含 `init --agents all --install --register-codex`。

- [ ] **Step 2: 运行文档测试确认 RED**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts tests/package-publish.test.ts`

Expected: FAIL，因为 README、MAINTAINERS 尚未反映新的单一权威源边界。

- [ ] **Step 3: 最小化更新 README 与 MAINTAINERS**

在 README 的源码调试段落中删除对 `integrations/claude-code` 与 `integrations/codebuddy` 的引用，替换为：用户只应执行 `npx @zbp/sdd init --agents … --install`；源码调试与维护说明见 `MAINTAINERS.md`。

在 MAINTAINERS 中将目录边界改为：

```markdown
- `templates/` 是唯一的项目级 Agent 安装权威源，也是 npm 包发布的适配内容。
- `integrations/` 只保留源码调试说明，不得添加命令、Skill、插件 manifest 或 MCP 配置副本。
- `plugins/team-sdd/` 只保留 Codex Logical Skills；不得作为 npm 项目安装模板使用。
```

将原本指向已删除目录的“原生 Agent 集成维护”列表替换为 `templates/claude/`、`templates/codebuddy/`、`templates/codex/` 以及 `plugins/team-sdd/` 的职责说明。保留发布、Nexus、非破坏性 MCP 合并和验证命令。

- [ ] **Step 4: 运行文档测试确认 GREEN**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts tests/package-publish.test.ts`

Expected: PASS；文档不再引导用户使用已删除的源码适配目录，维护边界清晰且发布包边界不变。

### Task 4: 端到端回归与发布边界验证

**Files:**
- Verify: `src/agents/project-agent-installer.ts`
- Verify: `package.json`
- Verify: `templates/`
- Verify: `plugins/team-sdd/`

**Interfaces:**
- Consumes: Tasks 1–3 的模板契约、目录收敛和文档边界。
- Produces: 已验证的单一适配源收敛变更，可由维护者提交并发布。

- [ ] **Step 1: 运行完整回归**

Run: `npm test && npm run typecheck && npm run build && node dist/cli.js verify --ci`

Expected: 所有测试、类型检查、构建与 CI 验证均 PASS。

- [ ] **Step 2: 检查 npm 发布包边界**

Run: `NPM_CONFIG_CACHE=/private/tmp/zbp-sdd-npm-cache npm run pack:check`

Expected: PASS；产物包含 `dist/`、`templates/` 和 `README.md`，不包含 `integrations/` 或 `plugins/`。

- [ ] **Step 3: 审核变更范围**

Run: `git diff --check && git status --short`

Expected: 无空白错误；变更仅涉及适配源收敛的目录删除、测试、文档、设计和计划，不改变 Workflow/Gate/MCP/CLI 业务实现。

- [ ] **Step 4: 提交变更**

仅在工作区具备 Git 写入权限且维护者确认提交信息后执行：

```bash
git add integrations templates tests README.md MAINTAINERS.md docs/superpowers/specs/2026-08-13-agent-adapter-source-consolidation-design.md docs/superpowers/plans/2026-08-13-agent-adapter-source-consolidation.md
git commit -m "refactor: consolidate agent adapter sources"
```

当前环境若不能写入 `.git`，保留工作区变更并由维护者在本地提交；不得绕过权限或重置现有未提交改动。
