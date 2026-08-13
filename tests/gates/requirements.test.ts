import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArtifactStore, designPath, requirementPath } from '../../src/artifacts/artifact-store.js';
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

  it('requires a human Design decision before a feature Requirement can advance', async () => {
    const root = await createRoot();
    const feature: DeliveryMetadata = { ...application, type: 'FEATURE_CHANGE' };

    const result = await evaluateRequirementGate({ delivery: feature, artifacts: new ArtifactStore(root) });

    expect(result).toMatchObject({ ok: false, findings: expect.arrayContaining([
      expect.objectContaining({ code: 'DESIGN_DECISION_MISSING' }),
    ]) });
  });

  it('rejects Design that does not cover every stable Requirement identifier', async () => {
    const root = await createRoot();
    const requirement = requirementPath(root, 'DLV-001');
    const design = designPath(root, 'DLV-001');
    await mkdir(join(requirement, '..'), { recursive: true });
    await writeFile(requirement, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\n- REQ-001 Records\n- REQ-002 Search\n\n## Business Rules\n\n- BR-001 Isolate tenants\n\n## Baseline\n\nApproved');
    await writeFile(design, '# Design\n\n## System Boundary\n\nX\n\n## Overall Architecture\n\nX\n\n## Module Design\n\nX\n\n## Data Model\n\nX\n\n## API\n\nX\n\n## Core Flow\n\nX\n\n## Permissions\n\nX\n\n## Error Handling\n\nX\n\n## Performance\n\nX\n\n## Security\n\nX\n\n## Observability\n\nX\n\n## Deployment\n\nX\n\n## Compatibility / Migration\n\nX\n\n## Test Strategy\n\nX\n\n## Technical Risks\n\nX\n\n## Requirement Coverage\n\n- REQ-001');

    const result = await evaluateDesignGate({ delivery: { ...application, state: 'DESIGN' }, artifacts: new ArtifactStore(root) });

    expect(result).toMatchObject({ ok: false, findings: expect.arrayContaining([
      expect.objectContaining({ code: 'DESIGN_REQUIREMENT_COVERAGE_MISSING', message: expect.stringContaining('REQ-002') }),
      expect.objectContaining({ code: 'DESIGN_REQUIREMENT_COVERAGE_MISSING', message: expect.stringContaining('BR-001') }),
    ]) });
  });

  it('requires an explicit Design Requirement Coverage section even when no stable IDs exist yet', async () => {
    const root = await createRoot();
    const design = designPath(root, 'DLV-001');
    await mkdir(join(design, '..'), { recursive: true });
    await writeFile(design, '# Design\n\n## System Boundary\n\nX\n\n## Overall Architecture\n\nX\n\n## Module Design\n\nX\n\n## Data Model\n\nX\n\n## API\n\nX\n\n## Core Flow\n\nX\n\n## Permissions\n\nX\n\n## Error Handling\n\nX\n\n## Performance\n\nX\n\n## Security\n\nX\n\n## Observability\n\nX\n\n## Deployment\n\nX\n\n## Compatibility / Migration\n\nX\n\n## Test Strategy\n\nX\n\n## Technical Risks\n\nX');

    await expect(evaluateDesignGate({ delivery: { ...application, state: 'DESIGN' }, artifacts: new ArtifactStore(root) })).resolves.toMatchObject({
      ok: false, findings: expect.arrayContaining([expect.objectContaining({ code: 'DESIGN_SECTION_MISSING', message: expect.stringContaining('Requirement Coverage') })]),
    });
  });
});
