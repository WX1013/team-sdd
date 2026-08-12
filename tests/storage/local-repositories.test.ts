import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DeliveryMetadata } from '../../src/domain/types.js';
import { LocalDeliveryRepository, LocalEventRepository } from '../../src/storage/local-repositories.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const delivery: DeliveryMetadata = {
  id: 'DLV-001',
  title: 'Student records',
  type: 'APPLICATION_INIT',
  state: 'REQUIREMENT',
  approvals: {},
  specs: [],
};

describe('local repositories', () => {
  it('round-trips validated delivery metadata as YAML', async () => {
    const repository = new LocalDeliveryRepository(await createRoot());

    await repository.save(delivery);

    await expect(repository.read('DLV-001')).resolves.toEqual(delivery);
  });

  it('appends rather than overwrites JSONL workflow events', async () => {
    const root = await createRoot();
    const events = new LocalEventRepository(root);
    await events.append({ type: 'delivery.created', deliveryId: 'DLV-001', occurredAt: '2026-08-11T00:00:00.000Z' });
    await events.append({ type: 'requirement.generated', deliveryId: 'DLV-001', occurredAt: '2026-08-11T00:01:00.000Z' });

    const content = await readFile(join(root, '.sdd/events/DLV-001.jsonl'), 'utf8');
    expect(content.trim().split('\n')).toHaveLength(2);
    expect(content).toContain('delivery.created');
    expect(content).toContain('requirement.generated');
  });

  it('rejects malformed delivery metadata instead of defaulting fields', async () => {
    const root = await createRoot();
    const repository = new LocalDeliveryRepository(root);
    const deliveryDirectory = join(root, 'sdd/deliveries/DLV-001');
    await mkdir(deliveryDirectory, { recursive: true });
    await writeFile(join(deliveryDirectory, 'delivery.yaml'), 'id: DLV-001\ntitle: Missing state\n');

    await expect(repository.read('DLV-001')).rejects.toMatchObject({ code: 'INVALID_DELIVERY_METADATA' });
  });
});
