import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArtifactStore, requirementPath, specDirectory } from '../../src/artifacts/artifact-store.js';
import type { DeliveryMetadata } from '../../src/domain/types.js';
import { evaluateCheckGate, evaluatePlanGate, evaluateSpecGate } from '../../src/gates/specs.js';

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

  it('requires Test, Implementation, and Verification in every Plan task and completed dependencies', async () => {
    const root = await createRoot();
    await writeSpec(root, 'SP-001', requiredSpec('SP-002'));
    await writeFile(join(specDirectory(root, 'DLV-001', 'SP-001'), 'plan.md'), '# Plan\n\n### Task 1: Records\n\nCovers AC-001\n\n#### Test\n\n- [ ] test\n\n#### Verification\n\n- [ ] verify');
    const result = await evaluatePlanGate({ delivery, specId: 'SP-001', artifacts: new ArtifactStore(root) });
    expect(result).toMatchObject({ ok: false, findings: expect.arrayContaining([
      expect.objectContaining({ code: 'PLAN_TASK_IMPLEMENTATION_MISSING' }),
      expect.objectContaining({ code: 'PLAN_DEPENDENCY_NOT_DONE' }),
    ]) });
  });

  it('rejects a Spec Pack set that leaves a Requirement identifier uncovered', async () => {
    const root = await createRoot();
    const requirement = requirementPath(root, 'DLV-001');
    await mkdir(join(requirement, '..'), { recursive: true });
    await writeFile(requirement, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\n- REQ-001 Records\n- REQ-002 Search\n\n## Business Rules\n\n- BR-001 Isolate tenants\n\n## Baseline\n\nApproved');
    await writeSpec(root, 'SP-001', requiredSpec('None').replace('Requirement Baseline', 'REQ-001'));
    await writeSpec(root, 'SP-002', requiredSpec('None').replace('Requirement Baseline', 'BR-001'));

    const result = await evaluateSpecGate({ delivery, artifacts: new ArtifactStore(root) });

    expect(result).toMatchObject({ ok: false, findings: expect.arrayContaining([
      expect.objectContaining({ code: 'SPEC_REQUIREMENT_COVERAGE_MISSING', message: expect.stringContaining('REQ-002') }),
    ]) });
  });

  it('reports a missing Spec artifact without throwing while checking approval', async () => {
    const root = await createRoot();
    const deliveryWithApproval: DeliveryMetadata = {
      ...delivery,
      approvals: {
        spec: {
          artifact: 'spec',
          hash: `sha256:${'0'.repeat(64)}`,
          actorType: 'human',
          approvedBy: 'reviewer',
          approvedAt: new Date().toISOString(),
        },
      },
    };

    const result = await evaluateSpecGate({ delivery: deliveryWithApproval, artifacts: new ArtifactStore(root) });

    expect(result).toMatchObject({ ok: false, findings: expect.arrayContaining([
      expect.objectContaining({ code: 'SPEC_ARTIFACT_MISSING' }),
    ]) });
  });

  it('rejects Check evidence without each AC PASS, clean review, and fresh verification evidence', async () => {
    const root = await createRoot();
    await writeSpec(root, 'SP-001', requiredSpec('None'));
    await writeFile(join(specDirectory(root, 'DLV-001', 'SP-001'), 'check.md'), '# Check\n\n## Automated Verification\n\nTests PASS\n\n## Acceptance Criteria\n\n- AC-001 PASS\n\n## Code Review\n\nCritical Issues: 1\nImportant Issues: 0\n\n## Fresh Verification Evidence\n\n');

    const result = await evaluateCheckGate({ delivery, specId: 'SP-001', artifacts: new ArtifactStore(root) });

    expect(result).toMatchObject({ ok: false, findings: expect.arrayContaining([
      expect.objectContaining({ code: 'CHECK_AC_UNCOVERED', message: expect.stringContaining('AC-002') }),
      expect.objectContaining({ code: 'CHECK_REVIEW_NOT_CLEAN' }),
      expect.objectContaining({ code: 'CHECK_FRESH_EVIDENCE_MISSING' }),
    ]) });
  });
});
