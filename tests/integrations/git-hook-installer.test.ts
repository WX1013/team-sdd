import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectGitHook, installGitHook } from '../../src/integrations/git-hook.js';
import { defaultProjectConfig, writeProjectConfig } from '../../src/config/project-config.js';
import { createSddService } from '../../src/workflow/service.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-hook-'));
  roots.push(root);
  return root;
}

async function initGitRepository(root: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: root });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Git Hook installation', () => {
  it('writes the executable pre-commit contract and configures only the local Hook path', async () => {
    const root = await createRoot();
    await initGitRepository(root);

    await installGitHook(root);

    const hookPath = join(root, '.githooks', 'pre-commit');
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(
      '#!/usr/bin/env sh\nset -eu\nexec npx --no-install sdd verify --hook\n',
    );
    expect((await stat(hookPath)).mode & 0o777).toBe(0o755);
    await expect(execFileAsync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: root }))
      .resolves.toMatchObject({ stdout: '.githooks\n' });
    await expect(inspectGitHook(root)).resolves.toEqual({ ok: true, findings: [] });
  });

  it('returns a structured Domain Error when installation is attempted outside Git', async () => {
    const root = await createRoot();

    await expect(installGitHook(root)).rejects.toMatchObject({
      name: 'DomainError',
      code: 'GIT_REPOSITORY_REQUIRED',
    });
  });

  it('rejects a nested directory because the SDD project root must equal the Git root', async () => {
    const root = await createRoot();
    await initGitRepository(root);
    const nested = join(root, 'packages', 'student-records');
    await mkdir(nested, { recursive: true });

    await expect(installGitHook(nested)).rejects.toMatchObject({
      name: 'DomainError',
      code: 'GIT_PROJECT_ROOT_REQUIRED',
    });
    await expect(inspectGitHook(nested)).resolves.toMatchObject({
      ok: false,
      findings: [expect.objectContaining({ code: 'GIT_PROJECT_ROOT_REQUIRED' })],
    });
    await expect(readFile(join(nested, '.githooks/pre-commit'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a symlinked Hook directory without changing the outside Hook', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await initGitRepository(root);
    const outsideHook = join(outside, 'pre-commit');
    await writeFile(outsideHook, 'outside sentinel\n');
    await symlink(outside, join(root, '.githooks'));

    await expect(installGitHook(root)).rejects.toMatchObject({
      name: 'DomainError',
      code: 'GIT_HOOK_PATH_UNSAFE',
    });
    await expect(readFile(outsideHook, 'utf8')).resolves.toBe('outside sentinel\n');
    await expect(inspectGitHook(root)).resolves.toMatchObject({
      ok: false,
      findings: [expect.objectContaining({ code: 'GIT_HOOK_PATH_UNSAFE' })],
    });
    await expect(readFile(outsideHook, 'utf8')).resolves.toBe('outside sentinel\n');
  });

  it('rejects a symlinked pre-commit file without changing its outside target', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await initGitRepository(root);
    const hookDirectory = join(root, '.githooks');
    const outsideHook = join(outside, 'external-pre-commit');
    await mkdir(hookDirectory);
    await writeFile(outsideHook, 'external hook sentinel\n');
    await symlink(outsideHook, join(hookDirectory, 'pre-commit'));

    await expect(installGitHook(root)).rejects.toMatchObject({
      name: 'DomainError',
      code: 'GIT_HOOK_PATH_UNSAFE',
    });
    await expect(readFile(outsideHook, 'utf8')).resolves.toBe('external hook sentinel\n');
    await expect(inspectGitHook(root)).resolves.toMatchObject({
      ok: false,
      findings: [expect.objectContaining({ code: 'GIT_HOOK_PATH_UNSAFE' })],
    });
    await expect(readFile(outsideHook, 'utf8')).resolves.toBe('external hook sentinel\n');
  });

  it('reports a custom regular Hook as a conflict and never overwrites it during doctor fix', async () => {
    const root = await createRoot();
    await initGitRepository(root);
    await mkdir(join(root, '.githooks'));
    const hookPath = join(root, '.githooks/pre-commit');
    await writeFile(hookPath, '#!/usr/bin/env sh\necho custom hook\n');
    await writeProjectConfig(root, defaultProjectConfig);
    const before = await readFile(hookPath, 'utf8');

    await expect(inspectGitHook(root)).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'GIT_HOOK_CONFLICT' })]),
    });
    await expect(installGitHook(root)).rejects.toMatchObject({ code: 'GIT_HOOK_CONFLICT' });
    await expect(createSddService({ root }).doctor({ fix: true })).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({ code: 'GIT_HOOK_CONFLICT' })]),
    });
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(before);
  });

  it('preserves an existing effective default Git Hook instead of redirecting hooksPath', async () => {
    const root = await createRoot();
    await initGitRepository(root);
    const hookPath = join(root, '.git/hooks/pre-commit');
    await writeFile(hookPath, '#!/usr/bin/env sh\necho default custom hook\n');
    await writeProjectConfig(root, defaultProjectConfig);
    const before = await readFile(hookPath, 'utf8');

    await expect(installGitHook(root)).rejects.toMatchObject({ code: 'GIT_HOOK_CONFLICT' });
    await expect(createSddService({ root }).doctor({ fix: true })).resolves.toMatchObject({
      findings: expect.arrayContaining([expect.objectContaining({ code: 'GIT_HOOK_CONFLICT' })]),
    });
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(before);
    await expect(execFileAsync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: root }))
      .rejects.toMatchObject({ code: 1 });
  });
});
