import type { DeliveryId, DeliveryMetadata, WorkflowEvent } from '../domain/types.js';

export interface DeliveryRepository {
  read(id: DeliveryId): Promise<DeliveryMetadata>;
  create(delivery: DeliveryMetadata): Promise<void>;
  listIds(): Promise<DeliveryId[]>;
  save(delivery: DeliveryMetadata): Promise<void>;
}

export interface EventRepository {
  append(event: WorkflowEvent): Promise<void>;
  read(deliveryId: DeliveryId): Promise<WorkflowEvent[]>;
}
