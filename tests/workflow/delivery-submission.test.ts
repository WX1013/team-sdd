import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { requirementPath } from '../../src/artifacts/artifact-store.js';
import { createSddService } from '../../src/workflow/service.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-submission-'));
  roots.push(root);
  return root;
}

async function writeValidRequirement(root: string): Promise<void> {
  const path = requirementPath(root, 'DLV-001');
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords\n\n## Baseline\n\nApproved scope');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Delivery artifact submission', () => {
  it('moves REQUIREMENT to DESIGN only after a submitted approved Requirement passes its Gate', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
    await writeValidRequirement(root);
    await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });

    await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'requirement' })).resolves.toMatchObject({
      accepted: true,
      advanced: true,
      deliveryState: 'DESIGN',
      findings: [],
    });
  });

  it('returns context from next without changing an otherwise valid Requirement state', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
    await writeValidRequirement(root);
    await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });

    await service.getNext({ deliveryId: 'DLV-001' });

    await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ delivery: { state: 'REQUIREMENT' } });
  });
});
