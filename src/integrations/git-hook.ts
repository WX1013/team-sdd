import { execFile } from 'node:child_process';
import { chmod, lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { AuditFinding, AuditResult } from '../audit/types.js';
import { DomainError } from '../domain/errors.js';

const execFileAsync = promisify(execFile);

export const gitHookContract = '#!/usr/bin/env sh\nset -eu\nexec npx --no-install sdd verify --hook\n';

function finding(code: string, message: string, artifact: string, nextStep: string): AuditFinding {
  return { code, message, artifact, nextStep };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | number | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: string | number }).code
    : undefined;
}

async function assertGitProjectRoot(root: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: root });
    const [projectRoot, gitRoot] = await Promise.all([realpath(root), realpath(stdout.trim())]);
    if (projectRoot !== gitRoot) {
      throw new DomainError('GIT_PROJECT_ROOT_REQUIRED', `Team SDD project root ${projectRoot} must equal Git root ${gitRoot}`);
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (errorCode(error) === 'ENOENT') {
      throw new DomainError('GIT_UNAVAILABLE', `Git is not available: ${errorMessage(error)}`);
    }
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr)
      : '';
    if (stderr.includes('not a git repository')) {
      throw new DomainError('GIT_REPOSITORY_REQUIRED', `Not a Git working tree: ${root}`);
    }
    throw new DomainError('GIT_UNAVAILABLE', `Unable to use Git in ${root}: ${errorMessage(error)}`);
  }
}

async function assertGitHookPathSafe(root: string): Promise<void> {
  const directory = join(root, '.githooks');
  const hookPath = join(directory, 'pre-commit');
  let directoryMetadata;
  try {
    directoryMetadata = await lstat(directory);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new DomainError('GIT_HOOK_PATH_UNSAFE', `Git Hook directory must be a real directory: ${directory}`);
  }

  try {
    const hookMetadata = await lstat(hookPath);
    if (hookMetadata.isSymbolicLink() || !hookMetadata.isFile()) {
      throw new DomainError('GIT_HOOK_PATH_UNSAFE', `Git Hook must be a real file: ${hookPath}`);
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }
}

async function existingEffectiveHookPath(root: string): Promise<string | undefined> {
  let configuredPath: string | undefined;
  try {
    configuredPath = (await execFileAsync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: root })).stdout.trim();
  } catch (error) {
    if (errorCode(error) !== 1) throw error;
  }
  const hooksDirectory = configuredPath ? resolve(root, configuredPath) : join(root, '.git', 'hooks');
  if (hooksDirectory === resolve(root, '.githooks')) return undefined;
  const hookPath = join(hooksDirectory, 'pre-commit');
  try {
    await lstat(hookPath);
    return hookPath;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
}

async function assertExistingEffectiveHookPreserved(root: string): Promise<void> {
  const hookPath = await existingEffectiveHookPath(root);
  if (hookPath) {
    throw new DomainError('GIT_HOOK_CONFLICT', `Existing effective pre-commit Hook would be disabled: ${hookPath}`);
  }
}

export async function installGitHook(root: string): Promise<void> {
  await assertGitProjectRoot(root);
  await assertGitHookPathSafe(root);
  await assertExistingEffectiveHookPreserved(root);
  const directory = join(root, '.githooks');
  const hookPath = join(directory, 'pre-commit');
  try {
    const content = await readFile(hookPath, 'utf8');
    if (content !== gitHookContract) {
      throw new DomainError('GIT_HOOK_CONFLICT', `Existing pre-commit Hook is not owned by Team SDD: ${hookPath}`);
    }
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  await mkdir(directory, { recursive: true, mode: 0o755 });
  await chmod(directory, 0o755);
  await writeFile(hookPath, gitHookContract, { encoding: 'utf8', mode: 0o755 });
  await chmod(hookPath, 0o755);
  try {
    await execFileAsync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { cwd: root });
  } catch (error) {
    throw new DomainError('GIT_CONFIG_FAILED', `Unable to configure the local Git Hook path: ${errorMessage(error)}`);
  }
}

