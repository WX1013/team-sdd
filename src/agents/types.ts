export const agentNames = ['claude', 'codex', 'codebuddy'] as const;

export type AgentName = (typeof agentNames)[number];
export type AgentSelection = readonly AgentName[];

export type AgentInstallManifest = {
  version: 1;
  files: Record<string, { sha256: string; agent: AgentName }>;
};

export type ProjectAgentSyncResult = {
  installed: readonly string[];
  unchanged: readonly string[];
  warnings: readonly string[];
};

export type ProjectAgentInspection = {
  path: string;
  status: 'present' | 'missing' | 'conflict';
};

export type ProjectAgentInstaller = {
  sync(input: { root: string; agents: AgentSelection }): Promise<ProjectAgentSyncResult>;
  inspect(input: { root: string; agents: AgentSelection }): Promise<readonly ProjectAgentInspection[]>;
};
