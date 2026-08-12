import type { LogicalSkill } from '../runtime/logical-skills.js';
import { requirementSkill } from './requirement.js';
import { specSplitSkill } from './spec-split.js';
import { technicalDesignSkill } from './technical-design.js';
import type { SkillDefinition } from './types.js';

const registry: ReadonlyMap<SkillDefinition['logicalSkill'], SkillDefinition> = new Map([
  [requirementSkill.logicalSkill, requirementSkill],
  [technicalDesignSkill.logicalSkill, technicalDesignSkill],
  [specSplitSkill.logicalSkill, specSplitSkill],
]);

export function getSkillDefinition(skill: LogicalSkill): SkillDefinition | undefined {
  return registry.get(skill as SkillDefinition['logicalSkill']);
}

export function isSelfDevelopedSkill(skill: LogicalSkill): boolean {
  return registry.has(skill as SkillDefinition['logicalSkill']);
}
