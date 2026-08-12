import type { SkillDefinition } from './types.js';

export const requirementSkill: SkillDefinition = {
  logicalSkill: 'requirement-analysis',
  artifactKind: 'requirement',
  requiredSections: ['Source', 'Understanding', 'Scope', 'Business Rules', 'Questions', 'Answers', 'Baseline'],
  renderTemplate: ({ delivery }) => `# Requirement\n\nDelivery: ${delivery.id} · ${delivery.title}\n\n## Source\n\nDescribe the source PRD or change request verbatim or link to its repository location.\n\n## Understanding\n\nDescribe the structured development understanding of the requested outcome.\n\n## Scope\n\nList included behavior and explicitly excluded behavior.\n\n## Business Rules\n\nList each business rule with a stable identifier such as BR-001.\n\n## Questions\n\nList open questions and mark each resolved or unresolved.\n\n## Answers\n\nRecord the confirmed answer for every resolved question.\n\n## Baseline\n\nState the final implementation baseline after all blocking questions are resolved.\n`,
  submissionCommand: ({ deliveryId }) => `sdd submit ${deliveryId} requirement`,
};
