import type { Activity } from './next-context.js';

export type LogicalSkill =
  | 'requirement-analysis'
  | 'technical-design'
  | 'spec-split'
  | 'implementation-plan'
  | 'implementation'
  | 'verification';

const skillByActivity: Record<Activity, LogicalSkill> = {
  REQUIREMENT: 'requirement-analysis',
  DESIGN: 'technical-design',
  SPEC_SPLIT: 'spec-split',
  PLAN: 'implementation-plan',
  CODE: 'implementation',
  CHECK: 'verification',
  DONE: 'verification',
};

export function logicalSkillFor(activity: Activity): LogicalSkill {
  return skillByActivity[activity];
}
