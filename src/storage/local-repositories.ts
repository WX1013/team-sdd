import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { parseDeliveryId, type DeliveryId, type DeliveryMetadata, type WorkflowEvent } from '../domain/types.js';
import type { DeliveryRepository, EventRepository } from './ports.js';

const deliveryStateSchema = z.enum(['REQUIREMENT', 'DESIGN', 'SPEC', 'EXECUTION', 'CHECK', 'DONE']);
const specStateSchema = z.enum(['READY', 'PLAN', 'CODE', 'CHECK', 'DONE']);
const approvalSchema = z.object({
  artifact: z.enum(['requirement', 'design', 'spec']),
  hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  actorType: z.literal('human'),
  approvedBy: z.string().min(1),
  approvedAt: z.string().datetime(),
}).strict();

const deliveryMetadataSchema = z.object({
  id: z.string().regex(/^DLV-[A-Za-z0-9][A-Za-z0-9_-]*$/),
  title: z.string().min(1),
  type: z.enum(['APPLICATION_INIT', 'FEATURE_CHANGE']),
  state: deliveryStateSchema,
  design: z.object({ required: z.boolean(), reason: z.string().min(1) }).strict().optional(),
  approvals: z.object({
    requirement: approvalSchema.optional(),
    design: approvalSchema.optional(),
    spec: approvalSchema.optional(),
  }).strict(),
  specs: z.array(z.object({
    id: z.string().regex(/^SP-[A-Za-z0-9][A-Za-z0-9_-]*$/),
    title: z.string().min(1),
    state: specStateSchema,
    dependencies: z.array(z.string().regex(/^SP-[A-Za-z0-9][A-Za-z0-9_-]*$/)),
    acceptanceCriteria: z.array(z.string().regex(/^AC-\d+$/)),
  }).strict()),
}).strict();

const workflowEventSchema = z.object({
  type: z.string(),
  deliveryId: z.string().regex(/^DLV-[A-Za-z0-9][A-Za-z0-9_-]*$/),
  occurredAt: z.string().datetime(),
  previousState: z.enum(['REQUIREMENT', 'DESIGN', 'SPEC', 'EXECUTION', 'CHECK', 'DONE', 'READY', 'PLAN', 'CODE']).optional(),
  nextState: z.enum(['REQUIREMENT', 'DESIGN', 'SPEC', 'EXECUTION', 'CHECK', 'DONE', 'READY', 'PLAN', 'CODE']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

function deliveryPath(root: string, id: DeliveryId): string {
  return join(root, 'sdd', 'deliveries', id, 'delivery.yaml');
}

export class LocalDeliveryRepository implements DeliveryRepository {
  constructor(private readonly root: string) {}

  async create(delivery: DeliveryMetadata): Promise<void> {
    const path = deliveryPath(this.root, delivery.id);
    await mkdir(join(path, '..'), { recursive: true });
    try {
      await writeFile(path, stringify(delivery), { encoding: 'utf8', flag: 'wx' });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new DomainError('DELIVERY_ALREADY_EXISTS', `Delivery already exists: ${delivery.id}`);
      }
      throw error;
    }
  }

  async read(id: DeliveryId): Promise<DeliveryMetadata> {
    let raw: unknown;
    try {
      raw = parse(await readFile(deliveryPath(this.root, id), 'utf8'));
    } catch (error) {
      throw new DomainError('INVALID_DELIVERY_METADATA', `Unable to read delivery metadata for ${id}: ${String(error)}`);
    }

    const result = deliveryMetadataSchema.safeParse(raw);
    if (!result.success) {
      throw new DomainError('INVALID_DELIVERY_METADATA', `Invalid delivery metadata for ${id}: ${result.error.issues[0]?.message ?? 'unknown schema error'}`);
    }

    if (result.data.id !== id) {
      throw new DomainError('DELIVERY_ID_MISMATCH', `Delivery metadata ID ${result.data.id} does not match requested Delivery ID ${id}`);
    }

    return result.data as DeliveryMetadata;
  }

  async listIds(): Promise<DeliveryId[]> {
    const directory = join(this.root, 'sdd', 'deliveries');
    let entries: Array<{ isDirectory(): boolean; name: string }>;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => parseDeliveryId(entry.name))
      .sort();
  }

  async save(delivery: DeliveryMetadata): Promise<void> {
    const path = deliveryPath(this.root, delivery.id);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, stringify(delivery), 'utf8');
  }
}

export class LocalEventRepository implements EventRepository {
  constructor(private readonly root: string) {}

  async append(event: WorkflowEvent): Promise<void> {
    const directory = join(this.root, '.sdd', 'events');
    await mkdir(directory, { recursive: true });
    await appendFile(join(directory, `${event.deliveryId}.jsonl`), `${JSON.stringify(event)}\n`, 'utf8');
  }

  async read(deliveryId: DeliveryId): Promise<WorkflowEvent[]> {
    const path = join(this.root, '.sdd', 'events', `${deliveryId}.jsonl`);
    let content: string;
    try {
      content = await readFile(path, 'utf8');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new DomainError('INVALID_EVENT_LOG', `Unable to read event log for ${deliveryId}: ${String(error)}`);
    }

    const events: WorkflowEvent[] = [];
    for (const [index, line] of content.split('\n').entries()) {
      if (!line.trim()) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch (error) {
        throw new DomainError('INVALID_EVENT_LOG', `Invalid event log row ${index + 1} for ${deliveryId}: ${String(error)}`);
      }
      const result = workflowEventSchema.safeParse(raw);
      if (!result.success) {
        throw new DomainError('INVALID_EVENT_LOG', `Invalid event log row ${index + 1} for ${deliveryId}: ${result.error.issues[0]?.message ?? 'unknown schema error'}`);
      }
      events.push(result.data as WorkflowEvent);
    }
    return events;
  }
}
