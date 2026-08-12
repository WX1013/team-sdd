# Team SDD Audit and CLI Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe repository diagnostics, audit-backed verification modes, configuration, inspection, event viewing, constrained repair, and PRD-complete CLI presentation.

**Architecture:** A new `audit` module reads project configuration and persisted Delivery/Event records, returning structured findings rather than mutating workflow data. `SddService` composes the audit module with existing Gate evaluators; CLI maps those results to human-readable output and stable exit codes.

**Tech Stack:** Node.js 20+, ESM TypeScript, Vitest, Zod, YAML, Commander.

## Global Constraints

- Never mutate Delivery state, approvals, or events outside existing Core submission and approval methods.
- Hook and CI verification return findings; they never transition workflow state.
- `repair --apply` may create only a missing `.sdd/`, `sdd/deliveries/<id>/`, or `sdd/deliveries/<id>/specs/` derived path and never write authored Markdown, metadata, or events. Preview is the default and `--dry-run` is its explicit equivalent; `--apply` and `--dry-run` are mutually exclusive.
- Preserve `verify <deliveryId>` compatibility while adding `--hook` and `--ci`.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `src/config/project-config.ts` | Parse, default, read, and write the bounded project configuration. |
| `src/audit/types.ts` | Audit findings, verification modes, and diagnostic result types. |
| `src/audit/repository-audit.ts` | Read-only config, metadata, event, approval, and Gate audit. |
| `src/storage/local-repositories.ts` | Enumerate Delivery IDs and read event JSONL rows. |
| `src/integrations/git-hook.ts` | Deterministic local Git Hook inspection and installation. |
| `src/workflow/service.ts` | Service-facing diagnostics, audit-backed verify, and constrained repair. |
| `src/cli.ts` | New commands and Status/Gate rendering. |
| `tests/config/project-config.test.ts` | Configuration test coverage. |
| `tests/audit/repository-audit.test.ts` | Event, metadata, approval, and mode audit coverage. |
| `tests/workflow/diagnostics.test.ts` | Service behavior and repair boundary coverage. |
| `tests/cli-diagnostics.test.ts` | CLI commands and UX coverage. |

### Task 1: Add project configuration and read-only repository enumeration

**Files:** Create `src/config/project-config.ts`, `tests/config/project-config.test.ts`; modify `src/storage/local-repositories.ts`, `src/storage/ports.ts`, `src/workflow/service.ts`.

**Interfaces:**

```ts
type ExecutionStrategy = 'auto' | 'inline' | 'subagent';
type ProjectConfig = {
  version: 1;
  execution: { strategy: ExecutionStrategy };
  checks: {
    test: readonly ['npm', 'test'];
    typecheck: readonly ['npm', 'run', 'typecheck'];
    build: readonly ['npm', 'run', 'build'];
  };
};
const defaultProjectConfig: ProjectConfig;
function readProjectConfig(root: string): Promise<ProjectConfig>;
function writeProjectConfig(root: string, config: ProjectConfig): Promise<void>;
interface DeliveryRepository { listIds(): Promise<DeliveryId[]>; }
interface EventRepository { read(deliveryId: DeliveryId): Promise<WorkflowEvent[]>; }
```

- [ ] **Step 1: Write failing configuration and enumeration tests.**

```ts
it('reads the default initialized configuration', async () => {
  await createSddService({ root }).init();
  await expect(readProjectConfig(root)).resolves.toEqual({ version: 1, execution: { strategy: 'auto' } });
});

it('rejects an unsupported execution strategy', async () => {
  await writeFile(join(root, '.sdd/config.yaml'), 'version: 1\nexecution:\n  strategy: remote\n');
  await expect(readProjectConfig(root)).rejects.toMatchObject({ code: 'INVALID_PROJECT_CONFIG' });
});

it('lists persisted Delivery IDs and reads their JSONL events', async () => {
  await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
  await expect(deliveries.listIds()).resolves.toEqual(['DLV-001']);
  await expect(events.read('DLV-001')).resolves.toEqual([expect.objectContaining({ type: 'delivery.created' })]);
});
```

- [ ] **Step 2: Run the focused tests to verify RED.**

Run: `npm test -- tests/config/project-config.test.ts`

Expected: FAIL because the config module and repository readers do not exist.

- [ ] **Step 3: Implement the bounded config and repository readers.**

