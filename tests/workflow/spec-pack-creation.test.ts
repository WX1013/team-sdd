import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { requirementPath } from '../../src/artifacts/artifact-store.js';
import { createSddService } from '../../src/workflow/service.js';
import { mkdir, writeFile } from 'node:fs/promises';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-spec-pack-'));
  roots.push(root);
  return root;
}

async function enterSpec(service: ReturnType<typeof createSddService>, root: string): Promise<void> {
  await service.createDelivery({
    id: 'DLV-001',
    title: 'Records',
    type: 'FEATURE_CHANGE',
  });
  await service.decideDesign({ deliveryId: 'DLV-001', required: false, reason: 'Adds one optional field.', approvedBy: 'reviewer' });
  const path = requirementPath(root, 'DLV-001');
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords\n\n## Baseline\n\nApproved scope');
  await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });
  await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'requirement' });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Spec Pack creation', () => {
  it('creates a READY Spec Pack and structured Spec artifact only during SPEC', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await enterSpec(service, root);

    await service.createSpecPack({ deliveryId: 'DLV-001', id: 'SP-001', title: 'Records', acceptanceCriteria: ['AC-001'] });

    await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({
      delivery: { specs: [{ id: 'SP-001', state: 'READY', dependencies: [], acceptanceCriteria: ['AC-001'] }] },
    });
    await expect(readFile(join(root, 'sdd/deliveries/DLV-001/specs/SP-001/spec.md'), 'utf8')).resolves.toContain('## Acceptance Criteria');
  });
});
