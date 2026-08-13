import { appendFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectAgentInstaller, parseAgentSelection } from '../../src/agents/index.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-agent-installer-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('project Agent installer', () => {
  it('parses all, a single Agent, and an ordered comma-separated subset', () => {
    expect(parseAgentSelection('all')).toEqual(['claude', 'codex', 'codebuddy']);
    expect(parseAgentSelection('codex,codebuddy')).toEqual(['codex', 'codebuddy']);
    expect(() => parseAgentSelection('claude,unknown')).toThrow('Unknown Agent');
    expect(() => parseAgentSelection('all,claude')).toThrow('all cannot be combined');
  });

  it('installs selected files and merges team-sdd without losing an existing MCP server', async () => {
    const root = await createRoot();
    await writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { existing: { command: 'keep' } } }));
    const installer = createProjectAgentInstaller();

    const result = await installer.sync({ root, agents: ['claude', 'codebuddy'] });
    const mcp = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'));

    expect(result.installed).toContain('.claude/commands/sdd/new.md');
    expect(result.installed).toContain('.codebuddy/commands/sdd/new.md');
    expect(mcp.mcpServers).toMatchObject({
      existing: { command: 'keep' },
      'team-sdd': {
        type: 'stdio',
        command: 'node',
        args: ['node_modules/@zbp/sdd/dist/mcp-server.js'],
      },
    });
  });

  it('is idempotent but rejects a user change to a formerly managed command', async () => {
    const root = await createRoot();
    const installer = createProjectAgentInstaller();
    await installer.sync({ root, agents: ['claude'] });

    await expect(installer.sync({ root, agents: ['claude'] })).resolves.toMatchObject({
      unchanged: expect.arrayContaining(['.claude/commands/sdd/new.md']),
    });

    await appendFile(join(root, '.claude/commands/sdd/new.md'), '\nuser edit');
    await expect(installer.sync({ root, agents: ['claude'] })).rejects.toMatchObject({ code: 'AGENT_FILE_CONFLICT' });
  });

  it('rejects symlinked managed paths and a conflicting team-sdd MCP entry', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    const installer = createProjectAgentInstaller();
    await symlink(outside, join(root, '.claude'));

    await expect(installer.sync({ root, agents: ['claude'] })).rejects.toMatchObject({ code: 'AGENT_PATH_UNSAFE' });
    await writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { 'team-sdd': { command: 'other' } } }));
    await expect(installer.sync({ root, agents: ['codebuddy'] })).rejects.toMatchObject({ code: 'MCP_SERVER_CONFLICT' });
  });

  it('adds the Codex plugin without replacing an existing marketplace entry', async () => {
    const root = await createRoot();
    const installer = createProjectAgentInstaller();
    const result = await installer.sync({ root, agents: ['codex'] });
    const marketplace = JSON.parse(await readFile(join(root, '.agents/plugins/marketplace.json'), 'utf8'));

    expect(result.installed).toContain('.agents/plugins/team-sdd/.codex-plugin/plugin.json');
    expect(marketplace.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'team-sdd', source: './plugins/team-sdd' }),
    ]));
  });
});
