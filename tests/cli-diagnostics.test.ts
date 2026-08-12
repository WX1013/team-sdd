import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { LocalDeliveryRepository } from '../src/storage/local-repositories.js';
import { createSddService } from '../src/workflow/service.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-cli-diagnostics-'));
  roots.push(root);
  return root;
}

async function initialize(root: string): Promise<void> {
  const result = await runCli(['init'], root);
  expect(result.exitCode).toBe(0);
}

async function createDelivery(root: string): Promise<void> {
  const result = await runCli(['new', 'DLV-001', '--title', 'Student records', '--type', 'APPLICATION_INIT'], root);
  expect(result.exitCode).toBe(0);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('diagnostic CLI commands', () => {
  it('renders workflow milestones, all Spec Packs, current activity, and the next command without changing state', async () => {
    const root = await createRoot();
    await createDelivery(root);
    const service = createSddService({ root });
    const deliveries = new LocalDeliveryRepository(root);
    const delivery = await deliveries.read('DLV-001');
    await deliveries.save({
      ...delivery,
      state: 'EXECUTION',
      specs: [
        { id: 'SP-001', title: 'Records API', state: 'DONE', dependencies: [], acceptanceCriteria: ['AC-1'] },
        { id: 'SP-002', title: 'Records UI', state: 'READY', dependencies: ['SP-001'], acceptanceCriteria: ['AC-2'] },
      ],
    });
    const before = await readFile(join(root, 'sdd/deliveries/DLV-001/delivery.yaml'), 'utf8');

    const result = await runCli(['status', 'DLV-001'], root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Workflow');
    expect(result.stdout).toContain('Requirement');
    expect(result.stdout).toContain('Spec Packs');
    expect(result.stdout).toContain('SP-001 Records API');
    expect(result.stdout).toContain('SP-002 Records UI');
    expect(result.stdout).toContain('Current');
    expect(result.stdout).toContain('Plan');
    expect(result.stdout).toContain('Next');
    expect(result.stdout).toContain('sdd next DLV-001');
    await expect(readFile(join(root, 'sdd/deliveries/DLV-001/delivery.yaml'), 'utf8')).resolves.toBe(before);
    await expect(service.events({ deliveryId: 'DLV-001' })).resolves.toHaveLength(1);
  });

  it('renders structured Gate failures as a blocked progression and numbered repairs', async () => {
    const root = await createRoot();
    await createDelivery(root);

    const result = await runCli(['verify', 'DLV-001'], root);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Cannot proceed from Requirement.');
    expect(result.stderr).toContain('issues need attention');
    expect(result.stderr).toContain('1.');
    expect(result.stderr).toContain('→');
  });

  it('runs repository Hook verification without a Delivery argument after initialization', async () => {
    const root = await createRoot();
    await initialize(root);

    await expect(runCli(['verify', '--hook'], root)).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining('Hook repository verification passed'),
    });
  });

  it('runs repository CI verification without a Delivery argument after initialization', async () => {
    const root = await createRoot();
    await initialize(root);
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'ci-fixture',
      private: true,
      scripts: {
        test: 'node -e "process.exit(0)"',
        typecheck: 'node -e "process.exit(0)"',
        build: 'node -e "process.exit(0)"',
      },
    }));

    await expect(runCli(['verify', '--ci'], root)).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining('CI repository verification passed'),
    });
  });

  it('rejects Hook and CI verification together', async () => {
    const root = await createRoot();

    const result = await runCli(['verify', '--hook', '--ci'], root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('cannot be used with option');
  });

  it('rejects a Delivery argument in repository verification modes', async () => {
    const root = await createRoot();

    const result = await runCli(['verify', 'DLV-001', '--hook'], root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('does not accept a Delivery ID');
  });

  it('requires exactly one Delivery ID for normal verification', async () => {
    const root = await createRoot();

    const missing = await runCli(['verify'], root);
    const extra = await runCli(['verify', 'DLV-001', 'DLV-002'], root);

    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain('Delivery ID is required');
    expect(extra.exitCode).toBe(1);
    expect(extra.stderr).toContain('too many arguments');
  });

  it('runs doctor and renders diagnostic findings with actionable next steps', async () => {
    const root = await createRoot();

    const result = await runCli(['doctor'], root);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Doctor found repository problems.');
    expect(result.stderr).toContain('issues need attention');
    expect(result.stderr).toContain('→');
  });

  it('applies only doctor fixes when --fix is provided', async () => {
    const root = await createRoot();
    await execFileAsync('git', ['init'], { cwd: root });

    const result = await runCli(['doctor', '--fix'], root);

    expect(result.stdout).toContain('Fixed');
    expect(result.stdout).toContain('.githooks/pre-commit');
    await expect(readFile(join(root, '.githooks/pre-commit'), 'utf8')).resolves.toContain('sdd verify --hook');
  });

  it('inspects full Delivery metadata, activity, approval validity, and next context', async () => {
    const root = await createRoot();
    await createDelivery(root);

    const result = await runCli(['inspect', 'DLV-001'], root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Inspection: DLV-001');
    expect(result.stdout).toContain('"title": "Student records"');
    expect(result.stdout).toContain('Current activity: Requirement');
    expect(result.stdout).toContain('requirement: not approved');
    expect(result.stdout).toContain('Next context');
  });

  it('renders parsed Delivery events in their recorded order', async () => {
    const root = await createRoot();
    await createDelivery(root);

    const result = await runCli(['events', 'DLV-001'], root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Events: DLV-001');
    expect(result.stdout).toContain('1. delivery.created');
  });

  it('shows and updates only execution.strategy configuration', async () => {
    const root = await createRoot();
    await initialize(root);

    const shown = await runCli(['config', 'show'], root);
    const updated = await runCli(['config', 'set', 'execution.strategy', 'subagent'], root);

    expect(shown.exitCode).toBe(0);
    expect(shown.stdout).toContain('execution.strategy: auto');
    expect(updated.exitCode).toBe(0);
    expect(updated.stdout).toContain('execution.strategy: subagent');
    await expect(createSddService({ root }).getConfig()).resolves.toEqual({
      version: 1,
      execution: { strategy: 'subagent' },
      checks: {
        test: ['npm', 'test'],
        typecheck: ['npm', 'run', 'typecheck'],
        build: ['npm', 'run', 'build'],
      },
    });
  });

  it('rejects configuration keys outside execution.strategy', async () => {
    const root = await createRoot();
    await initialize(root);

    const result = await runCli(['config', 'set', 'checks.test', 'subagent'], root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Only execution.strategy can be changed');
  });

  it('rejects an unsupported execution strategy at the CLI boundary without changing configuration', async () => {
    const root = await createRoot();
    await initialize(root);
    const configPath = join(root, '.sdd/config.yaml');
    const before = await readFile(configPath, 'utf8');

    const result = await runCli(['config', 'set', 'execution.strategy', 'remote'], root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Strategy must be one of: auto, inline, subagent');
    await expect(readFile(configPath, 'utf8')).resolves.toBe(before);
  });

  it('previews constrained repair by default and creates reported directories only with --apply', async () => {
    const root = await createRoot();

    const preview = await runCli(['repair', 'DLV-001'], root);
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain('Repair preview: DLV-001');
    expect(preview.stdout).toContain('sdd/deliveries/DLV-001/specs');
    await expect(access(join(root, 'sdd/deliveries/DLV-001/specs'))).rejects.toMatchObject({ code: 'ENOENT' });

    const applied = await runCli(['repair', 'DLV-001', '--apply'], root);
    expect(applied.exitCode).toBe(0);
    expect(applied.stdout).toContain('Repair applied: DLV-001');
    await expect(access(join(root, 'sdd/deliveries/DLV-001/specs'))).resolves.toBeUndefined();
    await expect(access(join(root, 'sdd/deliveries/DLV-001/delivery.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('accepts --dry-run as the explicit non-mutating repair preview', async () => {
    const root = await createRoot();

    const result = await runCli(['repair', 'DLV-001', '--dry-run'], root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Repair preview: DLV-001');
    await expect(access(join(root, 'sdd/deliveries/DLV-001/specs'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects mutually exclusive repair --apply and --dry-run without writes', async () => {
    const root = await createRoot();

    const result = await runCli(['repair', 'DLV-001', '--apply', '--dry-run'], root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('cannot be used with option');
    await expect(access(join(root, '.sdd'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(root, 'sdd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a traversal-shaped repair Delivery ID before writing any directory', async () => {
    const root = await createRoot();

    const result = await runCli(['repair', 'DLV-../../escaped', '--apply'], root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid Delivery ID');
    await expect(access(join(root, '.sdd'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(root, 'sdd'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(root, 'escaped'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('serializes the raw status service result as JSON without human display text', async () => {
    const root = await createRoot();
    await createDelivery(root);

    const result = await runCli(['status', 'DLV-001', '--json'], root);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ delivery: { id: 'DLV-001', title: 'Student records' } });
  });

  it('serializes failing normal verification as JSON on stdout while preserving exit code 2', async () => {
    const root = await createRoot();
    await createDelivery(root);

    const result = await runCli(['verify', 'DLV-001', '--json'], root);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, activity: 'REQUIREMENT' });
  });

  it('renders and serializes the active Spec Pack during inspection', async () => {
    const root = await createRoot();
    await createDelivery(root);
    const deliveries = new LocalDeliveryRepository(root);
    const delivery = await deliveries.read('DLV-001');
    await deliveries.save({
      ...delivery,
      state: 'EXECUTION',
      specs: [
        { id: 'SP-001', title: 'Completed records', state: 'DONE', dependencies: [], acceptanceCriteria: ['AC-1'] },
        { id: 'SP-002', title: 'Active records', state: 'PLAN', dependencies: [], acceptanceCriteria: ['AC-2'] },
      ],
    });

    const human = await runCli(['inspect', 'DLV-001'], root);
    const json = await runCli(['inspect', 'DLV-001', '--json'], root);

    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain('Active Spec: SP-002 / Plan');
    expect(JSON.parse(json.stdout)).toMatchObject({ activeSpec: { id: 'SP-002', state: 'PLAN' } });
  });

  it.each([
    ['status', ['status', 'DLV-../../escaped']],
    ['inspect', ['inspect', 'DLV-../../escaped']],
    ['events', ['events', 'DLV-../../escaped']],
    ['next', ['next', 'DLV-../../escaped']],
  ])('validates Delivery IDs at the %s CLI boundary', async (_command, args) => {
    const root = await createRoot();

    const result = await runCli(args, root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid Delivery ID');
  });

  it.each([
    ['approve', ['approve', 'DLV-../../escaped', 'requirement', '--by', 'reviewer']],
    ['spec create', ['spec', 'create', 'DLV-../../escaped', 'SP-001', '--title', 'Records']],
    ['submit', ['submit', 'DLV-../../escaped', 'requirement']],
    ['agent context', ['agent', 'context', 'DLV-../../escaped']],
    ['template requirement', ['template', 'requirement', 'DLV-../../escaped']],
  ])('validates Delivery IDs for %s before service lookup', async (_command, args) => {
    const root = await createRoot();

    const result = await runCli(args, root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid Delivery ID');
  });
});
