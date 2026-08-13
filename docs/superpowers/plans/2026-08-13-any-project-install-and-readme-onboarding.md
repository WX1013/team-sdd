# 任意工程安装与 README 引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使 `init --agents <agent> --install` 能在任何技术栈项目中安全安装 Team SDD，并将 README 重构为首次安装、首个 Delivery、完整流程与配置三章。

**Architecture:** `installCurrentPackage` 是唯一负责创建最小 npm 清单和执行 npm 安装的边界；CLI 继续只将显式 `--install` 转交给它。README 只解释真实、可测试的 CLI 行为，按 Claude Code、CodeBuddy、Codex 三条单 Agent 路径组织；Workflow、Gate、MCP 与模板安装器不改变。

**Tech Stack:** TypeScript、Node.js `fs/promises`、Vitest、npm、Markdown。

## Global Constraints

- 仅显式 `--install` 可以创建最小 `package.json`；`sdd init` 与 `sdd agents sync` 不能创建它。
- 缺失的 `package.json` 创建为严格 JSON：`{ "private": true }` 并带末尾换行。
- 现有普通 `package.json` 不得修改；目录、符号链接、非普通文件必须拒绝，且不得触发 npm。
- 三条首次安装命令分别是 Claude `--agents claude --install`、CodeBuddy `--agents codebuddy --install`、Codex `--agents codex --install --register-codex`。
- Codex 注册只能在显式选择 Codex 且传入 `--register-codex` 时执行。
- README 第三章开头必须呈现 PRD 核心流程：Requirement → Technical Design（按类型/人工决定） → Spec Pack → Plan → Code → Check → Done。
- 不修改 Maven、Gradle、Cargo、Poetry、pip、NuGet 或其他非 Node 工程配置；不写入 Registry Token。

---

### Task 1: 支持无 npm 清单的任意工程安装

**Files:**
- Modify: `src/agents/npm-project-installer.ts`
- Modify: `tests/agents/npm-project-installer.test.ts`
- Test: `tests/agents/npm-project-installer.test.ts`

**Interfaces:**
- Consumes: `installCurrentPackage({ root, packageName, version, runProcess? })`。
- Produces: 无 `package.json` 时写入最小私有清单，然后调用 `npm install --save-dev --save-exact <name>@<version>`；不安全目标返回 `NPM_PROJECT_PACKAGE_MISSING` 且不运行 npm。

- [ ] **Step 1: 写入最小清单创建的失败测试**

扩展测试文件的 fs 导入，并加入：

```ts
it('creates a minimal private package manifest before installing in a non-Node project', async () => {
  const root = await createRoot();
  const calls: unknown[] = [];

  await installCurrentPackage({ root, packageName: '@zbp/sdd', version: '0.1.0', runProcess: capture(calls) });

  await expect(readFile(join(root, 'package.json'), 'utf8')).resolves.toBe('{\n  "private": true\n}\n');
  expect(calls).toEqual([['npm', ['install', '--save-dev', '--save-exact', '@zbp/sdd@0.1.0'], { cwd: root }]]);
});
```

