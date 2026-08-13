import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-cli-bin-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('sdd npm binary', () => {
  it('runs init when invoked through an npm-style bin symlink', async () => {
    const root = await createRoot();
    const binary = join(root, 'sdd');
    await symlink(resolve('dist/cli.js'), binary);

    const { stdout } = await execFileAsync(process.execPath, [binary, 'init'], { cwd: root });

    expect(stdout).toContain('Initialized Team SDD repository.');
  });
});
