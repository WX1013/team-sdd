import type { LogicalSkill } from './logical-skills.js';

export const skillProviders = ['team-sdd', 'superpowers'] as const;
export type SkillProvider = (typeof skillProviders)[number];

export interface LogicalSkillRoute {
  provider: SkillProvider;
  skills: readonly string[];
}

export type LogicalSkillRouteOverrides = Partial<Record<LogicalSkill, LogicalSkillRoute>>;
export type LogicalSkillRoutes = Readonly<Record<LogicalSkill, LogicalSkillRoute>>;

const logicalSkills: readonly LogicalSkill[] = [
  'requirement-analysis',
  'technical-design',
  'spec-split',
  'implementation-plan',
  'implementation',
  'verification',
];

export const defaultLogicalSkillRoutes: LogicalSkillRoutes = {
  'requirement-analysis': {
    provider: 'team-sdd',
    skills: ['requirement'],
  },
  'technical-design': {
    provider: 'team-sdd',
    skills: ['technical-design'],
  },
  'spec-split': {
    provider: 'team-sdd',
    skills: ['spec-split'],
  },
  'implementation-plan': {
    provider: 'superpowers',
    skills: ['writing-plans'],
  },
  implementation: {
    provider: 'superpowers',
    skills: ['test-driven-development', 'subagent-driven-development'],
  },
  verification: {
    provider: 'superpowers',
    skills: ['requesting-code-review', 'verification-before-completion'],
  },
};

export function mergeLogicalSkillRoutes(
  overrides: LogicalSkillRouteOverrides | undefined,
): LogicalSkillRoutes {
  const merged = { ...defaultLogicalSkillRoutes, ...overrides };

  return logicalSkills.reduce<Partial<Record<LogicalSkill, LogicalSkillRoute>>>((routes, logicalSkill) => {
    const route = merged[logicalSkill];
    routes[logicalSkill] = { ...route, skills: [...route.skills] };
    return routes;
  }, {}) as LogicalSkillRoutes;
}
