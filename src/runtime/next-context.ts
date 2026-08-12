import type { DeliveryMetadata } from '../domain/types.js';

export type Activity = 'REQUIREMENT' | 'DESIGN' | 'SPEC_SPLIT' | 'PLAN' | 'CODE' | 'CHECK' | 'DONE';

export function resolveActivity(delivery: DeliveryMetadata): Activity {
  switch (delivery.state) {
    case 'REQUIREMENT': return 'REQUIREMENT';
    case 'DESIGN': return 'DESIGN';
    case 'SPEC': return 'SPEC_SPLIT';
    case 'CHECK': return 'CHECK';
    case 'DONE': return 'DONE';
    case 'EXECUTION': {
      const active = delivery.specs.find((spec) => spec.state !== 'DONE');
      if (!active) return 'CHECK';
      return active.state === 'READY' ? 'PLAN' : active.state;
    }
  }
}