export async function inspectGitHook(root: string): Promise<AuditResult> {
  try {
    await assertGitProjectRoot(root);
    await assertGitHookPathSafe(root);
  } catch (error) {
    const domainError = error instanceof DomainError
      ? error
      : new DomainError('GIT_UNAVAILABLE', errorMessage(error));
    return {
      ok: false,
      findings: [finding(
        domainError.code,
        domainError.message,
        '.git',
        domainError.code === 'GIT_REPOSITORY_REQUIRED'
          ? 'Initialize Git before installing the Team SDD Hook.'
          : domainError.code === 'GIT_PROJECT_ROOT_REQUIRED'
            ? 'Run Team SDD from the Git repository root.'
            : domainError.code === 'GIT_HOOK_PATH_UNSAFE'
              ? 'Replace the unsafe Hook path with repository-owned files and directories.'
              : 'Install or repair Git, then rerun Team SDD diagnostics.',
      )],
    };
  }

  const findings: AuditFinding[] = [];
  try {
    const effectiveHookPath = await existingEffectiveHookPath(root);
    if (effectiveHookPath) {
      findings.push(finding(
        'GIT_HOOK_CONFLICT',
        `Existing effective pre-commit Hook would be disabled: ${effectiveHookPath}`,
        effectiveHookPath,
        'Keep the existing Hook or manually replace it with the Team SDD Hook contract.',
      ));
    }
  } catch (error) {
    findings.push(finding(
      'GIT_CONFIG_UNREADABLE',
      `Unable to inspect the effective Git Hook path: ${errorMessage(error)}`,
      '.git/config',
      'Restore the local Git configuration and rerun Team SDD diagnostics.',
    ));
  }
  const hookPath = join(root, '.githooks', 'pre-commit');
  try {
    const [content, metadata] = await Promise.all([readFile(hookPath, 'utf8'), stat(hookPath)]);
    if (content !== gitHookContract) {
      findings.push(finding(
        'GIT_HOOK_CONFLICT',
        'The existing pre-commit Hook is not owned by Team SDD and will not be replaced automatically.',
        '.githooks/pre-commit',
        'Keep the custom Hook or replace it manually with the Team SDD Hook contract.',
      ));
    } else if ((metadata.mode & 0o777) !== 0o755) {
      findings.push(finding(
        'GIT_HOOK_INVALID',
        'The Team SDD pre-commit Hook is not executable with mode 0755.',
        '.githooks/pre-commit',
        'Run doctor with fix enabled to reinstall the Team SDD Hook.',
      ));
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      findings.push(finding(
        'GIT_HOOK_MISSING',
        'The Team SDD pre-commit Hook is missing.',
        '.githooks/pre-commit',
        'Run doctor with fix enabled to install the Team SDD Hook.',
      ));
    } else {
      findings.push(finding(
        'GIT_HOOK_UNREADABLE',
        `Unable to inspect the Team SDD pre-commit Hook: ${errorMessage(error)}`,
        '.githooks/pre-commit',
        'Restore read access and rerun Team SDD diagnostics.',
      ));
    }
  }

  let hooksPath: string | undefined;
  try {
    hooksPath = (await execFileAsync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: root })).stdout.trim();
  } catch (error) {
    if (errorCode(error) !== 1) {
      findings.push(finding(
        'GIT_CONFIG_UNREADABLE',
        `Unable to inspect the local Git Hook path: ${errorMessage(error)}`,
        '.git/config',
        'Restore the local Git configuration and rerun Team SDD diagnostics.',
      ));
    }
  }
  if (hooksPath !== '.githooks') {
    findings.push(finding(
      'GIT_HOOKS_PATH_INVALID',
      'The local Git core.hooksPath is not configured for Team SDD.',
      '.git/config',
      'Run doctor with fix enabled to configure core.hooksPath as .githooks.',
    ));
  }

  return findings.length === 0 ? { ok: true, findings: [] } : { ok: false, findings };
}
