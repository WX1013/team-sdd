import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { designPath, requirementPath, specDirectory } from '../../src/artifacts/artifact-store.js';
import { createSddService } from '../../src/workflow/service.js';

const roots: string[] = [];
const validSpec = '# Spec\n\n## Goal\n\nRecords\n\n## Requirement Sources\n\nBaseline\n\n## Scope\n\nRecords\n\n## Out of Scope\n\nNone\n\n## Acceptance Criteria\n\n- AC-001 Create record\n\n## Dependencies\n\nNone\n\n## Constraints\n\nNone\n\n## Expected Impact\n\nLocal';
const validDesign = '# Design\n\n## System Boundary\n\nLocal service\n\n## Overall Architecture\n\nSingle module\n\n## Module Design\n\nWorkflow service\n\n## Data Model\n\nDelivery metadata\n\n## API\n\nCLI\n\n## Core Flow\n\nApproved submissions\n\n## Permissions\n\nHuman approvals\n\n## Error Handling\n\nStructured findings\n\n## Performance\n\nLocal files\n\n## Security\n\nValidated paths\n\n## Observability\n\nEvent log\n\n## Deployment\n\nPackage install\n\n## Compatibility / Migration\n\nNone\n\n## Test Strategy\n\nIntegration tests\n\n## Technical Risks\n\nArtifact drift\n\n## Requirement Coverage\n\nNo stable requirement identifiers are present.';
const validPlan = '# Plan\n\n### Task 1: Create record\n\nCovers AC-001\n\n#### Test\n\n- [ ] unit test\n\n#### Implementation\n\n- [ ] create record\n\n#### Verification\n\n- [ ] npm test';
const validCheck = '# Check\n\n## Automated Verification\n\nTests PASS\nBuild PASS\n\n## Acceptance Criteria\n\n- AC-001 PASS\n\n## Code Review\n\nCritical Issues: 0\nImportant Issues: 0\n\n## Fresh Verification Evidence\n\n- npm test · PASS';

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-execution-'));
  roots.push(root);
  return root;
}

