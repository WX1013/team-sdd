import { DomainError } from '../domain/errors.js';
import type { GateFinding } from '../gates/types.js';

export type ToolResult<T> = {
  ok: boolean;
  data?: T;
  findings?: GateFinding[];
  error?: { code: string; message: string };
};

export function toolError(error: unknown): ToolResult<never> {
  if (error instanceof DomainError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  if (error instanceof Error) {
    return { ok: false, error: { code: 'MCP_TOOL_FAILURE', message: error.message } };
  }
  return { ok: false, error: { code: 'MCP_TOOL_FAILURE', message: String(error) } };
}
