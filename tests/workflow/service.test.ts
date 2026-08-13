import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { requirementPath } from '../../src/artifacts/artifact-store.js';
import { createSddService } from '../../src/workflow/service.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-service-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Team SDD workflow service', () => {
  it('initializes a repository and creates a Delivery in REQUIREMENT', async () => {
    const root = await createRoot();
    const service = createSddService({ root });

    await service.init();
    await service.createDelivery({ id: 'DLV-001', title: 'Student records', type: 'APPLICATION_INIT' });

    await expect(access(join(root, '.sdd/config.yaml'))).resolves.toBeUndefined();
    await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      delivery: { id: 'DLV-001', state: 'REQUIREMENT' },
    });
  });

  it('records a current human Requirement approval against the artifact hash', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Student records', type: 'APPLICATION_INIT' });
    const path = requirementPath(root, 'DLV-001');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords\n\n## Baseline\n\nApproved scope');

    await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });

    await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      delivery: { approvals: { requirement: { actorType: 'human', approvedBy: 'wangxin' } } },
    });
  });

  it('returns the current activity and actionable blockers without changing state', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Student records', type: 'APPLICATION_INIT' });

    await expect(service.getNext({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      activity: 'REQUIREMENT',
      skillRuntime: {
        provider: 'team-sdd',
        skills: ['requirement'],
        adapter: 'prompt',
      },
      blockers: expect.arrayContaining([expect.objectContaining({ code: 'REQUIREMENT_ARTIFACT_MISSING' })]),
    });
    await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ delivery: { state: 'REQUIREMENT' } });
  });

  it('advances an application Delivery only after the Requirement Gate passes', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Student records', type: 'APPLICATION_INIT' });
    const path = requirementPath(root, 'DLV-001');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords\n\n## Baseline\n\nApproved scope');
    await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });

    await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'requirement' })).resolves.toMatchObject({
      advanced: true,
      deliveryState: 'DESIGN',
    });
    await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ delivery: { state: 'DESIGN' } });
  });

  it('recommends Design for a feature impact without changing Delivery state', async () => {
    const service = createSddService({ root: await createRoot() });
    await service.createDelivery({ id: 'DLV-001', title: 'Records API', type: 'FEATURE_CHANGE' });

    await expect(service.assessDesign({
      deliveryId: 'DLV-001', impacts: ['public_api_change'], reason: 'Adds a public endpoint',
    })).resolves.toMatchObject({ required: false, recommendation: 'RECOMMENDED', impacts: ['public_api_change'] });
    await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ delivery: { state: 'REQUIREMENT' } });
  });

  it('records a human Design decision as an auditable event', async () => {
    const service = createSddService({ root: await createRoot() });
    await service.createDelivery({ id: 'DLV-001', title: 'Records API', type: 'FEATURE_CHANGE' });

    await service.decideDesign({
      deliveryId: 'DLV-001', required: true, reason: 'Reviewed API impact', approvedBy: 'reviewer',
    });

    await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      delivery: { design: { required: true, reason: 'Reviewed API impact' } },
    });
    await expect(service.events({ deliveryId: 'DLV-001' })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'design.decided', metadata: expect.objectContaining({ approvedBy: 'reviewer' }) }),
    ]));
  });
});
