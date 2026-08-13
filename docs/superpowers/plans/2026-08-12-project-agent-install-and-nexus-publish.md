# Project Agent Installation and Nexus npm Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Team SDD as the private Nexus package `@zbp/sdd` and let a repository install/update safe project-local Claude Code, Codex, and CodeBuddy adapters through one command.

**Architecture:** Package-only assets live under `templates/` and are copied by a new installer library into the target repository. The installer owns only recorded Team SDD files, deep-merges only `mcpServers.team-sdd`, and refuses symlinks, malformed configuration, or user-owned collisions. The CLI orchestrates Core initialization, optional local npm installation, adapter sync, and an explicit Codex marketplace registration; no Agent is allowed to mutate workflow state outside Core MCP/CLI operations.

**Tech Stack:** Node.js >=20, TypeScript ESM, Commander, Vitest, Node `fs/promises`, npm, Nexus Repository npm Hosted.

## Global Constraints

- The published package name is exactly `@zbp/sdd`, with `publishConfig.registry` exactly `https://nexus.zyzbp.cn/repository/npm-hosted/`.
- Never put npm credentials, Nexus tokens, usernames, passwords, or user `.npmrc` files into the repository or package.
- The normal first-install command is `npx @zbp/sdd init --agents all --install --register-codex`; `--agents` accepts `all`, one name, or a comma-separated subset of `claude`, `codex`, and `codebuddy`.
- Without `--agents`, `init` retains its current Core-only behavior. `--register-codex` is rejected unless `codex` is selected.
- `--install` adds the exact current `@zbp/sdd` version as a project dev dependency. It requires an existing regular `package.json`; it must not run `npm init` or modify user-level npm settings.
- All generated `.mcp.json` Team SDD servers run `node node_modules/@zbp/sdd/dist/mcp-server.js` from the project root.
- Claude Code and CodeBuddy expose `/sdd:new`, `/sdd:status`, `/sdd:next`, `/sdd:approve`, `/sdd:doctor`; Codex exposes `/sdd-new`, `/sdd-status`, `/sdd-next`, `/sdd-approve`, `/sdd-doctor`.
- Codex files are repository-local under `.agents/plugins/`; only `--register-codex` may make a user-level change, by registering the current repository’s `.agents/` as `team-sdd-project` and installing `team-sdd@team-sdd-project` through the Codex CLI.
- Never overwrite user commands, Skills, Agent configuration, or any non-`team-sdd` MCP server. Treat symlinks and wrong file types in managed paths as unsafe.
- Team SDD-owned generated files may be updated only when their current SHA-256 equals the prior digest recorded in `.sdd/runtime/agent-installations.json`; otherwise fail with a concrete collision finding.
- Use TDD: add a focused failing test before each implementation step, then run the focused test, typecheck, build, and full suite before closing a task.
- Do not publish to Nexus in this plan. A credentialed user must explicitly approve the final `npm publish` command.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/agents/types.ts` | Agent names, parsed selection, installation manifest, result and injected process interfaces. |
| `src/agents/project-agent-installer.ts` | Safe path validation, digest ownership, template copy, `.mcp.json` merge, Codex marketplace merge, and project-local runtime checks. |
| `src/agents/npm-project-installer.ts` | Bounded `npm install --save-dev --save-exact` invocation for the current package. |
| `src/agents/codex-registration.ts` | Explicit `codex plugin marketplace add` and `codex plugin add` process calls. |
| `src/agents/index.ts` | Public factory and parse exports consumed by the CLI. |
| `templates/claude/...` | Project-local Claude slash commands and shared governed Skill. |
| `templates/codebuddy/...` | Project-local CodeBuddy slash commands and shared governed Skill. |
| `templates/codex/plugins/marketplace.json` | Project-local Codex marketplace containing `team-sdd`. |
| `templates/codex/plugins/team-sdd/...` | Codex plugin manifest, MCP config, and five short-command Skills. |
| `src/cli.ts` | Hashbang, `init` options, `agents sync`, optional local install and explicit Codex registration. |
| `package.json` | Publishable metadata, explicit package contents, Nexus registry, and publish lifecycle checks. |
| `README.md` | Chinese quick start, Nexus scope configuration, Agent command table, upgrade and collision recovery guidance. |
| `tests/agents/*.test.ts` | Unit/integration tests for selection, safe sync, npm install, registration, template contracts and conflicts. |
| `tests/cli-agent-install.test.ts` | CLI option validation and orchestration tests through injected dependencies. |
| `tests/package-publish.test.ts` | Package metadata and actual `npm pack --dry-run --json` allow-list checks. |

### Task 1: Make the npm artifact executable and publishable

**Files:**
- Modify: `package.json`
- Modify: `src/cli.ts:1`
- Create: `tests/package-publish.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces package executable `sdd` and package assets consumed by Tasks 2–6.
- Produces `npm run pack:check`, which runs `npm pack --dry-run --json` using the current source tree.

Use this test helper in `tests/package-publish.test.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
async function runNpmPackDryRun(): Promise<{ files: { path: string }[] }> {
  const { stdout } = await execFileAsync('npm', [
    '--cache', '/private/tmp/zbp-sdd-npm-cache', 'pack', '--dry-run', '--json',
  ]);
  return JSON.parse(stdout)[0] as { files: { path: string }[] };
}
```

- [ ] **Step 1: Write failing publish-contract tests.**

```ts
it('publishes only the Team SDD runtime and installation templates', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  expect(manifest).toMatchObject({
    name: '@zbp/sdd', private: false, license: 'UNLICENSED',
    bin: { sdd: './dist/cli.js' },
    publishConfig: { registry: 'https://nexus.zyzbp.cn/repository/npm-hosted/' },
  });
  expect(manifest.files).toEqual(['dist', 'templates', 'README.md']);
});

it('has a Node executable CLI and a dry-run package containing no source or credentials', async () => {
  expect(await readFile('src/cli.ts', 'utf8')).toMatch(/^#!\/usr\/bin\/env node\n/);
  const packed = await runNpmPackDryRun();
  expect(packed.files.map((file) => file.path)).toEqual(expect.arrayContaining([
    'dist/cli.js', 'dist/mcp-server.js', 'README.md', 'package.json',
  ]));
  expect(packed.files.map((file) => file.path)).not.toEqual(expect.arrayContaining([
    'src/cli.ts', '.npmrc', 'integrations/README.md', 'plugins/team-sdd/.mcp.json',
  ]));
});
```

- [ ] **Step 2: Run the focused test and confirm it fails for the old private package name/contents and missing hashbang.**

Run: `npm test -- tests/package-publish.test.ts`

Expected: FAIL because the manifest is `@team-sdd/core`, private, and `src/cli.ts` lacks the Node hashbang.

- [ ] **Step 3: Implement the minimal package boundary.**

Add this first line to `src/cli.ts`:

```ts
#!/usr/bin/env node
```

Set the package fields exactly as follows and retain existing runtime dependencies and build/test scripts:

```json
{
  "name": "@zbp/sdd",
  "private": false,
  "version": "0.1.0",
  "license": "UNLICENSED",
  "bin": { "sdd": "./dist/cli.js" },
  "files": ["dist", "templates", "README.md"],
  "publishConfig": { "registry": "https://nexus.zyzbp.cn/repository/npm-hosted/" },
  "scripts": {
    "pack:check": "npm pack --dry-run --json",
    "prepublishOnly": "npm test && npm run typecheck && npm run build"
  }
}
```

Do not add `.npmrc`; the consumer supplies its own scope registry and credentials. Update only the README’s package identity sentence at this step; the installation guide comes in Task 6.

- [ ] **Step 4: Run the focused test, build, and inspect the archive list.**

Run: `npm test -- tests/package-publish.test.ts && npm run build && npm --cache /private/tmp/zbp-sdd-npm-cache run pack:check`

Expected: PASS; `dist/`, `README.md`, and `package.json` are listed with no source, integration-source, plugin-source, or npm credential files. The template archive assertions are added in Task 2 after those files exist.

- [ ] **Step 5: Commit the independently valid artifact boundary.**

```bash
git add package.json src/cli.ts README.md tests/package-publish.test.ts
git commit -m "feat: prepare private Nexus npm package"
```

### Task 2: Create explicit project-agent templates

**Files:**
- Create: `templates/claude/commands/sdd/{new,status,next,approve,doctor}.md`
- Create: `templates/claude/skills/team-sdd/SKILL.md`
- Create: `templates/codebuddy/.codebuddy/commands/sdd/{new,status,next,approve,doctor}.md`
- Create: `templates/codebuddy/.codebuddy/skills/team-sdd/SKILL.md`
- Create: `templates/codex/plugins/marketplace.json`
- Create: `templates/codex/plugins/team-sdd/.codex-plugin/plugin.json`
- Create: `templates/codex/plugins/team-sdd/.mcp.json`
- Create: `templates/codex/plugins/team-sdd/skills/{sdd-new,sdd-status,sdd-next,sdd-approve,sdd-doctor}/SKILL.md`
- Create: `tests/agents/template-contract.test.ts`
- Modify: `tests/package-publish.test.ts`

**Interfaces:**
- Produces template paths used by `ProjectAgentInstaller.sync()` in Task 3.
- Every generated command contains the literal marker `<!-- Team SDD managed: v1 -->`; every generated Skill contains `<!-- Team SDD managed: v1 -->` below valid YAML frontmatter.
- Claude and CodeBuddy `.mcp.json` content is supplied by Task 3 rather than copied as a whole, so no template config file is created for those two Agents.

- [ ] **Step 1: Write failing template-contract tests.**

```ts
const shortActions = ['new', 'status', 'next', 'approve', 'doctor'] as const;

it.each(shortActions)('gives Claude and CodeBuddy the colon command %s', async (action) => {
  expect(await readFile(`templates/claude/commands/sdd/${action}.md`, 'utf8'))
    .toContain('<!-- Team SDD managed: v1 -->');
  expect(await readFile(`templates/codebuddy/.codebuddy/commands/sdd/${action}.md`, 'utf8'))
    .toContain('<!-- Team SDD managed: v1 -->');
});

it.each(shortActions)('gives Codex the hyphen command Skill %s', async (action) => {
  const skill = await readFile(`templates/codex/plugins/team-sdd/skills/sdd-${action}/SKILL.md`, 'utf8');
  expect(skill).toContain(`name: sdd-${action}`);
  expect(skill).toContain('<!-- Team SDD managed: v1 -->');
});

it('keeps every Agent governed by the project-local Core runtime', async () => {
  const contents = await readAllTemplateText();
  expect(contents).toContain('node_modules/@zbp/sdd/dist/mcp-server.js');
  expect(contents).toContain('sdd_get_context');
  expect(contents).toContain('sdd_submit_artifact');
  expect(contents).not.toMatch(/(?:write|append).*?(?:delivery\.yaml|events?)/i);
});

it('declares a local Codex marketplace and plugin', async () => {
  expect(JSON.parse(await readFile('templates/codex/plugins/marketplace.json', 'utf8'))).toMatchObject({
    name: 'team-sdd-project', plugins: [{ name: 'team-sdd', source: './plugins/team-sdd' }],
  });
});
```

Use this exact helper to make the governance assertion cover every template that can contain runtime instructions:

```ts
async function readAllTemplateText(): Promise<string> {
  const files = [
    ...shortActions.flatMap((action) => [
      `templates/claude/commands/sdd/${action}.md`,
      `templates/codebuddy/.codebuddy/commands/sdd/${action}.md`,
      `templates/codex/plugins/team-sdd/skills/sdd-${action}/SKILL.md`,
    ]),
    'templates/claude/skills/team-sdd/SKILL.md',
    'templates/codebuddy/.codebuddy/skills/team-sdd/SKILL.md',
    'templates/codex/plugins/team-sdd/.mcp.json',
  ];
  return (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
}
```

- [ ] **Step 2: Run the template tests and confirm every absent template is reported.**

Run: `npm test -- tests/agents/template-contract.test.ts`

Expected: FAIL with `ENOENT` for the new `templates/` files.

- [ ] **Step 3: Create the exact command and Skill templates.**

Use `<!-- Team SDD managed: v1 -->` as the first non-frontmatter line in all Markdown files. Use these request mappings:

| Action | Claude and CodeBuddy call | Codex Skill call |
|---|---|---|
| new | `mcp__team-sdd__sdd_new` | `mcp__team-sdd__sdd_new` |
| status | `mcp__team-sdd__sdd_status` | `mcp__team-sdd__sdd_status` |
| next | `mcp__team-sdd__sdd_next` | `mcp__team-sdd__sdd_next` |
| approve | `mcp__team-sdd__sdd_approve` | `mcp__team-sdd__sdd_approve` |
| doctor | `node node_modules/@zbp/sdd/dist/cli.js doctor --json` | `node node_modules/@zbp/sdd/dist/cli.js doctor --json` |

For all non-doctor commands, command frontmatter must declare only its corresponding MCP tool and must say: first call `sdd_get_context` when a Delivery ID is provided; return Core findings verbatim; do not modify `.sdd`, delivery metadata, approval records, or Event Log files directly. The shared Skills must name all five actions, require context before work, require `sdd_submit_artifact` for artifact submission, and repeat the direct-mutation prohibition.

For CodeBuddy doctor, use the validated narrow contract:

```markdown
---
description: Run Team SDD repository diagnostics
allowed-tools: Bash(node node_modules/@zbp/sdd/dist/cli.js doctor --json)
disable-model-invocation: true
---

<!-- Team SDD managed: v1 -->
Run exactly `node node_modules/@zbp/sdd/dist/cli.js doctor --json` from the project root and present its JSON output unchanged. Do not use `--fix`.
```

For Codex, set plugin `name` to `team-sdd`, `version` to `0.1.0`, `skills` to `./skills/`, and `.mcp.json` to the standard `team-sdd` stdio server with `args: ["node_modules/@zbp/sdd/dist/mcp-server.js"]`. Set marketplace `name` to `team-sdd-project`, and declare exactly one available `team-sdd` plugin sourced from `./plugins/team-sdd`.

Extend the Task 1 archive expectation with these three required paths now that they exist:

```ts
expect(packed.files.map((file) => file.path)).toEqual(expect.arrayContaining([
  'templates/claude/commands/sdd/new.md',
  'templates/codebuddy/.codebuddy/commands/sdd/new.md',
  'templates/codex/plugins/marketplace.json',
]));
```

- [ ] **Step 4: Run template tests and JSON parsing checks.**

Run: `npm test -- tests/agents/template-contract.test.ts && node -e "JSON.parse(require('node:fs').readFileSync('templates/codex/plugins/marketplace.json','utf8')); JSON.parse(require('node:fs').readFileSync('templates/codex/plugins/team-sdd/.codex-plugin/plugin.json','utf8')); JSON.parse(require('node:fs').readFileSync('templates/codex/plugins/team-sdd/.mcp.json','utf8'))"`

Expected: PASS; all files parse and only the specified Core MCP/CLI operations appear.

- [ ] **Step 5: Commit the portable adapter templates.**

```bash
git add templates tests/agents/template-contract.test.ts
git commit -m "feat: add project-local Agent templates"
```

### Task 3: Build the safe project-agent installer

**Files:**
- Create: `src/agents/types.ts`
- Create: `src/agents/project-agent-installer.ts`
- Create: `src/agents/index.ts`
- Create: `tests/agents/project-agent-installer.test.ts`

**Interfaces:**
- Produces:

```ts
export const agentNames = ['claude', 'codex', 'codebuddy'] as const;
export type AgentName = (typeof agentNames)[number];
export type AgentSelection = readonly AgentName[];
export function parseAgentSelection(input: string): AgentSelection;
export type ProjectAgentSyncResult = { installed: readonly string[]; unchanged: readonly string[]; warnings: readonly string[] };
export type ProjectAgentInstaller = {
  sync(input: { root: string; agents: AgentSelection }): Promise<ProjectAgentSyncResult>;
  inspect(input: { root: string; agents: AgentSelection }): Promise<readonly { path: string; status: 'present' | 'missing' | 'conflict' }[]>;
};
export function createProjectAgentInstaller(input?: { templateRoot?: string }): ProjectAgentInstaller;
```

- The manifest schema is exactly:

```ts
type AgentInstallManifest = {
  version: 1;
  files: Record<string, { sha256: string; agent: AgentName }>;
};
```

and is stored at `.sdd/runtime/agent-installations.json`.

- [ ] **Step 1: Write failing installer tests using only temporary repositories.**

```ts
it('parses all, a single Agent, and an ordered comma-separated subset', () => {
  expect(parseAgentSelection('all')).toEqual(['claude', 'codex', 'codebuddy']);
  expect(parseAgentSelection('codex,codebuddy')).toEqual(['codex', 'codebuddy']);
  expect(() => parseAgentSelection('claude,unknown')).toThrow('Unknown Agent');
});

it('installs selected files and merges team-sdd without losing an existing MCP server', async () => {
  await writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { existing: { command: 'keep' } } }));
  const result = await installer.sync({ root, agents: ['claude', 'codebuddy'] });
  expect(result.installed).toContain('.claude/commands/sdd/new.md');
  expect(JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8')).mcpServers).toMatchObject({
    existing: { command: 'keep' },
    'team-sdd': { command: 'node', args: ['node_modules/@zbp/sdd/dist/mcp-server.js'] },
  });
});

it('is idempotent but rejects a user change to a formerly managed command', async () => {
  await installer.sync({ root, agents: ['claude'] });
  await expect(installer.sync({ root, agents: ['claude'] })).resolves.toMatchObject({ unchanged: expect.any(Array) });
  await appendFile(join(root, '.claude/commands/sdd/new.md'), '\\nuser edit');
  await expect(installer.sync({ root, agents: ['claude'] })).rejects.toMatchObject({ code: 'AGENT_FILE_CONFLICT' });
});

it('rejects symlinked managed directories/configuration and a conflicting team-sdd MCP entry', async () => {
  await symlink(outside, join(root, '.claude'));
  await expect(installer.sync({ root, agents: ['claude'] })).rejects.toMatchObject({ code: 'AGENT_PATH_UNSAFE' });
  await writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { 'team-sdd': { command: 'other' } } }));
  await expect(installer.sync({ root, agents: ['codebuddy'] })).rejects.toMatchObject({ code: 'MCP_SERVER_CONFLICT' });
});
```

- [ ] **Step 2: Run the installer tests and confirm they fail because no module exists.**

Run: `npm test -- tests/agents/project-agent-installer.test.ts`

Expected: FAIL with module-not-found / missing export failures.

- [ ] **Step 3: Implement parsing, safe ownership updates, and configuration merges.**

Implement `parseAgentSelection` by splitting on commas, trimming, rejecting an empty segment and duplicates, and returning canonical `['claude', 'codex', 'codebuddy']` order. `all` must not be mixed with another value.

For every path segment that will be read, created, or written, call `lstat`; reject symbolic links, a file where a directory is needed, and a directory where a file is needed with `DomainError('AGENT_PATH_UNSAFE', ...)`. Use `mkdir({ recursive: true })` only after validating existing ancestors. Never follow a user-supplied symlink.

Copy every Markdown/JSON template using UTF-8 bytes. For each output file compute `createHash('sha256').update(bytes).digest('hex')`. Update an existing Team SDD file only when its current digest equals the recorded manifest digest or it already exactly equals the desired bytes; otherwise throw `DomainError('AGENT_FILE_CONFLICT', ...)`. Record every successful file digest atomically by writing the manifest only after all output files and configuration changes succeed.

Read a real regular `.mcp.json` as JSON object with object-valued `mcpServers`; if absent create `{ "mcpServers": { "team-sdd": { "type": "stdio", "command": "node", "args": ["node_modules/@zbp/sdd/dist/mcp-server.js"] } } }` serialized with two spaces and one trailing newline. If present, preserve every entry and append `team-sdd` if missing. If present `team-sdd` differs, throw `DomainError('MCP_SERVER_CONFLICT', ...)`; if equal leave it unchanged. Use that one same server value for Claude and CodeBuddy.

For Codex, copy only `templates/codex/plugins/team-sdd/**` and merge `.agents/plugins/marketplace.json`: preserve all existing plugins; append the exact `team-sdd` entry when absent; reject a non-equivalent existing `team-sdd` entry using `DomainError('CODEX_MARKETPLACE_CONFLICT', ...)`.

- [ ] **Step 4: Run the focused installer suite and typecheck.**

Run: `npm test -- tests/agents/project-agent-installer.test.ts && npm run typecheck`

Expected: PASS for all selections, deep merge, idempotence, conflicts, and symlink defense.

- [ ] **Step 5: Commit the safe installer.**

```bash
git add src/agents tests/agents/project-agent-installer.test.ts
git commit -m "feat: install project Agent adapters safely"
```

### Task 4: Add project npm installation and explicit Codex registration

**Files:**
- Create: `src/agents/npm-project-installer.ts`
- Create: `src/agents/codex-registration.ts`
- Create: `tests/agents/npm-project-installer.test.ts`
- Create: `tests/agents/codex-registration.test.ts`

**Interfaces:**
- Produces:

```ts
export type RunProcess = (file: string, args: readonly string[], options: { cwd: string }) => Promise<void>;
export function installCurrentPackage(input: { root: string; packageName: string; version: string; runProcess: RunProcess }): Promise<void>;
export function registerCodexProjectMarketplace(input: { root: string; runProcess: RunProcess }): Promise<void>;
```

- `installCurrentPackage` invokes exactly `npm install --save-dev --save-exact @zbp/sdd@<version>` in `root`.
- `registerCodexProjectMarketplace` invokes exactly two process calls in order:

```ts
await runProcess('codex', ['plugin', 'marketplace', 'add', join(root, '.agents')], { cwd: root });
await runProcess('codex', ['plugin', 'add', 'team-sdd@team-sdd-project'], { cwd: root });
```

Use this fake process for both focused test files:

```ts
function capture(calls: unknown[]): RunProcess {
  return async (file, args, options) => {
    calls.push([file, [...args], options]);
  };
}
```

- [ ] **Step 1: Write failing bounded-process tests.**

```ts
it('installs the exact package only in a Node project', async () => {
  const calls: unknown[] = [];
  await writeFile(join(root, 'package.json'), '{}');
  await installCurrentPackage({ root, packageName: '@zbp/sdd', version: '0.1.0', runProcess: capture(calls) });
  expect(calls).toEqual([['npm', ['install', '--save-dev', '--save-exact', '@zbp/sdd@0.1.0'], { cwd: root }]]);
  await expect(installCurrentPackage({ root: missingPackageRoot, packageName: '@zbp/sdd', version: '0.1.0', runProcess: capture([]) }))
    .rejects.toMatchObject({ code: 'NPM_PROJECT_PACKAGE_MISSING' });
});

it('registers only the current repository marketplace and named plugin', async () => {
  const calls: unknown[] = [];
  await registerCodexProjectMarketplace({ root, runProcess: capture(calls) });
  expect(calls).toEqual([
    ['codex', ['plugin', 'marketplace', 'add', join(root, '.agents')], { cwd: root }],
    ['codex', ['plugin', 'add', 'team-sdd@team-sdd-project'], { cwd: root }],
  ]);
});
```

- [ ] **Step 2: Run the focused tests and confirm missing module failures.**

Run: `npm test -- tests/agents/npm-project-installer.test.ts tests/agents/codex-registration.test.ts`

Expected: FAIL because neither helper exists.

- [ ] **Step 3: Implement bounded process helpers.**

Use `exists` plus `lstat` to require a real regular `package.json`. Wrap the injected production `execFile` promisified call; do not use a shell or concatenate a command string. Translate child-process failure to `DomainError('PROJECT_NPM_INSTALL_FAILED', ...)` or `DomainError('CODEX_REGISTRATION_FAILED', ...)`, retaining the original message as cause text. `registerCodexProjectMarketplace` must first require the real regular `.agents/plugins/marketplace.json` and real plugin manifest created by Task 3; otherwise throw `DomainError('CODEX_PROJECT_PLUGIN_MISSING', ...)` before calling Codex.

- [ ] **Step 4: Run the focused process suite and typecheck.**

Run: `npm test -- tests/agents/npm-project-installer.test.ts tests/agents/codex-registration.test.ts && npm run typecheck`

Expected: PASS and captured argv arrays exactly match the contract.

- [ ] **Step 5: Commit installation and registration helpers.**

```bash
git add src/agents tests/agents/npm-project-installer.test.ts tests/agents/codex-registration.test.ts
git commit -m "feat: add local package install and Codex registration"
```

### Task 5: Expose installation through the CLI

**Files:**
- Modify: `src/cli.ts`
- Create: `tests/cli-agent-install.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Extend CLI injection without breaking existing callers:

```ts
export type CliDependencies = {
  projectAgentInstaller?: ProjectAgentInstaller;
  installCurrentPackage?: typeof installCurrentPackage;
  registerCodexProjectMarketplace?: typeof registerCodexProjectMarketplace;
  packageManifest?: { name: string; version: string };
};
export async function runCli(args: string[], root?: string, dependencies?: CliDependencies): Promise<CliResult>;
```

- Expose `parseAgentSelection`, `createProjectAgentInstaller`, and `AgentName` from `src/index.ts`.

Use an injected dependency fixture rather than executing npm or Codex in CLI tests:

```ts
const sync = vi.fn(async () => ({ installed: [], unchanged: [], warnings: [] }));
const install = vi.fn(async () => undefined);
const register = vi.fn(async () => undefined);
const fakes: CliDependencies = {
  projectAgentInstaller: { sync, inspect: vi.fn(async () => []) },
  installCurrentPackage: install,
  registerCodexProjectMarketplace: register,
  packageManifest: { name: '@zbp/sdd', version: '0.1.0' },
};
```

- [ ] **Step 1: Write failing CLI behavior tests.**

```ts
it('keeps init Core-only when no Agent option is supplied', async () => {
  const result = await runCli(['init'], root, fakes);
  expect(result.exitCode).toBe(0);
  expect(fakes.sync).not.toHaveBeenCalled();
});

it('installs then synchronizes selected adapters and registers Codex only when explicit', async () => {
  const result = await runCli(['init', '--agents', 'claude,codex', '--install', '--register-codex'], root, fakes);
  expect(result.exitCode).toBe(0);
  expect(fakes.install).toHaveBeenCalledWith(expect.objectContaining({ packageName: '@zbp/sdd', version: '0.1.0' }));
  expect(fakes.sync).toHaveBeenCalledWith({ root, agents: ['claude', 'codex'] });
  expect(fakes.register).toHaveBeenCalledWith(expect.objectContaining({ root }));
});

it('rejects invalid selection and Codex registration without Codex', async () => {
  await expect(runCli(['init', '--agents', 'claude,unknown'], root, fakes)).resolves.toMatchObject({ exitCode: 1 });
  await expect(runCli(['init', '--agents', 'claude', '--register-codex'], root, fakes)).resolves.toMatchObject({
    exitCode: 1, stderr: expect.stringContaining('--register-codex requires selecting codex'),
  });
});

it('synchronizes adapters without running npm install', async () => {
  const result = await runCli(['agents', 'sync', '--agents', 'codebuddy'], root, fakes);
  expect(result.exitCode).toBe(0);
  expect(fakes.sync).toHaveBeenCalledWith({ root, agents: ['codebuddy'] });
  expect(fakes.install).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the CLI tests and confirm the command/options do not exist.**

Run: `npm test -- tests/cli-agent-install.test.ts`

Expected: FAIL because `init` has no options and `agents sync` is unrecognized.

- [ ] **Step 3: Implement CLI orchestration and clear output.**

Extend `init` with Commander options:

```ts
.option('--agents <agents>', 'install project Agent adapters: all|claude|codex|codebuddy')
.option('--install', 'add this exact package as a project dev dependency')
.option('--register-codex', 'register the project-local Codex marketplace')
```

After `await service.init()`, return immediately with the existing initialization message if no `--agents`. Otherwise parse the selection, reject an incompatible `--register-codex`, execute `installCurrentPackage` first when selected, execute `projectAgentInstaller.sync`, then register Codex only when selected. On a successful non-registering Codex sync, append this exact safe next step:

```text
Codex registration was not run. To register this project-local plugin, rerun with --register-codex.
```

Add the nested command exactly as:

```ts
program.command('agents').command('sync')
  .requiredOption('--agents <agents>')
  .option('--register-codex')
```

It uses the same parse/sync/register logic but never installs npm dependencies or calls Core `init`. Its success output lists created/updated paths and warnings from `ProjectAgentSyncResult`; never print tokens, package-manager environment values, or full child-process command text.

- [ ] **Step 4: Run focused CLI tests, existing CLI tests, typecheck, and build.**

Run: `npm test -- tests/cli-agent-install.test.ts tests/cli.test.ts tests/cli-diagnostics.test.ts && npm run typecheck && npm run build`

Expected: PASS; existing CLI behavior is unchanged and new exit-1 input failures are actionable.

- [ ] **Step 5: Commit the command surface.**

```bash
git add src/cli.ts src/index.ts tests/cli-agent-install.test.ts
git commit -m "feat: add Agent installation CLI commands"
```

### Task 6: Add installation diagnostics and Chinese user documentation

**Files:**
- Modify: `src/workflow/service.ts`
- Modify: `src/audit/repository-audit.ts`
- Modify: `src/audit/types.ts`
- Modify: `src/cli.ts`
- Modify: `README.md`
- Modify: `tests/workflow/diagnostics.test.ts`
- Modify: `tests/cli-diagnostics.test.ts`
- Modify: `tests/integrations/native-agent-artifacts.test.ts`

**Interfaces:**
- Extend the existing doctor diagnostic finding list with these exact codes and next steps:

| Code | Trigger | Next step |
|---|---|---|
| `PROJECT_PACKAGE_MISSING` | a recorded Agent adapter exists but `node_modules/@zbp/sdd/dist/mcp-server.js` is missing/not regular | `Run npx @zbp/sdd init --agents <selection> --install.` |
| `AGENT_ADAPTER_MISSING` | selected/recorded generated command or Skill missing | `Run sdd agents sync --agents <selection>.` |
| `MCP_SERVER_MISSING` | project `.mcp.json` lacks `mcpServers.team-sdd` | `Run sdd agents sync --agents <selection>.` |
Do not infer the user-level Codex registration state by reading global Codex configuration. The installer reports when Codex project files are present; the CLI prints the explicit registration reminder unless `--register-codex` was requested in that same invocation.

- [ ] **Step 1: Write failing diagnostics and documentation tests.**

```ts
it('reports missing project runtime and adapter repair commands', async () => {
  const result = await service.doctor();
  expect(result.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'PROJECT_PACKAGE_MISSING', nextStep: 'Run npx @zbp/sdd init --agents <selection> --install.' }),
  ]));
});

it('documents the Chinese first-install flow before status usage', async () => {
  const readme = await readFile('README.md', 'utf8');
  expect(readme).toContain('npx @zbp/sdd init --agents all --install --register-codex');
  expect(readme.indexOf('sdd new DLV-001')).toBeLessThan(readme.indexOf('sdd status DLV-001'));
  expect(readme).toContain('@zbp:registry=https://nexus.zyzbp.cn/repository/npm-hosted/');
});
```

- [ ] **Step 2: Run the focused diagnostics/docs tests and confirm the four codes and install guide are absent.**

Run: `npm test -- tests/workflow/diagnostics.test.ts tests/cli-diagnostics.test.ts tests/integrations/native-agent-artifacts.test.ts`

Expected: FAIL for absent package/adapter diagnostics and old README instructions.

- [ ] **Step 3: Implement read-only inspection and Chinese guides.**

Make `doctor` inspect only project-relative real paths and reuse the Task 3 safe `inspect()` API. A plain `doctor` must not create files, register Codex, install npm packages, or repair any Agent configuration. `doctor --fix` may call `sync` only for a manifest-recorded adapter after verifying every target remains safe and unmodified; it never calls `--install` or Codex registration.

Rewrite README’s install path in Chinese with this exact flow:

```bash
# 只配置一次；认证 Token 放在用户自己的 ~/.npmrc，勿提交到项目
echo '@zbp:registry=https://nexus.zyzbp.cn/repository/npm-hosted/' >> ~/.npmrc

# 在需要使用 Team SDD 的项目根目录执行
npx @zbp/sdd init --agents all --install --register-codex

# 先创建 Delivery，再查询状态
npx sdd new DLV-001 --title "示例功能" --type FEATURE_CHANGE --design-not-required "小范围变更"
npx sdd status DLV-001

# 升级包后同步适配文件；不会覆盖用户修改
npx sdd agents sync --agents all --register-codex
```

Immediately below, explain the slash command table, one-time Codex registration rationale, per-Agent selection examples, `.mcp.json` deep-merge preservation, conflict recovery (`doctor` then manually resolve, never delete user config blindly), and that Nexus tokens belong only in `~/.npmrc` or CI secrets. State clearly that the current command first requires `package.json` when `--install` is used.

- [ ] **Step 4: Run the focused diagnostics/doc tests and then all project verification.**

Run: `npm test -- tests/workflow/diagnostics.test.ts tests/cli-diagnostics.test.ts tests/integrations/native-agent-artifacts.test.ts && npm test && npm run typecheck && npm run build && npm --cache /private/tmp/zbp-sdd-npm-cache run pack:check && node dist/cli.js verify --ci`

Expected: PASS; doctor diagnoses install state read-only, README starts the usage sequence with `new`, and package dry-run remains allow-listed.

- [ ] **Step 5: Commit diagnostics and user documentation.**

```bash
git add src/workflow/service.ts src/audit src/cli.ts README.md tests/workflow/diagnostics.test.ts tests/cli-diagnostics.test.ts tests/integrations/native-agent-artifacts.test.ts
git commit -m "docs: simplify project Agent installation"
```

### Task 7: Validate the packed consumer workflow and hand off Nexus publication

**Files:**
- Create: `tests/agents/packed-consumer.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes the built tarball produced by `npm pack` and the `sdd` executable from Task 1.
- Produces a documented release checklist only; it does not execute a real publish.

Use these test helpers so the consumer proof invokes the archive, not source files:

```ts
const execFileAsync = promisify(execFile);
async function run(file: string, args: string[], cwd: string): Promise<void> {
  await execFileAsync(file, args, { cwd });
}
async function packToTemporaryDirectory(projectRoot: string, packDirectory: string): Promise<string> {
  const { stdout } = await execFileAsync('npm', [
    '--cache', '/private/tmp/zbp-sdd-npm-cache', 'pack', '--pack-destination', packDirectory,
  ], { cwd: projectRoot });
  return join(packDirectory, stdout.trim());
}
```

- [ ] **Step 1: Write a failing packed-consumer test.**

```ts
it('installs the packed artifact into a temporary Node project and synchronizes one adapter', async () => {
  const tarball = await packToTemporaryDirectory();
  await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
  await run('npm', ['install', '--ignore-scripts', '--save-dev', tarball], project);
  await run('node', [join(project, 'node_modules/@zbp/sdd/dist/cli.js'), 'agents', 'sync', '--agents', 'claude'], project);
  expect(await readFile(join(project, '.claude/commands/sdd/new.md'), 'utf8')).toContain('Team SDD managed: v1');
  expect(JSON.parse(await readFile(join(project, '.mcp.json'), 'utf8')).mcpServers['team-sdd'].args)
    .toEqual(['node_modules/@zbp/sdd/dist/mcp-server.js']);
});
```

- [ ] **Step 2: Run it and confirm it fails before the final package/installer behavior is complete.**

Run: `npm test -- tests/agents/packed-consumer.test.ts`

Expected: FAIL until the packed `dist/`, templates, and CLI command all work together.

- [ ] **Step 3: Make only integration fixes demonstrated by the packed test.**

Do not add dependencies or bypass the install manifest. If the archive excludes an expected file, correct the `files` allow-list or template path. If the binary fails to execute, correct the source hashbang/build output rather than invoking the source TypeScript file.

- [ ] **Step 4: Run the complete release verification.**

Run: `npm test -- tests/agents/packed-consumer.test.ts && npm test && npm run typecheck && npm run build && npm --cache /private/tmp/zbp-sdd-npm-cache run pack:check && node dist/cli.js verify --ci`

Expected: PASS; the tarball installs and generates a Claude project adapter without any network registry access beyond the project’s normal npm dependencies.

- [ ] **Step 5: Add the explicit operator-only Nexus release checklist and commit.**

Append this exact release sequence to README without a token value:

```bash
# 发布前，用户已在自己的 ~/.npmrc 配置 @zbp scope 与 Nexus Bearer Token
npm run prepublishOnly
npm publish --dry-run --registry=https://nexus.zyzbp.cn/repository/npm-hosted/

# 仅在负责人明确授权后执行；这会向 Nexus 写入一个不可撤销的版本
npm publish --registry=https://nexus.zyzbp.cn/repository/npm-hosted/
```

Then commit:

```bash
git add tests/agents/packed-consumer.test.ts README.md
git commit -m "test: validate packed Agent installation"
```

## Self-Review

### Spec coverage

- Private Nexus identity, package archive boundary, executable npx CLI, and credential exclusion: Tasks 1 and 7.
- `init --agents`, all/single/comma subsets, optional local install, and `agents sync`: Tasks 3–5.
- Claude/CodeBuddy colon commands and Codex hyphen commands: Task 2, installed by Task 3 and verified in Task 5/7.
- One-time explicit Codex project-marketplace registration: Tasks 2, 4, and 5.
- Project-local MCP runtime and Engine-only governance: Task 2 and Task 3 merge logic.
- Non-destructive merge, file ownership, collision rejection, symlink protection, and sync idempotence: Task 3.
- Doctor inspection/limited repair and Chinese onboarding that avoids status-before-new: Task 6.
- No actual Nexus publication without an authorized person: Global constraints and Task 7.

### Placeholder scan

No TODO/TBD/placeholders remain. Each implementation task names exact paths, interfaces, test expectations, commands, error codes, and content constraints.

### Type consistency

`AgentName`, `AgentSelection`, `ProjectAgentInstaller`, `RunProcess`, and `AgentInstallManifest` are introduced in Tasks 3–4 and used with the same signatures in Tasks 5–6. The agent order is always `claude`, `codex`, `codebuddy`; all `team-sdd` MCP configurations use exactly `node_modules/@zbp/sdd/dist/mcp-server.js`.
