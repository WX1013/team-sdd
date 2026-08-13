import { describe, expect, it } from 'vitest';
import { defaultLogicalSkillRoutes, mergeLogicalSkillRoutes } from '../../src/runtime/skill-routes.js';
import { planProgress } from '../../src/runtime/plan-progress.js';

describe('Logical Skill routes', () => {
  it('uses the exact PRD Team SDD and Superpowers defaults', () => {
    expect(defaultLogicalSkillRoutes['requirement-analysis']).toEqual({
      provider: 'team-sdd',
      skills: ['requirement'],
    });
    expect(defaultLogicalSkillRoutes['implementation-plan']).toEqual({
      provider: 'superpowers',
      skills: ['writing-plans'],
    });
    expect(defaultLogicalSkillRoutes.implementation).toEqual({
      provider: 'superpowers',
      skills: ['test-driven-development', 'subagent-driven-development'],
    });
    expect(defaultLogicalSkillRoutes.verification).toEqual({
      provider: 'superpowers',
      skills: ['requesting-code-review', 'verification-before-completion'],
    });
  });

  it('overrides one route without dropping the other PRD defaults', () => {
    const routes = mergeLogicalSkillRoutes({
      implementation: { provider: 'superpowers', skills: ['test-driven-development'] },
    });

    expect(routes.implementation.skills).toEqual(['test-driven-development']);
    expect(routes['implementation-plan']).toEqual(defaultLogicalSkillRoutes['implementation-plan']);
  });
});

describe('Plan progress', () => {
  it('counts a task complete only when all checkboxes in its own body are checked', () => {
    expect(planProgress('### Task 1: A\n- [x] Test\n- [x] Implement\n\n### Task 2: B\n- [x] Test\n- [ ] Verify')).toEqual({ completed: 1, total: 2 });
  });
});
