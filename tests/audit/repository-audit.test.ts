import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { requirementPath } from '../../src/artifacts/artifact-store.js';
import { LocalDeliveryRepository } from '../../src/storage/local-repositories.js';
import { createSddService } from '../../src/workflow/service.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-audit-'));
  roots.push(root);
  return root;
}

async function createDelivery(root: string) {
  const service = createSddService({ root });
  await service.init();
  await service.createDelivery({ id: 'DLV-001', title: 'Student records', type: 'APPLICATION_INIT' });
  return service;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('read-only repository audit', () => {
  it('reports a malformed event row without changing metadata or events', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const metadataPath = join(root, 'sdd/deliveries/DLV-001/delivery.yaml');
    const eventsPath = join(root, '.sdd/events/DLV-001.jsonl');
    await appendFile(eventsPath, 'not-json\n');
    const metadataBefore = await readFile(metadataPath, 'utf8');
    const eventsBefore = await readFile(eventsPath, 'utf8');

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_LOG_INVALID' })]),
    });
    await expect(readFile(metadataPath, 'utf8')).resolves.toBe(metadataBefore);
    await expect(readFile(eventsPath, 'utf8')).resolves.toBe(eventsBefore);
  });

  it('reports a Delivery transition event that disagrees with metadata', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const eventsPath = join(root, '.sdd/events/DLV-001.jsonl');
    await appendFile(eventsPath, `${JSON.stringify({
      type: 'delivery.transitioned',
      deliveryId: 'DLV-001',
      occurredAt: new Date().toISOString(),
      previousState: 'REQUIREMENT',
      nextState: 'DONE',
    })}\n`);

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_DELIVERY_TRANSITION_INVALID' })]),
    });
  });

  it('reports an illegal Spec transition described by event metadata', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const eventsPath = join(root, '.sdd/events/DLV-001.jsonl');
    await appendFile(eventsPath, `${JSON.stringify({
      type: 'spec.transitioned',
      deliveryId: 'DLV-001',
      occurredAt: new Date().toISOString(),
      metadata: { specId: 'SP-001', previousState: 'READY', nextState: 'DONE' },
    })}\n`);

    await expect(service.verifyRepository({ mode: 'ci' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_SPEC_TRANSITION_INVALID' })]),
    });
  });

  it('runs the active Gate for every Delivery in CI mode', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    await service.createDelivery({ id: 'DLV-002', title: 'Accounts', type: 'APPLICATION_INIT' });

    const result = await service.verifyRepository({ mode: 'ci' });

    expect(result).toMatchObject({ ok: false });
    expect(result.findings.filter(({ code }) => code === 'REQUIREMENT_ARTIFACT_MISSING')).toHaveLength(2);
    expect(result.findings.filter(({ code }) => code === 'REQUIREMENT_APPROVAL_MISSING')).toHaveLength(2);
  });

  it('reports an event whose Delivery ID does not match its log', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    await appendFile(join(root, '.sdd/events/DLV-001.jsonl'), `${JSON.stringify({
      type: 'artifact.submitted',
      deliveryId: 'DLV-002',
      occurredAt: new Date().toISOString(),
    })}\n`);

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_DELIVERY_ID_INVALID' })]),
    });
  });

  it('reports an event with a non-ISO timestamp', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    await appendFile(join(root, '.sdd/events/DLV-001.jsonl'), `${JSON.stringify({
      type: 'artifact.submitted',
      deliveryId: 'DLV-001',
      occurredAt: 'yesterday',
    })}\n`);

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_LOG_INVALID' })]),
    });
  });

  it('reconciles metadata against the last valid Delivery transition', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const deliveries = new LocalDeliveryRepository(root);
    const delivery = await deliveries.read('DLV-001');
    await deliveries.save({ ...delivery, state: 'SPEC' });
    const eventsPath = join(root, '.sdd/events/DLV-001.jsonl');
    await appendFile(eventsPath, `${JSON.stringify({
      type: 'delivery.transitioned',
      deliveryId: 'DLV-001',
      occurredAt: new Date().toISOString(),
      previousState: 'REQUIREMENT',
      nextState: 'DESIGN',
    })}\n`);
    await appendFile(eventsPath, `${JSON.stringify({
      type: 'delivery.transitioned',
      deliveryId: 'DLV-001',
      occurredAt: new Date().toISOString(),
      previousState: 'DESIGN',
      nextState: 'DONE',
    })}\n`);

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({
        code: 'EVENT_DELIVERY_TRANSITION_INVALID',
        message: 'Latest Delivery transition ends in DESIGN, but metadata is SPEC.',
      })]),
    });
  });

  it('reports stale approval hashes in hook mode', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const path = requirementPath(root, 'DLV-001');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords\n\n## Baseline\n\nApproved scope');
    await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'reviewer' });
    await appendFile(path, '\nChanged after approval.\n');

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'REQUIREMENT_APPROVAL_STALE' })]),
    });
  });

  it('converts invalid project configuration into a finding', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    await writeFile(join(root, '.sdd/config.yaml'), 'version: 1\nexecution:\n  strategy: remote\n');

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'PROJECT_CONFIG_INVALID' })]),
    });
  });

  it('keeps normal verification compatible for one Delivery and includes audit findings', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    await appendFile(join(root, '.sdd/events/DLV-001.jsonl'), 'not-json\n');

    await expect(service.verify({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      activity: 'REQUIREMENT',
      ok: false,
      findings: expect.arrayContaining([
        expect.objectContaining({ code: 'REQUIREMENT_ARTIFACT_MISSING' }),
        expect.objectContaining({ code: 'EVENT_LOG_INVALID' }),
      ]),
    });
  });

  it('rejects a legal Delivery edge that is disconnected from the derived event state', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    await appendFile(join(root, '.sdd/events/DLV-001.jsonl'), `${JSON.stringify({
      type: 'delivery.transitioned',
      deliveryId: 'DLV-001',
      occurredAt: new Date().toISOString(),
      previousState: 'DESIGN',
      nextState: 'SPEC',
    })}\n`);

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({
        code: 'EVENT_DELIVERY_HISTORY_INVALID',
        message: expect.stringContaining('expected REQUIREMENT'),
      })]),
    });
  });

  it('rejects duplicate Delivery transitions even when each individual edge is legal', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const deliveries = new LocalDeliveryRepository(root);
    const delivery = await deliveries.read('DLV-001');
    await deliveries.save({ ...delivery, state: 'DESIGN' });
    const eventsPath = join(root, '.sdd/events/DLV-001.jsonl');
    const transition = { type: 'delivery.transitioned', deliveryId: 'DLV-001', occurredAt: new Date().toISOString(), previousState: 'REQUIREMENT', nextState: 'DESIGN' };
    await appendFile(eventsPath, `${JSON.stringify(transition)}\n${JSON.stringify({ ...transition, occurredAt: new Date(Date.now() + 1).toISOString() })}\n`);

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_DELIVERY_HISTORY_INVALID' })]),
    });
  });

  it('rejects a Spec transition without a preceding spec.created anchor', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const deliveries = new LocalDeliveryRepository(root);
    const delivery = await deliveries.read('DLV-001');
    await deliveries.save({ ...delivery, specs: [{ id: 'SP-001', title: 'Records', state: 'PLAN', dependencies: [], acceptanceCriteria: ['AC-1'] }] });
    await appendFile(join(root, '.sdd/events/DLV-001.jsonl'), `${JSON.stringify({
      type: 'spec.transitioned',
      deliveryId: 'DLV-001',
      occurredAt: new Date().toISOString(),
      metadata: { specId: 'SP-001', previousState: 'READY', nextState: 'PLAN' },
    })}\n`);

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_SPEC_HISTORY_INVALID' })]),
    });
  });

  it('rejects duplicate legal Spec transitions after the READY anchor', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const deliveries = new LocalDeliveryRepository(root);
    const delivery = await deliveries.read('DLV-001');
    await deliveries.save({ ...delivery, specs: [{ id: 'SP-001', title: 'Records', state: 'PLAN', dependencies: [], acceptanceCriteria: ['AC-1'] }] });
    const eventsPath = join(root, '.sdd/events/DLV-001.jsonl');
    const transition = { type: 'spec.transitioned', deliveryId: 'DLV-001', occurredAt: new Date().toISOString(), metadata: { specId: 'SP-001', previousState: 'READY', nextState: 'PLAN' } };
    await appendFile(eventsPath, `${JSON.stringify({ type: 'spec.created', deliveryId: 'DLV-001', occurredAt: new Date().toISOString(), metadata: { specId: 'SP-001' } })}\n${JSON.stringify(transition)}\n${JSON.stringify({ ...transition, occurredAt: new Date(Date.now() + 1).toISOString() })}\n`);

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({ code: 'EVENT_SPEC_HISTORY_INVALID' })]),
    });
  });

  it('rejects a Spec Pack declared in metadata without its spec.created anchor', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const deliveries = new LocalDeliveryRepository(root);
    const delivery = await deliveries.read('DLV-001');
    await deliveries.save({ ...delivery, specs: [{ id: 'SP-001', title: 'Records', state: 'READY', dependencies: [], acceptanceCriteria: ['AC-1'] }] });

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({
        code: 'EVENT_SPEC_HISTORY_INVALID',
        message: expect.stringContaining('missing its spec.created'),
      })]),
    });
  });

  it('rejects an event log without its delivery.created REQUIREMENT anchor', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    await writeFile(join(root, '.sdd/events/DLV-001.jsonl'), '');

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({
        code: 'EVENT_DELIVERY_HISTORY_INVALID',
        message: expect.stringContaining('missing its delivery.created'),
      })]),
    });
  });

  it('rejects metadata whose embedded Delivery ID differs from its directory', async () => {
    const root = await createRoot();
    const service = await createDelivery(root);
    const metadataPath = join(root, 'sdd/deliveries/DLV-001/delivery.yaml');
    const metadata = await readFile(metadataPath, 'utf8');
    await writeFile(metadataPath, metadata.replace('id: DLV-001', 'id: DLV-002'));

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({
        code: 'DELIVERY_METADATA_INVALID',
        message: expect.stringContaining('does not match requested Delivery ID'),
      })]),
    });
  });
});
