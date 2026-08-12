import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createSddService } from '../../src/workflow/service.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-mcp-server-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Team SDD stdio MCP server', () => {
  it('lists Team SDD tools and returns a JSON status result over stdio', async () => {
    const root = await createRoot();
    await createSddService({ root }).createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });

    const client = new Client({ name: 'team-sdd-test-client', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve('dist/mcp-server.js')],
      stderr: 'pipe',
    });

    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map(({ name }) => name)).toEqual(expect.arrayContaining([
        'sdd_new', 'sdd_status', 'sdd_next', 'sdd_verify', 'sdd_approve', 'sdd_submit_artifact', 'sdd_get_context',
      ]));

      const result = await client.callTool({ name: 'sdd_status', arguments: { root, deliveryId: 'DLV-001' } });
      const content = (result as { content: Array<{ type: string; text?: string }> }).content;
      const text = content.find((item) => item.type === 'text');
      expect(text).toBeDefined();
      expect(JSON.parse(text?.text ?? '{}')).toMatchObject({
        ok: true,
        data: { delivery: { id: 'DLV-001' } },
      });
    } finally {
      await transport.close();
    }
  });
});
