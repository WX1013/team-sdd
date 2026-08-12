export type AgentCapabilities = {
  skills: boolean;
  slashCommands: boolean;
  subagents: boolean;
  worktrees: boolean;
  shell: boolean;
  fileRead: boolean;
  fileWrite: boolean;
  mcp: boolean;
};

export type ExecutionStrategy = 'inline' | 'subagent';

export const defaultCapabilities: AgentCapabilities = {
  skills: false,
  slashCommands: false,
  subagents: false,
  worktrees: false,
  shell: true,
  fileRead: true,
  fileWrite: true,
  mcp: false,
};

export function executionStrategyFor(capabilities: AgentCapabilities): ExecutionStrategy {
  return capabilities.subagents ? 'subagent' : 'inline';
}

export function capabilityGapsFor(capabilities: AgentCapabilities): string[] {
  return (['shell', 'fileRead', 'fileWrite'] as const).filter((capability) => !capabilities[capability]);
}
