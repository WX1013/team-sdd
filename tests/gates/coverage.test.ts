import { describe, expect, it } from 'vitest';
import { coverageFindingIds, requirementIds } from '../../src/gates/coverage.js';

describe('Requirement coverage identifiers', () => {
  it('uses exact structured identifiers without assuming their format', () => {
    const requirement = '## 范围\n\n- 编号：订单导出-2.3\n- 编号：ORD_EXPORT_A\n- 编号：订单导出-2.3';

    expect(requirementIds(requirement)).toEqual(['订单导出-2.3', 'ORD_EXPORT_A']);
    expect(coverageFindingIds(['订单导出-2.3', 'ORD_EXPORT_A'], '## Requirement Coverage\n\n- 编号：订单导出-2.3')).toEqual(['ORD_EXPORT_A']);
    expect(requirementIds('- REQ-001\n- BR-001')).toEqual(['REQ-001', 'BR-001']);
  });
});
