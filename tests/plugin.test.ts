import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Team SDD Codex Plugin', () => {
  it('ships a Plugin MCP configuration pointing at the built stdio server', async () => {
    const config = JSON.parse(await readFile('plugins/team-sdd/.mcp.json', 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };

    expect(config.mcpServers['team-sdd']).toMatchObject({ command: 'node' });
    expect(config.mcpServers['team-sdd'].args.some((argument) => argument.endsWith('dist/mcp-server.js'))).toBe(true);
  });
});
