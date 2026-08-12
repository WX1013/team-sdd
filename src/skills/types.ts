import type { DeliveryId, DeliveryMetadata, SpecId, SpecSummary } from '../domain/types.js';

export type TemplateArtifactKind = 'requirement' | 'design' | 'spec';

export type TemplateInput = {
  delivery: DeliveryMetadata;
  spec?: SpecSummary;
};

export type SkillDefinition = {
  logicalSkill: 'requirement-analysis' | 'technical-design' | 'spec-split';
  artifactKind: TemplateArtifactKind;
  requiredSections: readonly string[];
  renderTemplate(input: TemplateInput): string;
  submissionCommand(input: { deliveryId: DeliveryId; specId?: SpecId }): string;
};
