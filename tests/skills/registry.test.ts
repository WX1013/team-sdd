import { describe, expect, it } from 'vitest';
import { getSkillDefinition } from '../../src/skills/registry.js';
import type { DeliveryMetadata, SpecSummary } from '../../src/domain/types.js';

const delivery: DeliveryMetadata = {
  id: 'DLV-001',
  title: 'Student records',
  type: 'APPLICATION_INIT',
  state: 'REQUIREMENT',
  approvals: {},
  specs: [],
};

const spec: SpecSummary = {
  id: 'SP-001',
  title: 'Records',
  state: 'READY',
  dependencies: [],
  acceptanceCriteria: ['AC-001'],
};

describe('Team SDD logical Skill Registry', () => {
  it('renders a Requirement template with contract headings and no prohibited placeholders', () => {
    const definition = getSkillDefinition('requirement-analysis');
    const template = definition?.renderTemplate({ delivery });

    expect(template).toContain('## Understanding');
    expect(template).toContain('## Baseline');
    expect(template).not.toMatch(/\b(TBD|TODO)\b/i);
  });

  it('renders Spec context and an exact Spec submission command', () => {
    const definition = getSkillDefinition('spec-split');
    const template = definition?.renderTemplate({ delivery, spec });

    expect(template).toContain('SP-001 · Records');
    expect(definition?.submissionCommand({ deliveryId: 'DLV-001', specId: 'SP-001' })).toBe('sdd submit DLV-001 spec --spec SP-001');
  });
});
