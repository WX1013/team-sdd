import { describe, expect, it } from 'vitest';
import { transitionDelivery, transitionSpec } from '../../src/domain/transitions.js';

describe('state transitions', () => {
  it('moves a delivery from REQUIREMENT to DESIGN', () => {
    expect(transitionDelivery('REQUIREMENT', 'DESIGN')).toBe('DESIGN');
  });

  it('allows a feature delivery to skip DESIGN and enter SPEC', () => {
    expect(transitionDelivery('REQUIREMENT', 'SPEC')).toBe('SPEC');
  });

  it('rejects a delivery jump from REQUIREMENT to DONE', () => {
    expect(() => transitionDelivery('REQUIREMENT', 'DONE')).toThrow('Illegal delivery transition');
  });

  it('moves a Spec Pack from CODE to CHECK', () => {
    expect(transitionSpec('CODE', 'CHECK')).toBe('CHECK');
  });

  it('rejects a Spec Pack jump from READY to CODE', () => {
    expect(() => transitionSpec('READY', 'CODE')).toThrow('Illegal spec transition');
  });
});
