import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { requirementPath } from '../src/artifacts/artifact-store.js';
import { createSddService } from '../src/workflow/service.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-cli-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('sdd CLI', () => {
  it('creates and reports a Delivery through the CLI', async () => {
    const root = await createRoot();
    const created = await runCli(['new', 'DLV-001', '--title', 'Student records', '--type', 'APPLICATION_INIT'], root);
    const status = await runCli(['status', 'DLV-001'], root);

    expect(created.exitCode).toBe(0);
    expect(status.stdout).toContain('DLV-001 · Student records');
    expect(status.stdout).toContain('Requirement');
  });

  it('returns an actionable Gate finding for a blocked verification', async () => {
    const root = await createRoot();
    await runCli(['new', 'DLV-001', '--title', 'Student records', '--type', 'APPLICATION_INIT'], root);
    const path = join(root, 'sdd/deliveries/DLV-001/requirement.md');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords');

    const result = await runCli(['verify', 'DLV-001'], root);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Requirement baseline is missing');
  });

  it('creates a Spec Pack and returns Gate findings through CLI submission', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'FEATURE_CHANGE', design: { required: false, reason: 'Small change' } });
    const path = requirementPath(root, 'DLV-001');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '# Requirement\n\n## Source\n\nPRD\n\n## Scope\n\nRecords\n\n## Baseline\n\nApproved');
    await service.approve({ deliveryId: 'DLV-001', artifact: 'requirement', approvedBy: 'wangxin' });
    await service.submitArtifact({ deliveryId: 'DLV-001', kind: 'requirement' });

    const created = await runCli(['spec', 'create', 'DLV-001', 'SP-001', '--title', 'Records'], root);
    const submitted = await runCli(['submit', 'DLV-001', 'plan', '--spec', 'SP-001'], root);

    expect(created.exitCode).toBe(0);
    expect(submitted.exitCode).toBe(2);
    expect(submitted.stderr).toContain('Plan artifact is missing');
  });

  it('prints machine-readable Agent Context for a Codex-capable runtime', async () => {
    const root = await createRoot();
    await runCli(['new', 'DLV-001', '--title', 'Records', '--type', 'APPLICATION_INIT'], root);

    const result = await runCli(['agent', 'context', 'DLV-001', '--json', '--subagents', '--skills', '--worktrees', '--mcp'], root);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ execution: 'subagent', logicalSkill: 'requirement-analysis' });
  });

  it('explains a disabled file-write capability in prompt output', async () => {
    const root = await createRoot();
    await runCli(['new', 'DLV-001', '--title', 'Records', '--type', 'APPLICATION_INIT'], root);

    const result = await runCli(['agent', 'context', 'DLV-001', '--no-file-write'], root);

    expect(result.stdout).toContain('## Capability gaps\n- fileWrite');
  });

  it('prints the resolved non-mutating Skill runtime from next', async () => {
    const root = await createRoot();
    await runCli(['new', 'DLV-001', '--title', 'Records', '--type', 'APPLICATION_INIT'], root);

    const result = await runCli(['next', 'DLV-001'], root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Provider: team-sdd');
    expect(result.stdout).toContain('Skills: requirement');
    expect(result.stdout).toContain('Adapter: prompt');
  });

  it('shows active Plan task progress in status without changing workflow state', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'FEATURE_CHANGE', design: { required: false, reason: 'Small' } });
    const deliveryPath = join(root, 'sdd/deliveries/DLV-001/delivery.yaml');
    await mkdir(join(deliveryPath, '..', 'specs', 'SP-001'), { recursive: true });
    await writeFile(deliveryPath, 'id: DLV-001\ntitle: Records\ntype: FEATURE_CHANGE\nstate: EXECUTION\ndesign:\n  required: false\n  reason: Small\napprovals: {}\nspecs:\n  - id: SP-001\n    title: Records\n    state: CODE\n    dependencies: []\n    acceptanceCriteria: [AC-001]\n');
    await writeFile(join(root, 'sdd/deliveries/DLV-001/specs/SP-001/plan.md'), '### Task 1: A\n- [x] Test\n\n### Task 2: B\n- [ ] Verify');

    const result = await runCli(['status', 'DLV-001'], root);

    expect(result.stdout).toContain('Plan\n────────────────────\n1 / 2 tasks');
  });

  it('keeps Design assessment separate from a human CLI decision', async () => {
    const root = await createRoot();
    await runCli(['new', 'DLV-001', '--title', 'Records', '--type', 'FEATURE_CHANGE'], root);

    const assessment = await runCli(['design', 'assess', 'DLV-001', '--impact', 'public_api_change', '--reason', 'Adds endpoint'], root);
    const decision = await runCli(['design', 'decide', 'DLV-001', '--required', 'true', '--reason', 'Human reviewed', '--by', 'reviewer'], root);

    expect(assessment.stdout).toContain('Design recommendation: RECOMMENDED');
    expect(decision.stdout).toContain('Recorded human Design decision');
    await expect(createSddService({ root }).getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ delivery: { design: { required: true } } });
  });

  it('prints a Requirement template with all writing-contract headings', async () => {
    const root = await createRoot();
    await runCli(['new', 'DLV-001', '--title', 'Records', '--type', 'APPLICATION_INIT'], root);

    const result = await runCli(['template', 'requirement', 'DLV-001'], root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('## 业务规则');
    expect(result.stdout).not.toMatch(/\b(TBD|TODO)\b/i);
  });

  it('rejects a Spec template without a Spec Pack ID', async () => {
    const root = await createRoot();
    await runCli(['new', 'DLV-001', '--title', 'Records', '--type', 'APPLICATION_INIT'], root);

    const result = await runCli(['template', 'spec', 'DLV-001'], root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('requires --spec');
  });
});
