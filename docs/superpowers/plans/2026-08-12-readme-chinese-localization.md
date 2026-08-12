# README 中文本地化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将根目录 README 的说明性内容改为简体中文，同时保持所有可复制技术标识完全不变。

**Architecture:** 仅修改文档层。现有 README 集成测试负责验证关键 Agent 入口名称与安装安全提示仍存在；新增中文标题断言可防止文档意外退回英文主体。

**Tech Stack:** Markdown、Vitest。

## Global Constraints

- 命令、文件路径、包名、MCP 工具名、配置键、环境变量、JSON 字段和值保持原样。
- 不改变 CLI、MCP、Git Hook、CI 或 Agent 集成行为。
- 不改动 Markdown 链接目标与代码块的可复制内容。

---

### Task 1: 将 README 本地化并锁定关键中文入口

**Files:**
- Modify: `README.md`
- Modify: `tests/integrations/native-agent-artifacts.test.ts`

**Interfaces:**
- Consumes: 现有 README 的 CLI、CI、MCP、Codex、Claude Code、CodeBuddy 文档契约。
- Produces: 简体中文 README；测试继续覆盖 Agent 入口和 CodeBuddy `.mcp.json` 的无覆盖协议。

- [ ] **Step 1: 添加失败的中文文档断言。**

```ts
it('uses Chinese headings while preserving the documented Agent names', async () => {
  const readme = await readFile('README.md', 'utf8');
  expect(readme).toContain('## 快速开始');
  expect(readme).toContain('## 原生 Agent 集成');
  expect(readme).toContain('Claude Code');
  expect(readme).toContain('CodeBuddy');
});
```

- [ ] **Step 2: 运行聚焦测试验证红灯。**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL，因为 README 尚无 `快速开始` 与 `原生 Agent 集成` 中文标题。

- [ ] **Step 3: 翻译 README 的说明性 Markdown。**

将标题、段落、列表和自然语言标签译为简体中文。保留以下内容的字节级写法：

```text
npm ci
node dist/cli.js verify --ci
sdd_get_context
sdd_submit_artifact
${CLAUDE_PROJECT_DIR}/dist/mcp-server.js
team-sdd
```

保留现有链接目标、JSON 示例和 Shell 命令。

- [ ] **Step 4: 运行聚焦测试验证绿灯。**

Run: `npm test -- tests/integrations/native-agent-artifacts.test.ts`

Expected: PASS，所有原生 Agent 文档与安全安装断言均通过。

- [ ] **Step 5: 运行文档变更的完整验证。**

Run: `npm test && npm run typecheck && npm run build && npm run verify:ci`

Expected: 所有测试、类型检查、构建和 CI 可信验证通过。

- [ ] **Step 6: 提交变更。**

仓库当前没有首个 Git 提交；仅保留已验证的工作区变更，不创建提交。

## Plan self-review

- Spec 范围中的所有说明文字、技术标识保留和回归验证均由 Task 1 覆盖。
- 未使用占位内容；没有行为或接口变更。
