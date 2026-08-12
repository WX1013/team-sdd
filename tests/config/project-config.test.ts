import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultProjectConfig, readProjectConfig, writeProjectConfig } from '../../src/config/project-config.js';
import { LocalDeliveryRepository, LocalEventRepository } from '../../src/storage/local-repositories.js';
import { createSddService } from '../../src/workflow/service.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-config-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('project configuration and repository enumeration', () => {
  it('reads the default initialized configuration', async () => {
    const root = await createRoot();
    await createSddService({ root }).init();

    await expect(readProjectConfig(root)).resolves.toEqual({
      version: 1,
      execution: { strategy: 'auto' },
      checks: {
        test: ['npm', 'test'],
        typecheck: ['npm', 'run', 'typecheck'],
        build: ['npm', 'run', 'build'],
      },
    });
  });

  it('rejects an unsupported execution strategy', async () => {
    const root = await createRoot();
    const configDirectory = join(root, '.sdd');
    await mkdir(configDirectory, { recursive: true });
    await writeFile(join(configDirectory, 'config.yaml'), 'version: 1\nexecution:\n  strategy: remote\n');

    await expect(readProjectConfig(root)).rejects.toMatchObject({ code: 'INVALID_PROJECT_CONFIG' });
  });

  it('rejects a configuration that changes the fixed CI command arrays', async () => {
    const root = await createRoot();
    await mkdir(join(root, '.sdd'), { recursive: true });
    await writeFile(join(root, '.sdd/config.yaml'), 'version: 1\nexecution:\n  strategy: auto\nchecks:\n  test: [npm, run, test]\n  typecheck: [npm, run, typecheck]\n  build: [npm, run, build]\n');

    await expect(readProjectConfig(root)).rejects.toMatchObject({ code: 'INVALID_PROJECT_CONFIG' });
  });

  it('rejects a symlinked configuration directory before init writes outside the repository', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await symlink(outside, join(root, '.sdd'));

    await expect(createSddService({ root }).init()).rejects.toMatchObject({ code: 'PROJECT_CONFIG_PATH_UNSAFE' });
    await expect(readFile(join(outside, 'config.yaml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects config set when the existing .sdd directory is a symlink', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await mkdir(join(outside, '.sdd'), { recursive: true });
    await writeProjectConfig(outside, defaultProjectConfig);
    await symlink(join(outside, '.sdd'), join(root, '.sdd'));
    const before = await readFile(join(outside, '.sdd/config.yaml'), 'utf8');

    await expect(createSddService({ root }).setExecutionStrategy({ strategy: 'subagent' }))
      .rejects.toMatchObject({ code: 'PROJECT_CONFIG_PATH_UNSAFE' });
    await expect(readFile(join(outside, '.sdd/config.yaml'), 'utf8')).resolves.toBe(before);
  });

  it('rejects a non-directory .sdd path before writing configuration', async () => {
    const root = await createRoot();
    await writeFile(join(root, '.sdd'), 'sentinel\n');

    await expect(writeProjectConfig(root, defaultProjectConfig)).rejects.toMatchObject({ code: 'PROJECT_CONFIG_PATH_UNSAFE' });
    await expect(readFile(join(root, '.sdd'), 'utf8')).resolves.toBe('sentinel\n');
  });

  it('rejects a symlinked config file during reads and writes without changing its target', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    const outsideConfig = join(outside, 'config.yaml');
    await mkdir(join(root, '.sdd'));
    await writeFile(outsideConfig, 'outside config sentinel\n');
    await symlink(outsideConfig, join(root, '.sdd/config.yaml'));

    await expect(readProjectConfig(root)).rejects.toMatchObject({ code: 'PROJECT_CONFIG_PATH_UNSAFE' });
    await expect(writeProjectConfig(root, defaultProjectConfig)).rejects.toMatchObject({ code: 'PROJECT_CONFIG_PATH_UNSAFE' });
    await expect(readFile(outsideConfig, 'utf8')).resolves.toBe('outside config sentinel\n');
  });

  it('lists persisted Delivery IDs in sorted order and reads their JSONL events', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    const deliveries = new LocalDeliveryRepository(root);
    const events = new LocalEventRepository(root);
    await service.createDelivery({ id: 'DLV-002', title: 'Accounts', type: 'APPLICATION_INIT' });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });

    await expect(deliveries.listIds()).resolves.toEqual(['DLV-001', 'DLV-002']);
    await expect(events.read('DLV-001')).resolves.toEqual([expect.objectContaining({ type: 'delivery.created' })]);
  });

  it('returns no Delivery IDs when the delivery directory is missing', async () => {
    await expect(new LocalDeliveryRepository(await createRoot()).listIds()).resolves.toEqual([]);
  });

  it('propagates non-missing Delivery directory errors', async () => {
    const root = await createRoot();
    const deliveryParent = join(root, 'sdd');
    await mkdir(deliveryParent, { recursive: true });
    await writeFile(join(deliveryParent, 'deliveries'), 'not a directory');

    await expect(new LocalDeliveryRepository(root).listIds()).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('rejects malformed JSONL workflow event rows', async () => {
    const root = await createRoot();
    const eventDirectory = join(root, '.sdd/events');
    await mkdir(eventDirectory, { recursive: true });
    await writeFile(join(eventDirectory, 'DLV-001.jsonl'), '{not-json}\n');

    await expect(new LocalEventRepository(root).read('DLV-001')).rejects.toMatchObject({ code: 'INVALID_EVENT_LOG' });
  });

  it('reports physical JSONL line numbers for schema-invalid event rows', async () => {
    const root = await createRoot();
    const eventDirectory = join(root, '.sdd/events');
    await mkdir(eventDirectory, { recursive: true });
    await writeFile(join(eventDirectory, 'DLV-001.jsonl'), '\n{}\n');

    await expect(new LocalEventRepository(root).read('DLV-001')).rejects.toThrow('row 2');
  });
});
