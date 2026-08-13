import { describe, expect, it } from 'vitest';
import { coverageFindingIds, requirementIds } from '../../src/gates/coverage.js';

describe('Requirement coverage identifiers', () => {
  it('collects stable REQ and BR identifiers and reports each uncovered source exactly once', () => {
    expect(requirementIds('## Scope\n- REQ-001 Create record\n- REQ-002 List records\n## Business Rules\n- BR-001 Tenant isolation')).toEqual([
      'REQ-001', 'REQ-002', 'BR-001',
    ]);
    expect(coverageFindingIds(['REQ-001', 'REQ-002', 'BR-001'], 'REQ-001 BR-001')).toEqual(['REQ-002']);
  });
});
