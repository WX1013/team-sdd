import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

async function runNpmPackDryRun(): Promise<{ files: { path: string }[] }> {
  const { stdout } = await execFileAsync('npm', [
    '--cache', '/private/tmp/zbp-sdd-npm-cache', 'pack', '--dry-run', '--json',
  ]);
  return JSON.parse(stdout)[0] as { files: { path: string }[] };
}

describe('Nexus publish package', () => {
  it('declares the private Nexus package metadata', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8'));

    expect(manifest).toMatchObject({
      name: '@zbp/sdd',
      private: false,
      license: 'UNLICENSED',
      bin: { sdd: './dist/cli.js' },
      publishConfig: { registry: 'https://nexus.zyzbp.cn/repository/npm-hosted/' },
    });
    expect(manifest.files).toEqual(['dist', 'templates', 'README.md']);
  });

  it('provides a Node executable and excludes source and credentials from the tarball', async () => {
    expect(await readFile('src/cli.ts', 'utf8')).toMatch(/^#!\/usr\/bin\/env node\n/);

    const packed = await runNpmPackDryRun();
    const paths = packed.files.map((file) => file.path);
    expect(paths).toEqual(expect.arrayContaining([
      'dist/cli.js',
      'dist/mcp-server.js',
      'README.md',
      'package.json',
    ]));
    expect(paths).not.toEqual(expect.arrayContaining([
      'src/cli.ts',
      '.npmrc',
      'integrations/README.md',
      'plugins/team-sdd/.mcp.json',
    ]));
  });

  it('documents the Chinese first-install flow before status usage', async () => {
    const readme = await readFile('README.md', 'utf8');

    expect(readme).toContain('## 安装与初始化');
    expect(readme).toContain('## 自定义项目配置');
    expect(readme).toContain('[MAINTAINERS.md](./MAINTAINERS.md)');
    expect(readme).toContain('npx @zbp/sdd init --agents all --install --register-codex');
    expect(readme.indexOf('sdd new DLV-001')).toBeLessThan(readme.indexOf('sdd status DLV-001'));
    expect(readme).toContain('@zbp:registry=https://nexus.zyzbp.cn/repository/npm-hosted/');
  });
});
