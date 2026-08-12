import { execFile } from 'node:child_process';
import { appendFile, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

type GitResult = { exitCode: number; stdout: string; stderr: string };

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-hook-e2e-'));
  roots.push(root);
  return root;
}

async function prepareBuiltSddDependency(root: string): Promise<void> {
  const binaryDirectory = join(root, 'node_modules', '.bin');
  const binaryPath = join(binaryDirectory, 'sdd');
  const cliPath = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
  await mkdir(binaryDirectory, { recursive: true });
  await writeFile(binaryPath, [
    '#!/usr/bin/env node',
    "import { spawnSync } from 'node:child_process';",
    `const result = spawnSync(process.execPath, [${JSON.stringify(cliPath)}, ...process.argv.slice(2)], { stdio: 'inherit' });`,
    "if (result.error) throw result.error;",
    "process.exitCode = result.status ?? 1;",
    '',
  ].join('\n'));
  await chmod(binaryPath, 0o755);
}

async function runGit(root: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd: root });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return {
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Git Hook protocol', () => {
  it('rejects a commit when Hook verification finds an invalid event log', async () => {
    const root = await createRoot();
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', '--local', 'user.name', 'Team SDD Test'], { cwd: root });
    await execFileAsync('git', ['config', '--local', 'user.email', 'team-sdd-test@example.invalid'], { cwd: root });
    await prepareBuiltSddDependency(root);
    expect((await runCli(['init'], root)).exitCode).toBe(0);
    expect((await runCli(['new', 'DLV-001', '--title', 'Student records', '--type', 'APPLICATION_INIT'], root)).exitCode).toBe(0);
    await appendFile(join(root, '.sdd/events/DLV-001.jsonl'), 'not-json\n');

    const attempt = await runGit(root, ['commit', '--allow-empty', '-m', 'invalid']);

    expect(attempt.exitCode).not.toBe(0);
    expect(`${attempt.stdout}\n${attempt.stderr}`).toContain('EVENT_LOG_INVALID');
  });
});