```ts
const projectConfigSchema = z.object({
  version: z.literal(1),
  execution: z.object({ strategy: z.enum(['auto', 'inline', 'subagent']) }).strict(),
}).strict();

async listIds(): Promise<DeliveryId[]> {
  const directory = join(this.root, 'sdd', 'deliveries');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => parseDeliveryId(entry.name)).sort();
}
```

Parse every nonempty event line as JSON and validate the required `WorkflowEvent` shape; malformed rows throw `DomainError('INVALID_EVENT_LOG', ...)`. Change `init` to write `defaultProjectConfig` through the config writer.

- [ ] **Step 4: Run focused tests and type checking to verify GREEN.**

Run: `npm test -- tests/config/project-config.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the independently testable configuration foundation.**

```bash
git add src/config src/storage src/workflow/service.ts tests/config
git commit -m "feat: add Team SDD project configuration"
```

### Task 2: Implement read-only audit and unified verification modes

**Files:** Create `src/audit/types.ts`, `src/audit/repository-audit.ts`, `tests/audit/repository-audit.test.ts`; modify `src/workflow/service.ts`, `src/index.ts`.

**Interfaces:**

```ts
type VerifyMode = 'normal' | 'hook' | 'ci';
type AuditFinding = { code: string; message: string; artifact: string; nextStep: string };
type AuditResult = { ok: true; findings: [] } | { ok: false; findings: AuditFinding[] };
function auditDelivery(input: { root: string; delivery: DeliveryMetadata; mode: VerifyMode }): Promise<AuditResult>;
function auditRepository(input: { root: string; mode: 'hook' | 'ci' }): Promise<AuditResult>;
```

- [ ] **Step 1: Write failing audit tests.**

```ts
it('reports a malformed event row without changing metadata', async () => {
  await appendFile(join(root, '.sdd/events/DLV-001.jsonl'), 'not-json\n');
  await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
    ok: false, findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_LOG_INVALID' })]),
  });
});

it('reports a Delivery transition event that disagrees with metadata', async () => {
  await appendFile(eventsPath, JSON.stringify({ type: 'delivery.transitioned', deliveryId: 'DLV-001', occurredAt: new Date().toISOString(), previousState: 'REQUIREMENT', nextState: 'DONE' }) + '\n');
  await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
    ok: false, findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_DELIVERY_TRANSITION_INVALID' })]),
  });
});

