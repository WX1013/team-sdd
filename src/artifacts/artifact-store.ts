import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError } from '../domain/errors.js';
import type { ApprovalArtifact, DeliveryId, DeliveryMetadata, SpecId } from '../domain/types.js';

export type ArtifactKind = ApprovalArtifact | 'plan' | 'check';

export type ArtifactReference = {
  deliveryId: DeliveryId;
  specId?: SpecId;
  kind: ArtifactKind;
};

export function deliveryDirectory(root: string, deliveryId: DeliveryId): string {
  return join(root, 'sdd', 'deliveries', deliveryId);
}

export function requirementPath(root: string, deliveryId: DeliveryId): string {
  return join(deliveryDirectory(root, deliveryId), 'requirement.md');
}

export function designPath(root: string, deliveryId: DeliveryId): string {
  return join(deliveryDirectory(root, deliveryId), 'design.md');
}

export function deliveryCheckPath(root: string, deliveryId: DeliveryId): string {
  return join(deliveryDirectory(root, deliveryId), 'check.md');
}

export function specDirectory(root: string, deliveryId: DeliveryId, specId: SpecId): string {
  return join(deliveryDirectory(root, deliveryId), 'specs', specId);
}

function specArtifactPath(root: string, deliveryId: DeliveryId, specId: SpecId, file: 'spec.md' | 'plan.md' | 'check.md'): string {
  return join(specDirectory(root, deliveryId, specId), file);
}

export function validateRequiredSections(markdown: string, sections: readonly string[]): string[] {
  const findings = sections
    .filter((section) => !new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(markdown))
    .map((section) => `Missing required section: ${section}`);
  const placeholder = markdown.match(/\b(TBD|TODO)\b/i)?.[1];
  if (placeholder) {
    findings.push(`Artifact contains prohibited placeholder: ${placeholder.toUpperCase()}`);
  }
  return findings;
}

export function sha256(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

export class ArtifactStore {
  constructor(private readonly root: string) {}

  path(reference: ArtifactReference): string {
    if (reference.kind === 'requirement') return requirementPath(this.root, reference.deliveryId);
    if (reference.kind === 'design') return designPath(this.root, reference.deliveryId);
    if (reference.kind === 'check' && !reference.specId) return deliveryCheckPath(this.root, reference.deliveryId);
    if (!reference.specId) {
      throw new DomainError('SPEC_ID_REQUIRED', `Artifact ${reference.kind} requires a Spec Pack ID`);
    }
    return specArtifactPath(this.root, reference.deliveryId, reference.specId, `${reference.kind}.md` as 'spec.md' | 'plan.md' | 'check.md');
  }

  async read(reference: ArtifactReference): Promise<string> {
    try {
      return await readFile(this.path(reference), 'utf8');
    } catch (error) {
      throw new DomainError('ARTIFACT_MISSING', `Unable to read ${reference.kind} artifact: ${String(error)}`);
    }
  }

  async hash(reference: ArtifactReference): Promise<`sha256:${string}`> {
    return sha256(await this.read(reference));
  }

  async hasCurrentHash(reference: ArtifactReference, approvedHash: `sha256:${string}`): Promise<boolean> {
    return (await this.hash(reference)) === approvedHash;
  }

  async hashSpecSet(delivery: DeliveryMetadata): Promise<`sha256:${string}`> {
    const parts = await Promise.all(
      [...delivery.specs]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(async (spec) => `${spec.id}:${await this.hash({ deliveryId: delivery.id, specId: spec.id, kind: 'spec' })}`),
    );
    return sha256(parts.join('\n'));
  }

  async createSpecTemplate(deliveryId: DeliveryId, specId: SpecId, acceptanceCriteria: readonly string[]): Promise<void> {
    const path = specArtifactPath(this.root, deliveryId, specId, 'spec.md');
    await mkdir(join(path, '..'), { recursive: true });
    const criteria = acceptanceCriteria.length === 0 ? '- AC-001' : acceptanceCriteria.map((criterion) => `- ${criterion}`).join('\n');
    await writeFile(path, `# Spec\n\n## Goal\n\n\n## Requirement Sources\n\n\n## Scope\n\n\n## Out of Scope\n\n\n## Acceptance Criteria\n\n${criteria}\n\n## Dependencies\n\nNone\n\n## Constraints\n\n\n## Expected Impact\n\n`, 'utf8');
  }
}
