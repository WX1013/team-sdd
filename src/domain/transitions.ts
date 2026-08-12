import { DomainError } from './errors.js';
import type { DeliveryState, SpecState } from './types.js';

const deliveryTransitions: Record<DeliveryState, readonly DeliveryState[]> = {
  REQUIREMENT: ['DESIGN', 'SPEC'],
  DESIGN: ['SPEC'],
  SPEC: ['EXECUTION'],
  EXECUTION: ['CHECK'],
  CHECK: ['DONE'],
  DONE: [],
};

const specTransitions: Record<SpecState, readonly SpecState[]> = {
  READY: ['PLAN'],
  PLAN: ['CODE'],
  CODE: ['CHECK'],
  CHECK: ['DONE'],
  DONE: [],
};

export function transitionDelivery(from: DeliveryState, to: DeliveryState): DeliveryState {
  if (!deliveryTransitions[from].includes(to)) {
    throw new DomainError('ILLEGAL_DELIVERY_TRANSITION', `Illegal delivery transition: ${from} -> ${to}`);
  }

  return to;
}

export function transitionSpec(from: SpecState, to: SpecState): SpecState {
  if (!specTransitions[from].includes(to)) {
    throw new DomainError('ILLEGAL_SPEC_TRANSITION', `Illegal spec transition: ${from} -> ${to}`);
  }

  return to;
}
