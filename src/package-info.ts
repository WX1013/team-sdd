import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(readFileSync(
  fileURLToPath(new URL('../package.json', import.meta.url)),
  'utf8',
)) as { name: string; version: string };

export const packageManifest = {
  name: manifest.name,
  version: manifest.version,
} as const;

export const packageVersion = packageManifest.version;
