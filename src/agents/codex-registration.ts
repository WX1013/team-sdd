import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError } from '../domain/errors.js';
import { runProcess, type RunProcess } from './npm-project-installer.js';

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const metadata = await lstat(path);
    return metadata.isFile() && !metadata.isSymbolicLink();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function registerCodexProjectMarketplace(input: {
  root: string;
  runProcess?: RunProcess;
}): Promise<void> {
  const marketplace = join(input.root, '.agents/plugins/marketplace.json');
  const plugin = join(input.root, '.agents/plugins/team-sdd/.codex-plugin/plugin.json');
  if (!await isRegularFile(marketplace) || !await isRegularFile(plugin)) {
    throw new DomainError('CODEX_PROJECT_PLUGIN_MISSING', 'Project-local Codex marketplace and Team SDD plugin must be synchronized before registration.');
  }
  try {
    const invoke = input.runProcess ?? runProcess;
    await invoke('codex', ['plugin', 'marketplace', 'add', input.root], { cwd: input.root });
    await invoke('codex', ['plugin', 'add', 'team-sdd@team-sdd-project'], { cwd: input.root });
  } catch (error) {
    throw new DomainError('CODEX_REGISTRATION_FAILED', `Unable to register the project-local Codex plugin: ${error instanceof Error ? error.message : String(error)}`);
  }
}
