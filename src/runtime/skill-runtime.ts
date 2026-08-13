import type { ProjectExecutionStrategy } from '../config/project-config.js';
import type { GateFinding } from '../gates/types.js';
import type { Activity } from './next-context.js';
import { logicalSkillFor, type LogicalSkill } from './logical-skills.js';
import type { AgentCapabilities, ExecutionStrategy } from './capabilities.js';
import type { LogicalSkillRoute, LogicalSkillRoutes, SkillProvider } from './skill-routes.js';

export type SkillAdapter = 'native-skill' | 'mcp' | 'prompt';

export type ResolvedSkillRuntime = {
  logicalSkill: LogicalSkill;
  provider: SkillProvider;
  skills: readonly string[];
  adapter: SkillAdapter;
  execution: ExecutionStrategy;
  instructions: readonly string[];
  blockers: readonly GateFinding[];
};

export type ResolveSkillRuntimeInput = {
  activity: Activity;
  routes: LogicalSkillRoutes;
  strategy: ProjectExecutionStrategy;
  capabilities: AgentCapabilities;
};

function routeInstructions(route: LogicalSkillRoute): string[] {
  return route.skills.map((skill) => `Invoke ${route.provider}:${skill}.`);
}

export function resolveSkillRuntime(input: ResolveSkillRuntimeInput): ResolvedSkillRuntime {
  const logicalSkill = logicalSkillFor(input.activity);
  const route = input.routes[logicalSkill];
  const blockers: GateFinding[] = [];
  const execution: ExecutionStrategy = input.strategy === 'inline'
    ? 'inline'
    : input.strategy === 'subagent'
      ? input.capabilities.subagents ? 'subagent' : 'inline'
      : input.capabilities.subagents ? 'subagent' : 'inline';
  if (input.strategy === 'subagent' && !input.capabilities.subagents) {
    blockers.push({
      code: 'EXECUTION_STRATEGY_UNAVAILABLE',
      message: 'Project configuration requires subagent execution, but this Agent does not support subagents.',
      artifact: 'execution.strategy',
      nextStep: 'Use an Agent with subagent capability or set execution.strategy to auto or inline.',
    });
  }

  const adapter: SkillAdapter = input.capabilities.skills
    ? 'native-skill'
    : input.capabilities.mcp
      ? 'mcp'
      : 'prompt';
  if (adapter === 'prompt') {
    const missing = (['shell', 'fileRead', 'fileWrite'] as const).filter((capability) => !input.capabilities[capability]);
    if (missing.length > 0) {
      blockers.push({
        code: 'SKILL_RUNTIME_CAPABILITY_MISSING',
        message: `Prompt fallback requires: ${missing.join(', ')}.`,
        artifact: 'agent.capabilities',
        nextStep: `Enable ${missing.join(', ')} or use an Agent with Skill or MCP support.`,
      });
    }
  }

  return {
    logicalSkill,
    provider: route.provider,
    skills: [...route.skills],
    adapter,
    execution,
    instructions: routeInstructions(route),
    blockers,
  };
}
