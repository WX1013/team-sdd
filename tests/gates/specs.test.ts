import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArtifactStore, specDirectory } from '../../src/artifacts/artifact-store.js';
import type { DeliveryMetadata } from '../../src/domain/types.js';
import { evaluatePlanGate, evaluateSpecGate } from '../../src/gates/specs.js';

const roots: string[] = [];
const requiredSpec = (dependencies: string, criteria = '- AC-001 Create record\n- AC-002 Validate record') => `# Spec\n\n## Goal\n\nDeliver capability\n\n## Requirement Sources\n\nRequirement Baseline\n\n## Scope\n\nIncluded\n\n## Out of Scope\n\nExcluded\n\n## Acceptance Criteria\n\n${criteria}\n\n## Dependencies\n\n${dependencies}\n\n## Constraints\n\nNone\n\n## Expected Impact\n\nLocal`;

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-spec-gates-'));
  roots.push(root);
  return root;
}

async function writeSpec(root: string, specId: 'SP-001' | 'SP-002', content: string): Promise<void> {
  const path = join(specDirectory(root, 'DLV-001', specId), 'spec.md');
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const delivery: DeliveryMetadata = {
  id: 'DLV-001',
  title: 'Student records',
  type: 'APPLICATION_INIT',
  state: 'SPEC',
  approvals: {},
  specs: [
    { id: 'SP-001', title: 'Records', state: 'READY', dependencies: [], acceptanceCriteria: ['AC-001', 'AC-002'] },
    { id: 'SP-002', title: 'Validation', state: 'READY', dependencies: [], acceptanceCriteria: ['AC-001', 'AC-002'] },
  ],
};

describe('Spec Gates', () => {
  it('rejects cyclic Spec Pack dependencies', async () => {
    const root = await createRoot();
    await writeSpec(root, 'SP-001', requiredSpec('- SP-002'));
    await writeSpec(root, 'SP-002', requiredSpec('- SP-001'));

    const result = await evaluateSpecGate({ delivery, artifacts: new ArtifactStore(root) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected Spec Gate to be blocked');
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'SPEC_DEPENDENCY_CYCLE' }));
  });

  it('rejects a Plan that omits an acceptance criterion', async () => {
    const root = await createRoot();
    await writeSpec(root, 'SP-001', requiredSpec('None'));
    const planPath = join(specDirectory(root, 'DLV-001', 'SP-001'), 'plan.md');
    await writeFile(planPath, '# Plan\n\n### Task 1: Create record\n\nCovers AC-001\n\nVerification: unit test');

    const result = await evaluatePlanGate({ delivery, specId: 'SP-001', artifacts: new ArtifactStore(root) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected Plan Gate to be blocked');
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'PLAN_AC_UNCOVERED' }));
  });
});
