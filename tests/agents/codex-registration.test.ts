import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCodexProjectMarketplace } from '../../src/agents/codex-registration.js';
import type { RunProcess } from '../../src/agents/npm-project-installer.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-codex-registration-'));
  roots.push(root);
  return root;
}

function capture(calls: unknown[]): RunProcess {
  return async (file, args, options) => { calls.push([file, [...args], options]); };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Codex project marketplace registration', () => {
  it('registers only the current repository marketplace and named plugin', async () => {
    const root = await createRoot();
    const calls: unknown[] = [];
    await mkdir(join(root, '.agents/plugins/team-sdd/.codex-plugin'), { recursive: true });
    await writeFile(join(root, '.agents/plugins/marketplace.json'), '{}');
    await writeFile(join(root, '.agents/plugins/team-sdd/.codex-plugin/plugin.json'), '{}');

    await registerCodexProjectMarketplace({ root, runProcess: capture(calls) });

    expect(calls).toEqual([
      ['codex', ['plugin', 'marketplace', 'add', root], { cwd: root }],
      ['codex', ['plugin', 'add', 'team-sdd@team-sdd-project'], { cwd: root }],
    ]);
  });

  it('does not invoke Codex unless the project plugin files exist', async () => {
    const calls: unknown[] = [];
    await expect(registerCodexProjectMarketplace({ root: await createRoot(), runProcess: capture(calls) }))
      .rejects.toMatchObject({ code: 'CODEX_PROJECT_PLUGIN_MISSING' });
    expect(calls).toEqual([]);
  });
});
