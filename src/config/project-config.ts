import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';

export type ProjectExecutionStrategy = 'auto' | 'inline' | 'subagent';
export type ProjectConfig = {
  version: 1;
  execution: { strategy: ProjectExecutionStrategy };
  checks: {
    test: readonly ['npm', 'test'];
    typecheck: readonly ['npm', 'run', 'typecheck'];
    build: readonly ['npm', 'run', 'build'];
  };
};

const projectConfigSchema = z.object({
  version: z.literal(1),
  execution: z.object({ strategy: z.enum(['auto', 'inline', 'subagent']) }).strict(),
  checks: z.object({
    test: z.tuple([z.literal('npm'), z.literal('test')]),
    typecheck: z.tuple([z.literal('npm'), z.literal('run'), z.literal('typecheck')]),
    build: z.tuple([z.literal('npm'), z.literal('run'), z.literal('build')]),
  }).strict(),
}).strict();

export const defaultProjectConfig: ProjectConfig = {
  version: 1,
  execution: { strategy: 'auto' },
  checks: {
    test: ['npm', 'test'],
    typecheck: ['npm', 'run', 'typecheck'],
    build: ['npm', 'run', 'build'],
  },
};

function configPath(root: string): string {
  return join(root, '.sdd', 'config.yaml');
}

async function assertProjectConfigPathsSafe(root: string): Promise<void> {
  const paths = [
    { path: join(root, '.sdd'), kind: 'directory' },
    { path: configPath(root), kind: 'file' },
  ] as const;
  for (const { path, kind } of paths) {
    try {
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink() || (kind === 'directory' ? !metadata.isDirectory() : !metadata.isFile())) {
        throw new DomainError('PROJECT_CONFIG_PATH_UNSAFE', `Project configuration ${kind} must be a real ${kind}: ${path}`);
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export async function readProjectConfig(root: string): Promise<ProjectConfig> {
  await assertProjectConfigPathsSafe(root);
  let raw: unknown;
  try {
    raw = parse(await readFile(configPath(root), 'utf8'));
  } catch (error) {
    throw new DomainError('INVALID_PROJECT_CONFIG', `Unable to read project configuration: ${String(error)}`);
  }

  const result = projectConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new DomainError('INVALID_PROJECT_CONFIG', `Invalid project configuration: ${result.error.issues[0]?.message ?? 'unknown schema error'}`);
  }
  return result.data;
}

export async function writeProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const directory = join(root, '.sdd');
  await assertProjectConfigPathsSafe(root);
  await mkdir(directory, { recursive: true });
  await assertProjectConfigPathsSafe(root);
  await writeFile(configPath(root), stringify(config), 'utf8');
}
