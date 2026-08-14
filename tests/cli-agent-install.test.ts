import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli, type CliDependencies } from '../src/cli.js';
import { packageManifest } from '../src/package-info.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-cli-agent-install-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function createDependencies(): { dependencies: CliDependencies; sync: ReturnType<typeof vi.fn>; install: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> } {
  const sync = vi.fn(async () => ({ installed: [], unchanged: [], warnings: [] }));
  const install = vi.fn(async () => undefined);
  const register = vi.fn(async () => undefined);
  return {
    dependencies: {
      projectAgentInstaller: { sync, inspect: vi.fn(async () => []) },
      installCurrentPackage: install,
      registerCodexProjectMarketplace: register,
      packageManifest: { name: '@zbp/sdd', version: '0.1.2' },
    },
    sync,
    install,
    register,
  };
}

describe('Agent installation CLI', () => {
  it('keeps init Core-only when no Agent option is supplied', async () => {
    const root = await createRoot();
    const { dependencies, sync } = createDependencies();

    const result = await runCli(['init'], root, dependencies);

    expect(result.exitCode).toBe(0);
    expect(sync).not.toHaveBeenCalled();
  });

  it('installs then synchronizes selected adapters and registers Codex only when explicit', async () => {
    const root = await createRoot();
    const { dependencies, sync, install, register } = createDependencies();

    const result = await runCli(['init', '--agents', 'claude,codex', '--install', '--register-codex'], root, dependencies);

    expect(result.exitCode).toBe(0);
    expect(install).toHaveBeenCalledWith(expect.objectContaining({ root, packageName: '@zbp/sdd', version: '0.1.2' }));
    expect(sync).toHaveBeenCalledWith({ root, agents: ['claude', 'codex'] });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ root }));
  });

  it.each([
    ['claude', ['claude'], false],
    ['codebuddy', ['codebuddy'], false],
    ['codex', ['codex'], true],
  ] as const)('initializes %s through its dedicated first-install command', async (agent, agents, registersCodex) => {
    const root = await createRoot();
    const { dependencies, sync, install, register } = createDependencies();
    const args = ['init', '--agents', agent, '--install', ...(registersCodex ? ['--register-codex'] : [])];

    const result = await runCli(args, root, dependencies);

    expect(result.exitCode).toBe(0);
    expect(install).toHaveBeenCalledOnce();
    expect(sync).toHaveBeenCalledWith({ root, agents });
    expect(register).toHaveBeenCalledTimes(registersCodex ? 1 : 0);
  });

  it('installs the current published package version by default', async () => {
    const root = await createRoot();
    const install = vi.fn(async () => undefined);

    const result = await runCli(['init', '--agents', 'claude', '--install'], root, {
      projectAgentInstaller: { sync: vi.fn(async () => ({ installed: [], unchanged: [], warnings: [] })), inspect: vi.fn(async () => []) },
      installCurrentPackage: install,
    });

    expect(result.exitCode).toBe(0);
    expect(install).toHaveBeenCalledWith(expect.objectContaining({ root, packageName: packageManifest.name, version: packageManifest.version }));
  });

  it('rejects invalid selection and Codex registration without Codex', async () => {
    const root = await createRoot();
    const { dependencies } = createDependencies();

    await expect(runCli(['init', '--agents', 'claude,unknown'], root, dependencies)).resolves.toMatchObject({ exitCode: 1 });
    await expect(runCli(['init', '--agents', 'claude', '--register-codex'], root, dependencies)).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining('--register-codex requires selecting codex'),
    });
  });

  it('synchronizes adapters without running npm install', async () => {
    const root = await createRoot();
    const { dependencies, sync, install } = createDependencies();

    const result = await runCli(['agents', 'sync', '--agents', 'codebuddy'], root, dependencies);

    expect(result.exitCode).toBe(0);
    expect(sync).toHaveBeenCalledWith({ root, agents: ['codebuddy'] });
    expect(install).not.toHaveBeenCalled();
  });
});