it('keeps normal verification compatible for one Delivery', async () => {
  await expect(service.verify({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ activity: 'REQUIREMENT', ok: false });
});
```

- [ ] **Step 2: Run the audit test to verify RED.**

Run: `npm test -- tests/audit/repository-audit.test.ts`

Expected: FAIL because `verifyRepository` and the audit module do not exist.

- [ ] **Step 3: Implement audit composition.**

Validate each event’s Delivery ID and ISO timestamp; for `delivery.transitioned`, invoke `transitionDelivery(previousState, nextState)` and confirm the latest Delivery transition equals stored metadata state. For `spec.transitioned`, use `transitionSpec` against states in event metadata. Convert all malformed data and transition exceptions into findings, never uncaught errors.

For normal mode, combine audit findings with the existing single-Delivery `evaluate` result. For Hook mode, audit configuration, metadata, event structure/transitions, and current approval hashes without running external commands. For CI mode, audit every listed Delivery and reuse the same validation routines.

- [ ] **Step 4: Run focused audit tests and all Core workflow tests.**

Run: `npm test -- tests/audit/repository-audit.test.ts tests/workflow && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the audit and verification API.**

```bash
git add src/audit src/workflow/service.ts src/index.ts tests/audit
git commit -m "feat: add audited Team SDD verification modes"
```

### Task 3: Add diagnostics, inspection, configuration mutation, and constrained repair

**Files:** Create `src/integrations/git-hook.ts`, `tests/integrations/git-hook-installer.test.ts`, `tests/workflow/diagnostics.test.ts`; modify `src/workflow/service.ts`, `src/index.ts`.

**Interfaces:**

```ts
type DoctorResult = { ok: boolean; findings: AuditFinding[]; fixes: readonly string[] };
type InspectionResult = { delivery: DeliveryMetadata; activity: Activity; activeSpec: SpecSummary | undefined; next: NextResult; approvalsCurrent: Record<ApprovalArtifact, boolean> };
type RepairResult = { applied: boolean; actions: readonly string[]; findings: AuditFinding[] };
doctor(input?: { fix?: boolean }): Promise<DoctorResult>;
inspect(input: DeliveryRef): Promise<InspectionResult>;
events(input: DeliveryRef): Promise<WorkflowEvent[]>;
getConfig(): Promise<ProjectConfig>;
setExecutionStrategy(input: { strategy: ExecutionStrategy }): Promise<ProjectConfig>;
repair(input: DeliveryRef & { apply?: boolean }): Promise<RepairResult>;
```

- [ ] **Step 1: Write failing service tests for every write boundary.**

```ts
it('reports a missing Hook in doctor and creates it only with fix', async () => {
  await initGitRepository(root);
  await expect(service.doctor()).resolves.toMatchObject({ ok: false, fixes: [] });
  await expect(service.doctor({ fix: true })).resolves.toMatchObject({ fixes: expect.arrayContaining(['.githooks/pre-commit']) });
});

it('changes only the supported execution strategy', async () => {
  await expect(service.setExecutionStrategy({ strategy: 'subagent' })).resolves.toMatchObject({ execution: { strategy: 'subagent' } });
});

it('keeps repair dry-run non-mutating and refuses authored artifacts', async () => {
  const before = await readFile(deliveryYaml, 'utf8');
  await expect(service.repair({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ applied: false });
  expect(await readFile(deliveryYaml, 'utf8')).toBe(before);
});
```

- [ ] **Step 2: Run diagnostics tests to verify RED.**

Run: `npm test -- tests/workflow/diagnostics.test.ts tests/integrations/git-hook-installer.test.ts`

Expected: FAIL because diagnostic service methods are absent.

- [ ] **Step 3: Implement the Hook writer and minimal safe diagnostics.**

Write `src/integrations/git-hook.ts` with `installGitHook(root)` and `inspectGitHook(root)`. The installed executable pre-commit file is exactly:

```sh
#!/usr/bin/env sh
set -eu
exec npx --no-install sdd verify --hook
```

Create `.githooks` using mode `0o755` and run `git config --local core.hooksPath .githooks` through `execFile`. A non-Git project is not an initialization failure: `init` writes configuration, and `doctor` reports that a Hook cannot be installed. In a Git project, `init` installs the Hook. `doctor({ fix: true })` calls the same installer. `inspect` gets status, current activity, next context, and hash validity for each approval. `doctor` also reports Node major version below 20, missing config, and unreadable integration source directories. `repair` may create a missing `.sdd/` directory, Delivery directory, or `specs/` directory; it must not create/overwrite `delivery.yaml` or Markdown.

- [ ] **Step 4: Run focused diagnostics tests and type checking.**

Run: `npm test -- tests/workflow/diagnostics.test.ts tests/integrations/git-hook-installer.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit diagnostics and bounded repair.**

```bash
git add src/integrations/git-hook.ts src/workflow/service.ts src/index.ts tests/integrations/git-hook-installer.test.ts tests/workflow/diagnostics.test.ts
git commit -m "feat: add Team SDD diagnostics and safe repair"
```

### Task 4: Complete CLI commands and PRD UX

**Files:** Create `tests/cli-diagnostics.test.ts`; modify `src/cli.ts`, `package.json`, `README.md`.

**Interfaces:** CLI supports `doctor [--fix]`, `inspect <deliveryId>`, `events <deliveryId>`, `config show`, `config set execution.strategy <strategy>`, `repair <deliveryId> [--apply|--dry-run]`, `verify <deliveryId>`, `verify --hook`, `verify --ci`, and script `verify:ci`.

- [ ] **Step 1: Write failing CLI UX tests.**

```ts
it('renders workflow milestones, Spec Packs, current activity, and next command', async () => {
  const result = await runCli(['status', 'DLV-001'], root);
  expect(result.stdout).toContain('Workflow');
  expect(result.stdout).toContain('Requirement');
  expect(result.stdout).toContain('Next');
});

it('renders structured Gate failures as numbered repairs', async () => {
  const result = await runCli(['verify', 'DLV-001'], root);
  expect(result.stderr).toContain('issues need attention');
  expect(result.stderr).toContain('→');
});

it('runs repository hook verification without a Delivery argument', async () => {
  await expect(runCli(['verify', '--hook'], root)).resolves.toMatchObject({ exitCode: 0 });
});
```

- [ ] **Step 2: Run CLI tests to verify RED.**

Run: `npm test -- tests/cli-diagnostics.test.ts`

Expected: FAIL because these commands and detailed renderers do not exist.

- [ ] **Step 3: Implement CLI mappings.**

Use a mutually exclusive `--hook`/`--ci` option group. Map normal Gate and audit findings through one `displayFindings` formatter that prints the blocked progression, issue count, numbered message, and arrow next step. Add `verify:ci` as `node dist/cli.js verify --ci`; document that it requires a prior build.

- [ ] **Step 4: Run all CLI, audit, and package tests.**

Run: `npm test -- tests/cli.test.ts tests/cli-diagnostics.test.ts tests/audit tests/package.test.ts && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the completed CLI interface.**

```bash
git add src/cli.ts package.json README.md tests/cli-diagnostics.test.ts
git commit -m "feat: complete Team SDD diagnostic CLI"
```

## Plan self-review

- [x] Config, audit, diagnostics, repair, verify modes, CLI UX, scripts, and tests map to every Core/CLI requirement in the approved design.
- [x] Repair has explicit non-bypass boundaries.
- [x] Later task interfaces use the exact types defined in earlier tasks.

## Plan review addendum: approved PRD safety corrections

This addendum is authoritative where earlier task prose or examples are narrower than the approved PRD completion design. It retains the historical task sequence while recording the implemented trust-boundary requirements.

- `ProjectConfig.checks` is strict and literal: only `['npm', 'test']`, `['npm', 'run', 'typecheck']`, and `['npm', 'run', 'build']` are valid. CI runs those fixed command arrays through shell-free process execution only after read-only all-Delivery audit returns no findings. Check failure is `CI_CHECK_FAILED` with fixed command and concise output; Hook and normal modes execute no project commands.
- Repository audit treats event history as contiguous: `delivery.created` anchors REQUIREMENT; every Delivery transition starts at the derived prior state. `spec.created` anchors each declared Spec Pack at READY; every Spec transition connects from its derived state. A successful Spec Check records `CODE→CHECK`, then `CHECK→DONE`, before any all-Specs-complete Delivery `EXECUTION→CHECK` event. A failed Check records `check.failed` without fake state-transition metadata while its Spec remains CODE. Missing, duplicate, reordered, and disconnected anchors/edges are findings. Metadata IDs must equal their directory/requested Delivery ID before audit resolves events or artifacts.
- `listIds` handles only a missing delivery directory as empty. Every other filesystem error propagates.
- All CLI commands accepting a Delivery ID parse it before service lookup. `LocalDeliveryRepository.read` and service lookup retain identity validation as defense-in-depth.
- Configuration reads and writes use no-follow `lstat` validation for both `.sdd/` and `.sdd/config.yaml`; symlinks and wrong file types fail as `PROJECT_CONFIG_PATH_UNSAFE`. Hook inspection/installation preserves any existing effective custom pre-commit Hook, whether it is at a custom `core.hooksPath` or the default `.git/hooks`; such conflicts are never overwritten or disabled by `init`/`doctor --fix`.
- CLI `--json` commands serialize the raw corresponding service result exclusively to stdout. Structured findings preserve exit code 2 without human text mixed into JSON.
- `inspect` returns `activeSpec`, chosen as the first non-DONE Spec Pack by the same convention as runtime activity resolution. Human inspection displays it and JSON includes it.
- `repair` preview is non-mutating by default. `repair --dry-run` is an explicit equivalent and `repair --apply --dry-run` is a deterministic input error before any write. Neither mode may create a Hook path; repair scope is only `.sdd/`, the requested Delivery directory, and its `specs/` directory.

### Addendum self-review

- [x] CI execution uses fixed, validated configuration arrays and cannot run caller-controlled shell strings.
- [x] Audit identity/history checks prevent alternate metadata, event, and artifact scopes.
- [x] Config, Hook, and repair writes reject symlink/conflict paths before mutation.
- [x] CLI results preserve both human guidance and raw JSON integration contracts.
- [x] Repair and inspection interfaces now describe their explicit runtime behavior.
- [x] Successful and failed Check events have legal, metadata-consistent histories that repository audit accepts.
