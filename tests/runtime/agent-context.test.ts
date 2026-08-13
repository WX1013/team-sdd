import { describe, expect, it } from 'vitest';
import { capabilityGapsFor, defaultCapabilities, executionStrategyFor } from '../../src/runtime/capabilities.js';
import { logicalSkillFor } from '../../src/runtime/logical-skills.js';
import { buildAgentContext } from '../../src/runtime/agent-context.js';

describe('Agent Runtime', () => {
  it('maps PLAN to an implementation plan skill and selects a subagent only when supported', () => {
    expect(logicalSkillFor('PLAN')).toBe('implementation-plan');
    expect(executionStrategyFor({ ...defaultCapabilities, subagents: true })).toBe('subagent');
    expect(executionStrategyFor(defaultCapabilities)).toBe('inline');
  });

  it('reports missing shell and write capabilities needed to execute work', () => {
    expect(capabilityGapsFor({ ...defaultCapabilities, shell: false, fileWrite: false })).toEqual([
      'shell',
      'fileWrite',
    ]);
  });

  it('builds a portable prompt with rules, blockers, and capability gaps', () => {
    const context = buildAgentContext({
      delivery: { id: 'DLV-001', title: 'Records', state: 'SPEC' },
      activity: 'PLAN',
      artifacts: ['sdd/deliveries/DLV-001/specs/SP-001/plan.md'],
      blockers: [{ code: 'PLAN_ARTIFACT_MISSING', message: 'Plan artifact is missing.', artifact: 'plan.md', nextStep: 'Create plan.md.' }],
      capabilities: { ...defaultCapabilities, fileWrite: false },
    });

    expect(context).toMatchObject({ logicalSkill: 'implementation-plan', execution: 'inline', capabilityGaps: ['fileWrite'] });
    expect(context.prompt).toContain('Do not modify delivery.yaml state directly.');
    expect(context.prompt).toContain('Plan artifact is missing.');
    expect(context.prompt).toContain('fileWrite');
  });

  it('adds the registered Requirement template and submission command to Agent Context', () => {
    const context = buildAgentContext({
      delivery: { id: 'DLV-001', title: 'Records', state: 'REQUIREMENT' },
      activity: 'REQUIREMENT',
      artifacts: [],
      blockers: [],
      capabilities: defaultCapabilities,
    });

    expect(context.prompt).toContain('## Artifact Template');
    expect(context.prompt).toContain('## Understanding');
    expect(context.prompt).toContain('sdd submit DLV-001 requirement');
  });

  it('does not add a template for implementation planning', () => {
    const context = buildAgentContext({
      delivery: { id: 'DLV-001', title: 'Records', state: 'EXECUTION' },
      activity: 'PLAN',
      artifacts: [],
      blockers: [],
      capabilities: defaultCapabilities,
    });

    expect(context.prompt).not.toContain('## Artifact Template');
  });

  it('includes the resolved Provider-backed Skill runtime in portable context', () => {
    const context = buildAgentContext({
      delivery: { id: 'DLV-001', title: 'Records', state: 'EXECUTION' },
      activity: 'PLAN', artifacts: [], blockers: [],
      strategy: 'inline',
      capabilities: { ...defaultCapabilities, skills: true },
    });

    expect(context.skillRuntime).toMatchObject({
      provider: 'superpowers', skills: ['writing-plans'], adapter: 'native-skill', execution: 'inline',
    });
    expect(context.prompt).toContain('## Skill Runtime');
    expect(context.prompt).toContain('superpowers:writing-plans');
  });
});