将“缺少清单拒绝”测试替换为：创建目录或符号链接形式的 `package.json`，断言抛出 `NPM_PROJECT_PACKAGE_MISSING` 且 `calls` 为空。保留已有普通清单安装测试，并额外断言其文本保持不变。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm test -- tests/agents/npm-project-installer.test.ts`

Expected: FAIL，原因是当前实现对缺少清单抛出 `NPM_PROJECT_PACKAGE_MISSING`，而不是创建最小清单。

- [ ] **Step 3: 实现最小安全清单准备**

在 `src/agents/npm-project-installer.ts` 中增加私有 helper：

```ts
async function ensurePackageManifest(root: string): Promise<void> {
  const path = `${root}/package.json`;
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new DomainError('NPM_PROJECT_PACKAGE_MISSING', 'Project package.json must be a regular file before --install can run.');
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeFile(path, '{\n  "private": true\n}\n', 'utf8');
  }
}
```

调用该 helper 后执行现有 `runProcess`。不得读取、解析或重写现有普通清单；保留现有 npm 失败到 `PROJECT_NPM_INSTALL_FAILED` 的映射。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `npm test -- tests/agents/npm-project-installer.test.ts`

Expected: PASS；最小清单只在缺失时创建，普通文件保留，目录/符号链接拒绝且不运行 npm。

### Task 2: 保护单 Agent CLI 首装行为

**Files:**
- Modify: `tests/cli-agent-install.test.ts`
- Test: `tests/cli-agent-install.test.ts`

**Interfaces:**
- Consumes: `runCli(args, root, dependencies)` 与 Task 1 保持的 `installCurrentPackage` API。
- Produces: 三条 README 安装命令的 CLI 回归保护；Codex 注册显式、Claude/CodeBuddy 不注册。

- [ ] **Step 1: 写入三个单 Agent 路径的失败测试**

增加参数化测试：

```ts
it.each([
  ['claude', ['claude'], false],
  ['codebuddy', ['codebuddy'], false],
  ['codex', ['codex'], true],
] as const)('initializes %s through its dedicated first-install command', async (agent, agents, registersCodex) => {
  const root = await createRoot();
  const { dependencies, sync, install, register } = createDependencies();
  const args = ['init', '--agents', agent, '--install', ...(registersCodex ? ['--register-codex'] : [])];

  const result = await runCli(args, root, dependencies);

  expect(result.exitCode).toBe(0);
  expect(install).toHaveBeenCalledOnce();
  expect(sync).toHaveBeenCalledWith({ root, agents });
  expect(register).toHaveBeenCalledTimes(registersCodex ? 1 : 0);
});
```

- [ ] **Step 2: 运行测试确认现有 CLI 行为**

Run: `npm test -- tests/cli-agent-install.test.ts`

Expected: PASS；该行为已经由 `synchronizeAgents` 实现。此任务的目的仅是把 README 所承诺的三条命令固定为可回归测试的公共契约。

### Task 3: 重写三章用户 README

**Files:**
- Modify: `README.md`
- Modify: `tests/package-publish.test.ts`
- Modify: `tests/integrations/native-agent-artifacts.test.ts`
- Test: `tests/package-publish.test.ts`
- Test: `tests/integrations/native-agent-artifacts.test.ts`

**Interfaces:**
- Consumes: Task 1 的任意工程 `--install` 行为、Task 2 的三条单 Agent 命令、现有 CLI 和 PRD Gate/状态机行为。
- Produces: 三章 README；第一章安装，第二章端到端 Delivery，第三章 PRD 流程、治理、配置和诊断。

- [ ] **Step 1: 写入 README 契约失败测试**

替换 `tests/package-publish.test.ts` 的 README 断言，使其要求：

```ts
expect(readme).toContain('## 1. 首次安装');
expect(readme).toContain('## 2. 完成第一个 Delivery');
expect(readme).toContain('## 3. Team SDD 工作流、治理与自定义');
expect(readme).toContain('npx @zbp/sdd init --agents claude --install');
expect(readme).toContain('npx @zbp/sdd init --agents codebuddy --install');
expect(readme).toContain('npx @zbp/sdd init --agents codex --install --register-codex');
expect(readme).toContain('`package.json` 不存在时');
expect(readme).toContain('"private": true');
expect(readme).toContain('Requirement → Technical Design（按类型/人工决定） → Spec Pack → Plan → Code → Check → Done');
```

在 `native-agent-artifacts.test.ts` 保留三个 Agent 的独立安装命令断言，但替换旧的“独立介入小节标题”断言为三章标题与 Claude/CodeBuddy 冒号、Codex 连字符短命令的断言。

- [ ] **Step 2: 运行文档测试确认 RED**

Run: `npm test -- tests/package-publish.test.ts tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL，因为当前 README 不是三章结构，且没有自动最小清单与 PRD 流程文字。

- [ ] **Step 3: 用三章结构重写 README**

保留标题、产品一句话、维护文档链接与 Nexus scope registry；然后只保留以下三级结构。

