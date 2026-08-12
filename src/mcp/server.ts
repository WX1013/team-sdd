import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  approveInputSchema,
  contextInputSchema,
  createToolHandlers,
  newInputSchema,
  nextInputSchema,
  statusInputSchema,
  submitInputSchema,
  verifyInputSchema,
} from './tools.js';

function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'team-sdd', version: '0.1.0' });
  const tools = createToolHandlers();

  server.registerTool('sdd_new', {
    title: 'Create Team SDD delivery',
    description: 'Create a new Team SDD Delivery in the explicit repository root.',
    inputSchema: newInputSchema,
  }, async (input) => jsonResult(await tools.sdd_new(input)));
  server.registerTool('sdd_status', {
    title: 'Get Team SDD status',
    description: 'Read current Delivery status from the explicit repository root.',
    inputSchema: statusInputSchema,
  }, async (input) => jsonResult(await tools.sdd_status(input)));
  server.registerTool('sdd_next', {
    title: 'Get next Team SDD activity',
    description: 'Read the next Engine-directed activity and its blockers.',
    inputSchema: nextInputSchema,
  }, async (input) => jsonResult(await tools.sdd_next(input)));
  server.registerTool('sdd_verify', {
    title: 'Verify Team SDD Gate',
    description: 'Evaluate the current Gate without mutating workflow state.',
    inputSchema: verifyInputSchema,
  }, async (input) => jsonResult(await tools.sdd_verify(input)));
  server.registerTool('sdd_approve', {
    title: 'Approve Team SDD artifact',
    description: 'Record an approval through the Team SDD Core service.',
    inputSchema: approveInputSchema,
  }, async (input) => jsonResult(await tools.sdd_approve(input)));
  server.registerTool('sdd_submit_artifact', {
    title: 'Submit Team SDD artifact',
    description: 'Submit an artifact and evidence through Core Gate evaluation.',
    inputSchema: submitInputSchema,
  }, async (input) => jsonResult(await tools.sdd_submit_artifact(input)));
  server.registerTool('sdd_get_context', {
    title: 'Get Team SDD Agent Context',
    description: 'Get Engine-governed agent instructions, paths, and blockers.',
    inputSchema: contextInputSchema,
  }, async (input) => jsonResult(await tools.sdd_get_context(input)));

  return server;
}

export async function startMcpStdioServer(): Promise<void> {
  await createMcpServer().connect(new StdioServerTransport());
}
