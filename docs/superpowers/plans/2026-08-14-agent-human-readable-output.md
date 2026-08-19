# Agent 人类可读输出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让三种项目级 Agent 的全部 Team SDD 快捷指令把结构化工具结果渲染为中文可读内容，而不直接回复 JSON。

**Architecture:** 只修改 `templates/` 中发布给项目的 Claude、CodeBuddy 与 Codex 指令模板。MCP 与 CLI 的 JSON 协议保持不变；模板将工具结果规定为内部数据，并为每项指令定义中文结果摘要。契约测试读取真实模板，防止“原样返回 JSON/Core 结果”的指令回归。

**Tech Stack:** TypeScript、Vitest、Markdown Agent commands/Skills。

## Global Constraints

- 保留 Claude/CodeBuddy 的 `/sdd:<动作>` 与 Codex 的 `/sdd-<动作>` 命令形式。
- 保留 MCP 工具名、CLI `--json`、错误码、Delivery/Spec ID 和状态枚举。
- Agent 不得直接修改 `.sdd`、Delivery 元数据、审批记录或事件日志。
- 用户可见内容必须使用简体中文，不得呈现 MCP 包络、原始 JSON 或 Core 结果原文。

---

### Task 1: 为中文可读输出建立模板契约

**Files:**
- Modify: `tests/agents/template-contract.test.ts:33-65`
- Modify: `tests/integrations/native-agent-artifacts.test.ts:28-70`

**Interfaces:**
- Consumes: `templates/{claude,codebuddy,codex}/...` 的已发布快捷指令。
- Produces: 三个平台、五个动作均遵循“中文摘要而非 JSON 透传”的回归保护。

- [x] **Step 1: 写入失败的模板契约测试**

在 `tests/agents/template-contract.test.ts` 添加一个 `it.each`，读取 15 个快捷指令，并断言每个文件包含：

```ts
expect(command).toContain('面向用户的内容必须使用简体中文');
expect(command).toContain('不得展示原始 JSON、MCP 响应包络或 Core 结果原文');
expect(command).not.toMatch(/(?:Return|Present) (?:the )?Core (?:data, findings, or errors |result )?unchanged/i);
```

将 Status UX 的断言改为中文标题 `工作流`、`规格包`、`当前`、`下一步` 和中文阶段 `需求`、`技术设计`、`规格`、`执行`、`检查`、`完成`。

- [x] **Step 2: 运行测试，确认其因缺少中文输出契约而失败**

运行：`npm test -- tests/agents/template-contract.test.ts`

预期：失败信息指出模板缺少 `面向用户的内容必须使用简体中文`，或仍存在 `Return/Present ... unchanged`。

- [x] **Step 3: 增加各动作可读摘要的精确断言**

在同一测试文件增加针对模板集合的断言：`new` 包含 `创建结果`，`next` 包含 `推荐动作`，`approve` 包含 `审批结果`，`doctor` 包含 `诊断问题`。在 `tests/integrations/native-agent-artifacts.test.ts` 保留每个平台的 MCP 工具、CodeBuddy allowed-tools 与治理约束。

- [x] **Step 4: 再次运行测试，确认仍因尚未实现模板文案而失败**

运行：`npm test -- tests/agents/template-contract.test.ts`

预期：失败集中在尚未更新的英文模板文本。

### Task 2: 更新三种 Agent 的五个快捷指令模板

**Files:**
- Modify: `templates/claude/commands/sdd/{new,status,next,approve,doctor}.md`
- Modify: `templates/claude/skills/team-sdd/SKILL.md`
- Modify: `templates/codebuddy/.codebuddy/commands/sdd/{new,status,next,approve,doctor}.md`
- Modify: `templates/codebuddy/.codebuddy/skills/team-sdd/SKILL.md`
- Modify: `templates/codex/plugins/team-sdd/skills/sdd-{new,status,next,approve,doctor}/SKILL.md`

**Interfaces:**
- Consumes: Task 1 的模板契约。
- Produces: 三个平台一致的中文人类可读输出规则。

- [x] **Step 1: 用统一的中文呈现边界替换 JSON 透传语句**

每个快捷指令模板及 Claude/CodeBuddy 的通用治理 Skill 在工具调用说明后包含以下句子：

```markdown
将工具响应仅作为内部结构化数据处理。面向用户的内容必须使用简体中文；不得展示原始 JSON、MCP 响应包络或 Core 结果原文。保留 Delivery/Spec ID、状态枚举和错误码。
```

删除所有 `Return Core ... unchanged`、`Present the Core result unchanged`、`present its JSON output unchanged` 等语句。

- [x] **Step 2: 为每个动作写入最小中文摘要合同**

在三套模板中分别声明：

```markdown
new：展示“创建结果”、Delivery ID、标题、当前状态与下一步。
next：展示当前活动、阻塞项、推荐动作与下一条可执行快捷指令。
approve：展示“审批结果”、工件、审批人和状态变化。
doctor：展示通过项、诊断问题、错误码与建议修复动作；不得使用 `--fix`。
```

保留既有工具调用、位置参数、`allowed-tools` 与无直接写入约束。

- [x] **Step 3: 将 Status UX 固化为中文模板**

在三个 `status` 文件中使用：

```text
<delivery.id> · <delivery.title>

工作流
需求        <✓|●|○>
技术设计    <✓|●|○>
规格        <✓|●|○>
执行        <✓|●|○>
检查        <✓|●|○>
完成        <✓|●|○>

规格包
当前
计划
下一步
```

当存在阻塞项时，用中文渲染说明和建议，保留错误码；无任务统计时省略计划区块。

- [x] **Step 4: 运行聚焦测试，确认全部通过**

运行：`npm test -- tests/agents/template-contract.test.ts tests/integrations/native-agent-artifacts.test.ts`

预期：模板契约、MCP 工具映射、治理限制和 README 相关测试通过。

### Task 3: 全量验证与交付说明

**Files:**
- Modify: `docs/superpowers/plans/2026-08-14-agent-human-readable-output.md`（勾选完成状态）

**Interfaces:**
- Consumes: 已更新模板和通过的聚焦测试。
- Produces: 可复现的验证结果与用户更新指引。

- [x] **Step 1: 运行静态检查和全量测试**

运行：

```bash
npm run typecheck
npm test
npm run build
npm run pack:check
git diff --check
```

预期：每条命令退出码为 0。

- [x] **Step 2: 检查发布包内容**

运行：`npm pack --dry-run --json`

预期：`templates/claude`、`templates/codebuddy`、`templates/codex` 与 `dist/` 都位于包内容中。

- [x] **Step 3: 勾选实施计划并交付更新命令**

将上述复选框改为已完成。最终说明用户升级发布版本后执行：

```bash
npx sdd agents sync --agents claude
npx sdd agents sync --agents codebuddy
npx sdd agents sync --agents codex --register-codex
```

不要提交、推送或发布，除非用户另行授权。