第一章 `## 1. 首次安装`：Node 20 前置、任意工程自动创建最小清单、三张 Agent 卡片/小节，分别写精确命令、生成路径和短命令：

```markdown
### Claude Code
npx @zbp/sdd init --agents claude --install
`/sdd:new`、`/sdd:next`、`/sdd:status`、`/sdd:approve`、`/sdd:doctor`

### CodeBuddy
npx @zbp/sdd init --agents codebuddy --install
`/sdd:new`、`/sdd:next`、`/sdd:status`、`/sdd:approve`、`/sdd:doctor`

### Codex
npx @zbp/sdd init --agents codex --install --register-codex
`/sdd-new`、`/sdd-next`、`/sdd-status`、`/sdd-approve`、`/sdd-doctor`
```

第二章 `## 2. 完成第一个 Delivery`：使用 `DLV-001` 和 `APPLICATION_INIT`，按创建、`next`、生成/提交 Requirement、审批、Design、审批、创建 Spec/审批/提交、Plan、Code、Spec Check、Delivery Check 的顺序给出真实 CLI。说明 Agent 用户可用各自 `new/next/status/approve` 短命令完成同样的 Core 动作；产物必须通过 `submit` 进入 Gate。

第三章 `## 3. Team SDD 工作流、治理与自定义`：开头放核心 PRD 流程文字；解释 `APPLICATION_INIT` 必经 Design、`FEATURE_CHANGE` 须经人工 Design Decision 才可跳过；用表格列 Requirement/Design/Spec/Plan/Code/Check 的产物、Gate 和动作；解释三个 Human Gate、审批 hash、事件；详细给出 `execution.strategy` 的 `auto`/`inline`/`subagent`，受限 `logical_skills` YAML 样例与六条默认路由，固定 `checks`，Agent 同步、`doctor`、Hook、CI、`.mcp.json` 合并规则。

不得放入发布操作或凭据；继续链接 `MAINTAINERS.md`。

- [ ] **Step 4: 运行文档测试确认 GREEN**

Run: `npm test -- tests/package-publish.test.ts tests/integrations/native-agent-artifacts.test.ts`

Expected: PASS；README 与实际三条首次安装命令、任意工程行为、PRD 流程和配置边界一致。

### Task 4: 完整回归与发布包边界

**Files:**
- Verify: `src/agents/npm-project-installer.ts`
- Verify: `src/cli.ts`
- Verify: `README.md`
- Verify: `package.json`

**Interfaces:**
- Consumes: Tasks 1–3。
- Produces: 已验证的任意工程安装和用户引导，可由维护者提交并发布。

- [ ] **Step 1: 运行完整验证**

Run: `npm test && npm run typecheck && npm run build && node dist/cli.js verify --ci && node dist/cli.js doctor --json`

Expected: 所有测试、类型检查、构建、CI 验证和当前仓库诊断均 PASS。

- [ ] **Step 2: 检查发布包**

Run: `NPM_CONFIG_CACHE=/private/tmp/zbp-sdd-npm-cache npm run pack:check`

Expected: PASS；包只包含 `dist/`、`templates/` 和 `README.md`，不包含维护文档、源码集成说明或凭据。

- [ ] **Step 3: 检查变更安全性**

Run: `git diff --check && git status --short`

Expected: 无空白错误；不包含任何 Nexus Token、全局配置或非 Node 工程构建文件变更。

- [ ] **Step 4: 提交变更**

仅在维护者明确授权且环境允许写入 Git 元数据时执行：

```bash
git add README.md src/agents/npm-project-installer.ts tests/agents/npm-project-installer.test.ts tests/cli-agent-install.test.ts tests/package-publish.test.ts tests/integrations/native-agent-artifacts.test.ts docs/superpowers/specs/2026-08-13-any-project-install-and-readme-onboarding-design.md docs/superpowers/plans/2026-08-13-any-project-install-and-readme-onboarding.md
git commit -m "feat: support any-project agent installation"
```

不得重置、覆盖或混入工作区已有的其他未提交变更。