async function setupExecution(service: ReturnType<typeof createSddService>, root: string): Promise<void> {
  await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'FEATURE_CHANGE', design: { required: false, reason: 'Small change' } });
  const requirement = requirementPath(root, 'DLV-001');
  await mkdir(join(requirement, '..'), { recursive: true });
  await writeFile(requirement, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords\n\n## Baseline\n\nApproved');
  await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });
  await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'requirement' });
  await service.createSpecPack({ deliveryId: 'DLV-001', id: 'SP-001', title: 'Records', acceptanceCriteria: ['AC-001'] });
  const directory = specDirectory(root, 'DLV-001', 'SP-001');
  await writeFile(join(directory, 'spec.md'), validSpec);
  await service.approve({ deliveryId: 'DLV-001', artifact: 'spec', approvedBy: 'wangxin' });
  await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'spec', specId: 'SP-001' });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Spec execution submission', () => {
  it('moves a planned Spec Pack through CODE and DONE then enters Delivery CHECK', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await setupExecution(service, root);
    const directory = specDirectory(root, 'DLV-001', 'SP-001');
    await writeFile(join(directory, 'plan.md'), validPlan);

    await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'plan', specId: 'SP-001' })).resolves.toMatchObject({ advanced: true, specState: 'CODE' });
    await writeFile(join(directory, 'check.md'), validCheck);
    await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'check', specId: 'SP-001', evidence: { tests: ['unit'], build: 'npm run build', staticChecks: ['npm run typecheck'] } })).resolves.toMatchObject({ advanced: true, specState: 'DONE', deliveryState: 'CHECK' });

    await writeFile(join(root, 'sdd/deliveries/DLV-001/check.md'), '# Delivery Check\n\nRequirement Coverage: 100%');
    await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'check', evidence: { integration: ['integration'], regression: ['regression'], deliveryAcceptance: ['acceptance'] } })).resolves.toMatchObject({ advanced: true, deliveryState: 'DONE' });
  });

  it('returns a failed Spec Check from CODE to CODE with actionable evidence findings', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await setupExecution(service, root);
    const directory = specDirectory(root, 'DLV-001', 'SP-001');
    await writeFile(join(directory, 'plan.md'), validPlan);
    await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'plan', specId: 'SP-001' });
    await writeFile(join(directory, 'check.md'), validCheck);

    await expect(service.submitArtifact({ deliveryId: 'DLV-001', kind: 'check', specId: 'SP-001', evidence: { tests: [], build: '', staticChecks: [] } })).resolves.toMatchObject({
      accepted: false,
      advanced: false,
      specState: 'CODE',
      findings: expect.arrayContaining([expect.objectContaining({ code: 'CHECK_TEST_EVIDENCE_MISSING' })]),
    });

    const failedCheck = (await service.events({ deliveryId: 'DLV-001' })).filter((event) => event.type === 'check.failed').at(-1);
    expect(failedCheck).toMatchObject({ type: 'check.failed', metadata: { specId: 'SP-001' } });
    expect(failedCheck?.metadata).not.toHaveProperty('previousState');
    expect(failedCheck?.metadata).not.toHaveProperty('nextState');
  });

  it('keeps a completed Delivery event history auditable after successful Spec and Delivery Checks', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.init();
    await writeFile(join(root, 'package.json'), JSON.stringify({
      scripts: {
        test: 'node -e "process.exit(0)"',
        typecheck: 'node -e "process.exit(0)"',
        build: 'node -e "process.exit(0)"',
      },
    }));

    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
    const requirement = requirementPath(root, 'DLV-001');
    await mkdir(join(requirement, '..'), { recursive: true });
    await writeFile(requirement, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords\n\n## Baseline\n\nApproved');
    await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });
    await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'requirement' });
    await writeFile(designPath(root, 'DLV-001'), validDesign);
    await service.approve({ deliveryId: 'DLV-001', artifact: 'design', approvedBy: 'wangxin' });
    await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'design' });
    await service.createSpecPack({ deliveryId: 'DLV-001', id: 'SP-001', title: 'Records', acceptanceCriteria: ['AC-001'] });
    const directory = specDirectory(root, 'DLV-001', 'SP-001');
    await writeFile(join(directory, 'spec.md'), validSpec);
    await service.approve({ deliveryId: 'DLV-001', artifact: 'spec', approvedBy: 'wangxin' });
    await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'spec', specId: 'SP-001' });
    await writeFile(join(directory, 'plan.md'), validPlan);
    await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'plan', specId: 'SP-001' });
    await writeFile(join(directory, 'check.md'), validCheck);
    await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'check', specId: 'SP-001', evidence: { tests: ['unit'], build: 'npm run build', staticChecks: ['npm run typecheck'] } });
    await writeFile(join(root, 'sdd/deliveries/DLV-001/check.md'), '# Delivery Check\n\nRequirement Coverage: 100%');
    await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'check', evidence: { integration: ['integration'], regression: ['regression'], deliveryAcceptance: ['acceptance'] } });

    const events = await service.events({ deliveryId: 'DLV-001' });
    const successfulSpecTransitions = events.filter((event) => event.type === 'spec.transitioned' && event.metadata?.specId === 'SP-001' && ['CODE', 'CHECK'].includes(String(event.metadata?.previousState)));
    expect(successfulSpecTransitions.map((event) => event.metadata)).toEqual([
      { specId: 'SP-001', previousState: 'CODE', nextState: 'CHECK' },
      { specId: 'SP-001', previousState: 'CHECK', nextState: 'DONE' },
    ]);
    const specDoneIndex = events.findIndex((event) => event.type === 'spec.transitioned' && event.metadata?.specId === 'SP-001' && event.metadata?.nextState === 'DONE');
    const deliveryCheckIndex = events.findIndex((event) => event.type === 'delivery.transitioned' && event.previousState === 'EXECUTION' && event.nextState === 'CHECK');
    expect(deliveryCheckIndex).toBeGreaterThan(specDoneIndex);
    await expect(service.verifyRepository({ mode: 'ci' })).resolves.toEqual({ ok: true, findings: [] });
  });
});
