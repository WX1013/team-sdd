import type { SkillDefinition } from './types.js';

const sections = ['Goal', 'Requirement Sources', 'Scope', 'Out of Scope', 'Acceptance Criteria', 'Dependencies', 'Constraints', 'Expected Impact'] as const;

export const specSplitSkill: SkillDefinition = {
  logicalSkill: 'spec-split',
  artifactKind: 'spec',
  requiredSections: sections,
  renderTemplate: ({ delivery, spec }) => {
    if (!spec) throw new Error('Spec template requires a Spec Pack');
    const dependencies = spec.dependencies.length === 0 ? 'None' : spec.dependencies.join(', ');
    const criteria = spec.acceptanceCriteria.length === 0 ? 'Define one or more acceptance criteria using AC-<number> identifiers.' : spec.acceptanceCriteria.map((criterion) => `- ${criterion}: State an observable acceptance outcome.`).join('\n');
    return `# Spec\n\nDelivery: ${delivery.id} · ${delivery.title}\nSpec Pack: ${spec.id} · ${spec.title}\n\n## Goal\n\nState the independently deliverable capability.\n\n## Requirement Sources\n\n- 编号：<requirement.md 中的原始编号>\n  State the Requirement identifier covered by this Spec Pack.\n\n## Scope\n\nList included behavior.\n\n## Out of Scope\n\nList excluded behavior.\n\n## Acceptance Criteria\n\n${criteria}\n\n## Dependencies\n\n${dependencies}\n\n## Constraints\n\nState technical, security, compatibility, and delivery constraints.\n\n## Expected Impact\n\nDescribe affected repository modules, APIs, data, and tests.\n`;
  },
  submissionCommand: ({ deliveryId, specId }) => {
    if (!specId) throw new Error('Spec submission command requires a Spec Pack ID');
    return `sdd submit ${deliveryId} spec --spec ${specId}`;
  },
};
