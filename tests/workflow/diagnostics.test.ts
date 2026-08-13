import { execFile } from 'node:child_process';
import { access, appendFile, chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { requirementPath } from '../../src/artifacts/artifact-store.js';
import { LocalDeliveryRepository } from '../../src/storage/local-repositories.js';
import { createSddService } from '../../src/workflow/service.js';
import { createProjectAgentInstaller } from '../../src/agents/index.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-diagnostics-'));
  roots.push(root);
  return root;
}

async function initGitRepository(root: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: root });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Team SDD diagnostics and bounded repair', () => {
  it('reports a missing Hook in doctor and creates it only with fix', async () => {
    const root = await createRoot();
    await initGitRepository(root);
    const service = createSddService({ root });

    await expect(service.doctor()).resolves.toMatchObject({
      ok: false,
      fixes: [],
      findings: expect.arrayContaining([expect.objectContaining({ code: 'GIT_HOOK_MISSING' })]),
    });
    await expect(access(join(root, '.githooks/pre-commit'))).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(service.doctor({ fix: true })).resolves.toMatchObject({
      fixes: expect.arrayContaining(['.githooks/pre-commit']),
    });
    await expect(readFile(join(root, '.githooks/pre-commit'), 'utf8')).resolves.toBe(
      '#!/usr/bin/env sh\nset -eu\nexec npx --no-install sdd verify --hook\n',
    );
  });

  it('re-inspects the Hook after local Git configuration fails during doctor fix', async () => {
    const root = await createRoot();
    const tools = join(root, 'tools');
    await mkdir(tools);
    const fakeGit = join(tools, 'git');
    await writeFile(fakeGit, `#!/usr/bin/env sh
if [ "$1" = "rev-parse" ] && [ "$2" = "--is-inside-work-tree" ]; then printf 'true\\n'; exit 0; fi
if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then printf '%s\\n' '${root}'; exit 0; fi
if [ "$1" = "config" ] && [ "$2" = "--local" ] && [ "$3" = "--get" ]; then exit 1; fi
if [ "$1" = "config" ] && [ "$2" = "--local" ]; then printf 'config denied\\n' >&2; exit 2; fi
exit 2
`);
    await chmod(fakeGit, 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = `${tools}:${originalPath ?? ''}`;
    try {
      const result = await createSddService({ root }).doctor({ fix: true });

      expect(result.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'GIT_CONFIG_FAILED' }),
        expect.objectContaining({ code: 'GIT_HOOKS_PATH_INVALID' }),
      ]));
      expect(result.findings).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'GIT_HOOK_MISSING' }),
      ]));
      await expect(readFile(join(root, '.githooks/pre-commit'), 'utf8')).resolves.toContain('sdd verify --hook');
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('initializes configuration outside Git without attempting Hook installation', async () => {
    const root = await createRoot();

    await expect(createSddService({ root }).init()).resolves.toEqual({ ok: true });

    await expect(readFile(join(root, '.sdd/config.yaml'), 'utf8')).resolves.toContain('strategy: auto');
    await expect(access(join(root, '.githooks/pre-commit'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('installs the Hook during initialization inside Git', async () => {
    const root = await createRoot();
    await initGitRepository(root);

    await createSddService({ root }).init();

    await expect(readFile(join(root, '.githooks/pre-commit'), 'utf8')).resolves.toContain('sdd verify --hook');
    await expect(execFileAsync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: root }))
      .resolves.toMatchObject({ stdout: '.githooks\n' });
  });

  it('changes only the supported execution strategy', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.init();
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
    const deliveryYaml = join(root, 'sdd/deliveries/DLV-001/delivery.yaml');
    const eventLog = join(root, '.sdd/events/DLV-001.jsonl');
    const deliveryBefore = await readFile(deliveryYaml, 'utf8');
    const eventsBefore = await readFile(eventLog, 'utf8');

    const expectedConfig = {
      version: 1,
      execution: { strategy: 'subagent' },
      checks: {
        test: ['npm', 'test'],
        typecheck: ['npm', 'run', 'typecheck'],
        build: ['npm', 'run', 'build'],
      },
    };
    await expect(service.setExecutionStrategy({ strategy: 'subagent' })).resolves.toEqual(expectedConfig);
    await expect(service.getConfig()).resolves.toEqual(expectedConfig);
    await expect(readFile(deliveryYaml, 'utf8')).resolves.toBe(deliveryBefore);
    await expect(readFile(eventLog, 'utf8')).resolves.toBe(eventsBefore);
  });

  it('reports a simulated Node.js version below 20', async () => {
    const root = await createRoot();

    await expect(createSddService({ root, nodeVersion: '18.20.8' }).doctor()).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({
        code: 'NODE_VERSION_UNSUPPORTED',
        message: expect.stringContaining('18.20.8'),
      })]),
    });
  });

  it('reports missing and invalid project configuration', async () => {
    const missingRoot = await createRoot();
    await expect(createSddService({ root: missingRoot }).doctor()).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({ code: 'PROJECT_CONFIG_INVALID' })]),
    });

    const invalidRoot = await createRoot();
    await mkdir(join(invalidRoot, '.sdd'));
    await writeFile(join(invalidRoot, '.sdd/config.yaml'), 'version: 1\nexecution:\n  strategy: remote\n');
    await expect(createSddService({ root: invalidRoot }).doctor()).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({ code: 'PROJECT_CONFIG_INVALID' })]),
    });
  });

  it('diagnoses a synchronized Agent adapter with missing local runtime and command files', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.init();
    await createProjectAgentInstaller().sync({ root, agents: ['claude'] });

    await expect(service.doctor()).resolves.toMatchObject({
      findings: expect.arrayContaining([
        expect.objectContaining({
          code: 'PROJECT_PACKAGE_MISSING',
          nextStep: 'Run npx @zbp/sdd init --agents <selection> --install.',
        }),
      ]),
    });

    await rm(join(root, '.claude/commands/sdd/new.md'));
    await expect(service.doctor()).resolves.toMatchObject({
      findings: expect.arrayContaining([
        expect.objectContaining({
          code: 'AGENT_ADAPTER_MISSING',
          artifact: '.claude/commands/sdd/new.md',
        }),
      ]),
    });
  });

  it('reports integration source entries that are not directories', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'integrations'), { recursive: true });
    await writeFile(join(root, 'integrations/claude-code'), 'not a directory');
    await mkdir(join(root, 'integrations/codebuddy'));

    await expect(createSddService({ root }).doctor()).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({
        code: 'INTEGRATION_SOURCE_INVALID',
        artifact: 'integrations/claude-code',
      })]),
    });
  });

  it('reports an integration source directory that is not readable', async () => {
    const root = await createRoot();
    const unreadable = join(root, 'integrations/claude-code');
    await mkdir(unreadable, { recursive: true });
    await mkdir(join(root, 'integrations/codebuddy'));
    await chmod(unreadable, 0o000);
    try {
      await expect(createSddService({ root }).doctor()).resolves.toMatchObject({
        findings: expect.arrayContaining([expect.objectContaining({
          code: 'INTEGRATION_SOURCE_UNREADABLE',
          artifact: 'integrations/claude-code',
        })]),
      });
    } finally {
      await chmod(unreadable, 0o755);
    }
  });

  it('rejects an unsupported execution strategy without changing configuration', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.init();
    const configPath = join(root, '.sdd/config.yaml');
    const before = await readFile(configPath, 'utf8');

    await expect(service.setExecutionStrategy({ strategy: 'remote' as never })).rejects.toMatchObject({
      code: 'EXECUTION_STRATEGY_UNSUPPORTED',
    });
    await expect(readFile(configPath, 'utf8')).resolves.toBe(before);
  });

  it('inspects current approval hashes and returns recorded events', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
    const path = requirementPath(root, 'DLV-001');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords\n\n## Baseline\n\nApproved scope');
    await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'reviewer' });

    await expect(service.inspect({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      delivery: { id: 'DLV-001' },
      activity: 'REQUIREMENT',
      next: { activity: 'REQUIREMENT' },
      approvalsCurrent: { requirement: true, design: false, spec: false },
    });
    await expect(service.events({ deliveryId: 'DLV-001' })).resolves.toEqual([
      expect.objectContaining({ type: 'delivery.created' }),
      expect.objectContaining({ type: 'requirement.approved' }),
    ]);

    await appendFile(path, '\nChanged after approval.\n');
    await expect(service.inspect({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      approvalsCurrent: { requirement: false, design: false, spec: false },
    });
  });

  it('returns the first non-DONE Spec Pack as the active inspection Spec', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
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

    await expect(service.inspect({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      activeSpec: { id: 'SP-002', state: 'PLAN' },
    });
  });

  it('keeps repair dry-run non-mutating and never rewrites authored or historical data', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
    const deliveryYaml = join(root, 'sdd/deliveries/DLV-001/delivery.yaml');
    const eventLog = join(root, '.sdd/events/DLV-001.jsonl');
    const requirement = requirementPath(root, 'DLV-001');
    await writeFile(requirement, 'authored requirement\n');
    const deliveryBefore = await readFile(deliveryYaml, 'utf8');
    const eventsBefore = await readFile(eventLog, 'utf8');
    const requirementBefore = await readFile(requirement, 'utf8');

    await expect(service.repair({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      applied: false,
      actions: ['sdd/deliveries/DLV-001/specs'],
    });
    await expect(access(join(root, 'sdd/deliveries/DLV-001/specs'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(deliveryYaml, 'utf8')).resolves.toBe(deliveryBefore);
    await expect(readFile(eventLog, 'utf8')).resolves.toBe(eventsBefore);
    await expect(readFile(requirement, 'utf8')).resolves.toBe(requirementBefore);

    await expect(service.repair({ deliveryId: 'DLV-001', apply: true })).resolves.toMatchObject({
      applied: true,
      actions: ['sdd/deliveries/DLV-001/specs'],
    });
    await expect(access(join(root, 'sdd/deliveries/DLV-001/specs'))).resolves.toBeUndefined();
    await expect(readFile(deliveryYaml, 'utf8')).resolves.toBe(deliveryBefore);
    await expect(readFile(eventLog, 'utf8')).resolves.toBe(eventsBefore);
    await expect(readFile(requirement, 'utf8')).resolves.toBe(requirementBefore);
  });

  it('repair creates only missing derived directories for an absent Delivery', async () => {
    const root = await createRoot();
    const service = createSddService({ root });

    await expect(service.repair({ deliveryId: 'DLV-404', apply: true })).resolves.toMatchObject({
      applied: true,
      actions: ['.sdd', 'sdd/deliveries/DLV-404', 'sdd/deliveries/DLV-404/specs'],
    });
    await expect(access(join(root, '.sdd'))).resolves.toBeUndefined();
    await expect(access(join(root, 'sdd/deliveries/DLV-404/specs'))).resolves.toBeUndefined();
    await expect(access(join(root, 'sdd/deliveries/DLV-404/delivery.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(root, 'sdd/deliveries/DLV-404/requirement.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(root, '.sdd/events/DLV-404.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an invalid repair Delivery ID before creating directories', async () => {
    const root = await createRoot();
    const service = createSddService({ root });

    await expect(service.repair({ deliveryId: 'DLV-../../escaped' as never, apply: true }))
      .rejects.toThrow('Invalid Delivery ID');
    await expect(access(join(root, 'sdd/deliveries/escaped'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(root, '.sdd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects symlinked repair ancestors before creating any outside directory', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await symlink(outside, join(root, 'sdd'));

    await expect(createSddService({ root }).repair({ deliveryId: 'DLV-001', apply: true }))
      .rejects.toMatchObject({ name: 'DomainError', code: 'REPAIR_PATH_UNSAFE' });
    await expect(access(join(outside, 'deliveries'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(root, '.sdd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
