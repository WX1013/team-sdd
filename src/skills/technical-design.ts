import type { SkillDefinition } from './types.js';

const sections = [
  'System Boundary', 'Overall Architecture', 'Module Design', 'Data Model', 'API',
  'Core Flow', 'Permissions', 'Error Handling', 'Performance', 'Security',
  'Observability', 'Deployment', 'Compatibility / Migration', 'Test Strategy', 'Technical Risks',
] as const;

export const technicalDesignSkill: SkillDefinition = {
  logicalSkill: 'technical-design',
  artifactKind: 'design',
  requiredSections: sections,
  renderTemplate: ({ delivery }) => `# Technical Design\n\nDelivery: ${delivery.id} · ${delivery.title}\n\n${sections.map((section) => `## ${section}\n\nDescribe concrete decisions, constraints, and validation for ${section}.`).join('\n\n')}\n\n## Requirement Coverage\n\n- REQ-001: Explain the Design decision that covers this requirement.\n- BR-001: Explain the Design decision that covers this rule.\n`,
  submissionCommand: ({ deliveryId }) => `sdd submit ${deliveryId} design`,
};
