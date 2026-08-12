import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArtifactStore, requirementPath } from '../../src/artifacts/artifact-store.js';
import type { DeliveryMetadata } from '../../src/domain/types.js';
import { evaluateDesignGate, evaluateRequirementGate } from '../../src/gates/requirements.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-gates-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const application: DeliveryMetadata = {
  id: 'DLV-001',
  title: 'Student records',
  type: 'APPLICATION_INIT',
  state: 'REQUIREMENT',
  approvals: {},
  specs: [],
};

describe('Requirement and Design Gates', () => {
  it('reports a missing baseline and human approval as separate Requirement findings', async () => {
    const root = await createRoot();
    const path = requirementPath(root, 'DLV-001');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nIn scope');

    const result = await evaluateRequirementGate({ delivery: application, artifacts: new ArtifactStore(root) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected Requirement Gate to be blocked');
    expect(result.findings.map(({ code }) => code)).toEqual([
      'REQUIREMENT_BASELINE_MISSING',
      'REQUIREMENT_APPROVAL_MISSING',
    ]);
  });

  it('skips Design only for a feature change with an explicit false decision', async () => {
    const feature: DeliveryMetadata = {
      ...application,
      type: 'FEATURE_CHANGE',
      design: { required: false, reason: 'Adds an optional response field only.' },
    };

    await expect(evaluateDesignGate({ delivery: feature, artifacts: new ArtifactStore(await createRoot()) })).resolves.toEqual({ ok: true, skipped: true });
  });
});
