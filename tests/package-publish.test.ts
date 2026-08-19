import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

async function runNpmPackDryRun(): Promise<{ files: { path: string }[] }> {
  const { stdout } = await execFileAsync('npm', [
    '--cache', join(tmpdir(), 'zbp-sdd-npm-cache'), 'pack', '--dry-run', '--json',
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
      bin: { sdd: 'dist/cli.js' },
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
    expect(paths).not.toContain('dist/src/cli.js');
    expect(paths).not.toContain('dist/package.json');
  });

  it('documents three-chapter onboarding for any project and every supported Agent', async () => {
    const readme = await readFile('README.md', 'utf8');

    expect(readme).toContain('## 1. 首次安装');
    expect(readme).toContain('## 2. 完成第一个 Delivery');
    expect(readme).toContain('## 3. Team SDD 工作流、治理与自定义');
    expect(readme).toContain('### CodeBuddy 桌面程序');
    expect(readme).toContain('### Codex 桌面程序');
    expect(readme).toContain('### Claude Code 命令行');
    expect(readme).toContain('/sdd:new DLV-001 "会员中心 V1" APPLICATION_INIT');
    expect(readme).toContain('/sdd-new DLV-001 "会员中心 V1" APPLICATION_INIT');
    expect(readme).toContain('`npx sdd` 是备用入口');
    expect(readme).toContain('### 更新 Team SDD');
    expect(readme).toContain('npm install -D @zbp/sdd@latest');
    expect(readme).toContain('### 命令参考');
    expect(readme).toContain('[MAINTAINERS.md](./MAINTAINERS.md)');
    expect(readme).toContain('npx @zbp/sdd init --agents claude --install');
    expect(readme).toContain('npx @zbp/sdd init --agents codebuddy --install');
    expect(readme).toContain('npx @zbp/sdd init --agents codex --install --register-codex');
    expect(readme).toContain('Requirement → Technical Design（按类型/人工决定） → Spec Pack → Plan → Code → Check → Done');
    expect(readme.indexOf('sdd new DLV-001')).toBeLessThan(readme.indexOf('sdd status DLV-001'));
    const codeBuddyApproval = readme.indexOf('/sdd:approve DLV-001 requirement "产品负责人"');
    expect(codeBuddyApproval).toBeGreaterThan(-1);
    expect(readme.indexOf('/sdd:next DLV-001', codeBuddyApproval)).toBeGreaterThan(codeBuddyApproval);
    const codexApproval = readme.indexOf('/sdd-approve DLV-001 requirement "产品负责人"');
    expect(codexApproval).toBeGreaterThan(-1);
    expect(readme.indexOf('/sdd-next DLV-001', codexApproval)).toBeGreaterThan(codexApproval);
    expect(readme).toContain('@zbp:registry=https://nexus.zyzbp.cn/repository/npm-group/');
  });
});
