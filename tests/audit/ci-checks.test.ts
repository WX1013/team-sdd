import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSddService } from '../../src/workflow/service.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-ci-checks-'));
  roots.push(root);
  return root;
}

async function writePackage(root: string, scripts: Record<string, string>): Promise<void> {
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'ci-fixture', private: true, scripts }, null, 2));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CI trust checks', () => {
  it('runs only the fixed npm test, typecheck, and build commands after a clean audit', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.init();
    await writePackage(root, {
      test: "node -e \"require('node:fs').appendFileSync('checks.log', 'test\\n')\"",
      typecheck: "node -e \"require('node:fs').appendFileSync('checks.log', 'typecheck\\n')\"",
      build: "node -e \"require('node:fs').appendFileSync('checks.log', 'build\\n')\"",
    });

    await expect(service.verifyRepository({ mode: 'ci' })).resolves.toEqual({ ok: true, findings: [] });
    await expect(readFile(join(root, 'checks.log'), 'utf8')).resolves.toBe('test\ntypecheck\nbuild\n');
  });

  it('converts a failing fixed CI command into a structured finding with command output', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.init();
    await writePackage(root, {
      test: "node -e \"console.error('test sentinel'); process.exit(7)\"",
      typecheck: 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
    });

    await expect(service.verifyRepository({ mode: 'ci' })).resolves.toMatchObject({
      ok: false,
      findings: expect.arrayContaining([expect.objectContaining({
        code: 'CI_CHECK_FAILED',
        message: expect.stringContaining('npm test'),
      })]),
    });
  });

  it('does not run CI commands when repository audit findings already block CI', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.init();
    await service.createDelivery({ id: 'DLV-001', title: 'Records', type: 'APPLICATION_INIT' });
    await writePackage(root, {
      test: "node -e \"require('node:fs').writeFileSync('should-not-run', 'test')\"",
      typecheck: "node -e \"require('node:fs').writeFileSync('should-not-run', 'typecheck')\"",
      build: "node -e \"require('node:fs').writeFileSync('should-not-run', 'build')\"",
    });

    await expect(service.verifyRepository({ mode: 'ci' })).resolves.toMatchObject({ ok: false });
    await expect(access(join(root, 'should-not-run'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not run project commands in Hook mode', async () => {
    const root = await createRoot();
    const service = createSddService({ root });
    await service.init();
    await writePackage(root, {
      test: "node -e \"require('node:fs').writeFileSync('hook-ran', 'test')\"",
      typecheck: "node -e \"require('node:fs').writeFileSync('hook-ran', 'typecheck')\"",
      build: "node -e \"require('node:fs').writeFileSync('hook-ran', 'build')\"",
    });

    await expect(service.verifyRepository({ mode: 'hook' })).resolves.toEqual({ ok: true, findings: [] });
    await expect(access(join(root, 'hook-ran'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
