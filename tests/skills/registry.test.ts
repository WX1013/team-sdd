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
  it('renders a Chinese Requirement template that defers to PRD identifiers', () => {
    const definition = getSkillDefinition('requirement-analysis');
    const template = definition?.renderTemplate({ delivery });

    expect(template).toContain('## 来源');
    expect(template).toContain('## 需求理解');
    expect(template).toContain('## 范围');
    expect(template).toContain('## 业务规则');
    expect(template).toContain('## 问题');
    expect(template).toContain('## 答复');
    expect(template).toContain('## 需求基线');
    expect(template).toContain('编号：');
    expect(template).not.toContain('REQ-001');
    expect(template).not.toContain('BR-001');
    expect(template).not.toMatch(/\b(TBD|TODO)\b/i);
  });

  it('renders Spec context and an exact Spec submission command', () => {
    const definition = getSkillDefinition('spec-split');
    const template = definition?.renderTemplate({ delivery, spec });

    expect(template).toContain('SP-001 · Records');
    expect(template).toContain('编号：');
    expect(template).not.toContain('REQ-001');
    expect(definition?.submissionCommand({ deliveryId: 'DLV-001', specId: 'SP-001' })).toBe('sdd submit DLV-001 spec --spec SP-001');
  });

  it('renders a Design Requirement Coverage section', () => {
    const template = getSkillDefinition('technical-design')?.renderTemplate({ delivery });
    expect(template).toContain('## Requirement Coverage');
    expect(template).toContain('编号：');
    expect(template).not.toContain('REQ-001');
  });
});
