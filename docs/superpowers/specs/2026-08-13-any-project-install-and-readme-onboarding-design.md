# 任意工程首次安装与 README 引导设计

## 目标

让 Team SDD 能在 Node、Java、Go、Python、.NET 等任意工程中，以用户选择的单个 Agent 完成首次安装；同时将 README 收敛为安装、首个 Delivery 体验、完整工作流与配置三章引导。

## 任意工程安装

用户只在显式选择 `--install` 时触发 npm 项目准备。安装器按下列规则处理项目根目录：

1. `package.json` 是普通文件时，保留其内容并执行精确版本的开发依赖安装。
2. `package.json` 不存在时，创建最小清单：

   ```json
   {
     "private": true
   }
   ```

   再执行 npm 安装。这只为 Team SDD 的项目本地 MCP Runtime 建立 Node 依赖边界，不改变原工程的 Java、Go、Python、.NET 或其他构建文件。
3. `package.json` 是目录、符号链接、非普通文件或无法安全读取时，拒绝操作，不覆盖用户文件。
4. npm 安装失败时，返回已有的结构化安装错误；保留已经创建的最小清单，便于用户修复 Registry/网络后重试。

项目按 Agent 单独安装，避免默认安装未使用的集成：

```bash
npx @zbp/sdd init --agents claude --install
npx @zbp/sdd init --agents codebuddy --install
npx @zbp/sdd init --agents codex --install --register-codex
```

Codex Marketplace 注册继续是显式选项，不能由 Claude Code 或 CodeBuddy 的安装命令触发。

## README 三章结构

### 第一章：首次安装

先给出 Node 20 和 Nexus Scope Registry 的共同前置条件，再分别给出 Claude Code、CodeBuddy、Codex 的一条首次安装命令、生成的项目路径和短命令。明确说明：即使项目不是 Node 工程，`--install` 也会安全创建最小私有 `package.json`；已有清单绝不覆盖。

### 第二章：完成第一个 Delivery

以一个 `APPLICATION_INIT` 为贯穿示例。用户先创建 Delivery，随后根据 `next` 完成 Requirement、人工审批、Design、人工审批、Spec Pack、人工审批、Plan、Code、Spec Check、Delivery Check，直至 DONE。每一步给出通用 CLI；三种 Agent 的命令差异只在章节一的短命令表中说明，避免把同一流程写三遍。

### 第三章：工作流、治理与自定义

章节开头直接呈现 PRD 核心流程：

```text
Requirement → Technical Design（按类型/人工决定） → Spec Pack → Plan → Code → Check → Done
```

随后说明：Agent 生成和修改产物，Engine 校验 Gate、保存事件并决定状态，Human 仅在 Requirement、Design、Spec Split 三处审批。按阶段介绍输入、产物、Gate 和下一步；再详细说明 `.sdd/config.yaml` 的 `execution.strategy`、`logical_skills` 允许范围、固定 CI checks、Agent 同步、诊断、Hook/CI 与非破坏性 MCP 合并。

## 验证

- 安装器单元测试覆盖：无 `package.json` 时创建最小私有清单；已有普通清单不被覆盖；不安全目标拒绝且不触发 npm。
- CLI 测试覆盖三种单 Agent `init --install` 路线仍把精确包版本交给安装器，Codex 注册仍必须显式请求。
- README 契约测试覆盖三章标题、三个单 Agent 安装命令、任意工程最小清单说明、核心 PRD 流程和配置内容。
- 完整执行测试、类型检查、构建、CI 验证和 npm 打包检查。

## 非目标

- 不自动安装全部 Agent。
- 不创建或修改 Maven、Gradle、Cargo、Poetry、pip、NuGet 等非 Node 包管理配置。
- 不将 npm Registry Token 写入项目文件。
- 不改变 Workflow、Gate、状态机、MCP 工具或现有项目 Agent 文件的冲突保护。
