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
});
