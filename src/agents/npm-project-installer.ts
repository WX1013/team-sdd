import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { DomainError } from '../domain/errors.js';

const execFileAsync = promisify(execFile);

export type RunProcess = (file: string, args: readonly string[], options: { cwd: string }) => Promise<void>;

export const runProcess: RunProcess = async (file, args, options) => {
  await execFileAsync(file, [...args], options);
};

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const metadata = await lstat(path);
    return metadata.isFile() && !metadata.isSymbolicLink();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function installCurrentPackage(input: {
  root: string;
  packageName: string;
  version: string;
  runProcess?: RunProcess;
}): Promise<void> {
  if (!await isRegularFile(`${input.root}/package.json`)) {
    throw new DomainError('NPM_PROJECT_PACKAGE_MISSING', 'Project package.json must exist as a regular file before --install can run.');
  }
  try {
    await (input.runProcess ?? runProcess)(
      'npm',
      ['install', '--save-dev', '--save-exact', `${input.packageName}@${input.version}`],
      { cwd: input.root },
    );
  } catch (error) {
    throw new DomainError('PROJECT_NPM_INSTALL_FAILED', `Unable to install ${input.packageName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
