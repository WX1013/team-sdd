import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createMcpServer, parseDeliveryId } from '../src/index.js';
import type { ExecutionStrategy, ProjectExecutionStrategy } from '../src/index.js';

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Assert<Value extends true> = Value;
type RuntimeStrategyExportRemainsCompatible = Assert<Equal<ExecutionStrategy, 'inline' | 'subagent'>>;
type ProjectStrategyExportIncludesAuto = Assert<Equal<ProjectExecutionStrategy, 'auto' | 'inline' | 'subagent'>>;

const runtimeStrategyExportCheck: RuntimeStrategyExportRemainsCompatible = true;
const projectStrategyExportCheck: ProjectStrategyExportIncludesAuto = true;

describe('Delivery ID parsing', () => {
  it('accepts a Delivery ID with the DLV prefix', () => {
    expect(parseDeliveryId('DLV-001')).toBe('DLV-001');
  });

  it('rejects IDs without the DLV prefix', () => {
    expect(() => parseDeliveryId('001')).toThrow('Invalid Delivery ID');
  });

  it('exports the MCP server factory', () => {
    expect(createMcpServer).toBeTypeOf('function');
  });

  it('keeps runtime and project execution strategies as distinct public types', () => {
    expect(runtimeStrategyExportCheck).toBe(true);
    expect(projectStrategyExportCheck).toBe(true);
  });

  it('keeps every shipped Team SDD version aligned with package.json', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
    const lockfile = JSON.parse(await readFile('package-lock.json', 'utf8')) as { version: string; packages: Record<string, { version?: string }> };
    const templatePlugin = JSON.parse(await readFile('templates/codex/plugins/team-sdd/.codex-plugin/plugin.json', 'utf8')) as { version: string };
    const repositoryPlugin = JSON.parse(await readFile('plugins/team-sdd/.codex-plugin/plugin.json', 'utf8')) as { version: string };
    const mcpServer = await readFile('src/mcp/server.ts', 'utf8');
    const cli = await readFile('src/cli.ts', 'utf8');

    expect(lockfile.version).toBe(manifest.version);
    expect(lockfile.packages[''].version).toBe(manifest.version);
    expect(templatePlugin.version).toBe(manifest.version);
    expect(repositoryPlugin.version).toBe(manifest.version);
    expect(mcpServer).toContain("import { packageVersion } from '../package-info.js';");
    expect(cli).toContain("from './package-info.js';");
  });
});
