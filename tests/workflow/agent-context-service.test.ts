import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultCapabilities } from '../../src/runtime/capabilities.js';
import { createAgentContextService } from '../../src/workflow/agent-context-service.js';
import { createSddService } from '../../src/workflow/service.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-agent-service-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Context service', () => {
  it('returns Requirement context without modifying Delivery state', async () => {
    const service = createSddService({ root: await createRoot() });
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
    const contextService = createAgentContextService(service);

    const context = await contextService.getContext({ deliveryId: 'DLV-001', capabilities: defaultCapabilities });

    expect(context).toMatchObject({ activity: 'REQUIREMENT', logicalSkill: 'requirement-analysis', execution: 'inline' });
    await expect(service.getStatus({ deliveryId: 'DLV-001' })).resolves.toMatchObject({ delivery: { state: 'REQUIREMENT' } });
  });
});
