import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
  it('preserves an existing Node project manifest while installing the exact package', async () => {
    const root = await createRoot();
    const calls: unknown[] = [];
    const manifest = '{"name":"backend"}\n';
    await writeFile(join(root, 'package.json'), manifest);

    await installCurrentPackage({ root, packageName: '@zbp/sdd', version: '0.1.2', runProcess: capture(calls) });

    await expect(readFile(join(root, 'package.json'), 'utf8')).resolves.toBe(manifest);
    expect(calls).toEqual([
      ['npm', ['install', '--save-dev', '--save-exact', '@zbp/sdd@0.1.2'], { cwd: root }],
    ]);
  });

  it('creates a minimal private package manifest before installing in a non-Node project', async () => {
    const root = await createRoot();
    const calls: unknown[] = [];

    await installCurrentPackage({ root, packageName: '@zbp/sdd', version: '0.1.2', runProcess: capture(calls) });

    await expect(readFile(join(root, 'package.json'), 'utf8')).resolves.toBe('{\n  "private": true\n}\n');
    expect(calls).toEqual([
      ['npm', ['install', '--save-dev', '--save-exact', '@zbp/sdd@0.1.2'], { cwd: root }],
    ]);
  });

  it('refuses unsafe package manifest paths without invoking npm', async () => {
    const root = await createRoot();
    const calls: unknown[] = [];
    await writeFile(join(root, 'target.json'), '{}');
    await symlink(join(root, 'target.json'), join(root, 'package.json'));

    await expect(installCurrentPackage({
      root, packageName: '@zbp/sdd', version: '0.1.2', runProcess: capture(calls),
    })).rejects.toMatchObject({ code: 'NPM_PROJECT_PACKAGE_MISSING' });
    expect(calls).toEqual([]);
    await expect(lstat(join(root, 'package.json'))).resolves.toMatchObject({ isSymbolicLink: expect.any(Function) });
  });
});
