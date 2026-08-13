import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installCurrentPackage, type RunProcess } from '../../src/agents/npm-project-installer.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-npm-installer-'));
  roots.push(root);
  return root;
}

function capture(calls: unknown[]): RunProcess {
  return async (file, args, options) => { calls.push([file, [...args], options]); };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('project npm installation', () => {
  it('installs the exact package only in a Node project', async () => {
    const root = await createRoot();
    const calls: unknown[] = [];
    await writeFile(join(root, 'package.json'), '{}');

    await installCurrentPackage({ root, packageName: '@zbp/sdd', version: '0.1.0', runProcess: capture(calls) });

    expect(calls).toEqual([
      ['npm', ['install', '--save-dev', '--save-exact', '@zbp/sdd@0.1.0'], { cwd: root }],
    ]);
  });

  it('refuses to install when the project package manifest is missing', async () => {
    await expect(installCurrentPackage({
      root: await createRoot(), packageName: '@zbp/sdd', version: '0.1.0', runProcess: capture([]),
    })).rejects.toMatchObject({ code: 'NPM_PROJECT_PACKAGE_MISSING' });
  });
});
