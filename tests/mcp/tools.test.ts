import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createToolHandlers } from '../../src/mcp/tools.js';
import { createSddService } from '../../src/workflow/service.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-mcp-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Team SDD MCP Tool adapters', () => {
  it('returns a successful status envelope from an explicit repository root', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });

    await expect(createToolHandlers().sdd_status({ root, deliveryId: 'DLV-001' })).resolves.toMatchObject({
      ok: true,
      data: { delivery: { id: 'DLV-001' } },
    });
  });

  it('returns Gate blockers as a normal Artifact submission result', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });

    await expect(createToolHandlers().sdd_submit_artifact({ root, deliveryId: 'DLV-001', kind: 'requirement' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'REQUIREMENT_ARTIFACT_MISSING' })]),
    });
  });

  it('returns the same resolved Skill runtime from next without executing an Agent', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });

    await expect(createToolHandlers().sdd_next({ root, deliveryId: 'DLV-001' })).resolves.toMatchObject({
      ok: true,
      data: { skillRuntime: { provider: 'team-sdd', skills: ['requirement'], adapter: 'prompt' } },
    });
  });

  it('exposes a non-mutating Design assessment separately from a human decision', async () => {
    const root = await createRoot();
    await createSddService({ root }).createDelivery({ id: 'DLV-001', title: 'Records API', type: 'FEATURE_CHANGE' });

    await expect(createToolHandlers().sdd_assess_design({
      root, deliveryId: 'DLV-001', impacts: ['public_api_change'], reason: 'Adds endpoint',
    })).resolves.toMatchObject({ ok: true, data: { recommendation: 'RECOMMENDED' } });
  });

  it('normalizes invalid roots as structured input errors', async () => {
    await expect(createToolHandlers().sdd_status({ root: 'relative', deliveryId: 'DLV-001' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_TOOL_INPUT' },
    });
  });
});
