import { describe, expect, it } from 'vitest';
import { defaultCapabilities } from '../../src/runtime/capabilities.js';
import { defaultLogicalSkillRoutes } from '../../src/runtime/skill-routes.js';
import { resolveSkillRuntime } from '../../src/runtime/skill-runtime.js';

describe('Logical Skill runtime resolver', () => {
  const capable = { ...defaultCapabilities, skills: true, mcp: true, subagents: true };

  it('resolves PLAN to the configured Superpowers Skill through native Skill support', () => {
    expect(resolveSkillRuntime({
      activity: 'PLAN',
      routes: defaultLogicalSkillRoutes,
      strategy: 'auto',
      capabilities: capable,
    })).toMatchObject({
      provider: 'superpowers',
      skills: ['writing-plans'],
      adapter: 'native-skill',
      execution: 'subagent',
    });
  });

  it('falls back from native Skills to MCP and then a portable prompt without checking an Agent name', () => {
    expect(resolveSkillRuntime({
      activity: 'CODE', routes: defaultLogicalSkillRoutes, strategy: 'inline',
      capabilities: { ...capable, skills: false },
    }).adapter).toBe('mcp');
    expect(resolveSkillRuntime({
      activity: 'CODE', routes: defaultLogicalSkillRoutes, strategy: 'inline',
      capabilities: { ...capable, skills: false, mcp: false },
    }).adapter).toBe('prompt');
  });

  it('blocks a forced unavailable subagent strategy without claiming subagent execution', () => {
    const result = resolveSkillRuntime({
      activity: 'CODE', routes: defaultLogicalSkillRoutes, strategy: 'subagent',
      capabilities: { ...capable, subagents: false },
    });

    expect(result.execution).toBe('inline');
    expect(result.blockers).toEqual([expect.objectContaining({ code: 'EXECUTION_STRATEGY_UNAVAILABLE' })]);
  });
});
