import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArtifactStore, requirementPath, validateRequiredSections } from '../../src/artifacts/artifact-store.js';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'team-sdd-artifacts-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('artifact store', () => {
  it('uses the canonical requirement artifact path', () => {
    expect(requirementPath('/repo', 'DLV-001')).toBe('/repo/sdd/deliveries/DLV-001/requirement.md');
  });

  it('invalidates an approval hash when artifact content changes', async () => {
    const root = await createRoot();
    const path = requirementPath(root, 'DLV-001');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '# Requirement\n\n## Source\n\nOriginal');
    const store = new ArtifactStore(root);
    const firstHash = await store.hash({ deliveryId: 'DLV-001', kind: 'requirement' });
    await writeFile(path, '# Requirement\n\n## Source\n\nChanged');

    await expect(store.hasCurrentHash({ deliveryId: 'DLV-001', kind: 'requirement' }, firstHash)).resolves.toBe(false);
  });

  it('reports missing sections and prohibited placeholder tokens', () => {
    expect(validateRequiredSections('# Requirement\n\n## Source\n\nTBD', ['Source', 'Scope'])).toEqual([
      'Missing required section: Scope',
      'Artifact contains prohibited placeholder: TBD',
    ]);
  });
});
