import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { defaultLogicalSkillRoutes, skillProviders, type LogicalSkillRouteOverrides } from '../runtime/skill-routes.js';

export type ProjectExecutionStrategy = 'auto' | 'inline' | 'subagent';
export type ProjectConfig = {
  version: 1;
  execution: { strategy: ProjectExecutionStrategy };
  logicalSkills?: LogicalSkillRouteOverrides;
  checks: {
    test: readonly ['npm', 'test'];
    typecheck: readonly ['npm', 'run', 'typecheck'];
    build: readonly ['npm', 'run', 'build'];
  };
};

const logicalSkillRouteSchema = z.preprocess((raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const input = raw as Record<string, unknown>;
  if (!('skill' in input)) return raw;
  if ('skills' in input) return raw;
  const { skill, ...rest } = input;
  return { ...rest, skills: [skill] };
}, z.object({
  provider: z.enum(skillProviders),
  skills: z.array(z.string().min(1)).min(1).superRefine((skills, context) => {
    if (new Set(skills).size !== skills.length) {
      context.addIssue({ code: 'custom', message: 'Logical Skill route skills must not contain duplicates' });
    }
  }),
}).strict());

const logicalSkillsSchema = z.object({
  'requirement-analysis': logicalSkillRouteSchema.optional(),
  'technical-design': logicalSkillRouteSchema.optional(),
  'spec-split': logicalSkillRouteSchema.optional(),
  'implementation-plan': logicalSkillRouteSchema.optional(),
  implementation: logicalSkillRouteSchema.optional(),
  verification: logicalSkillRouteSchema.optional(),
}).strict().superRefine((overrides, context) => {
  for (const [logicalSkill, route] of Object.entries(overrides)) {
    if (!route) continue;
    const expected = defaultLogicalSkillRoutes[logicalSkill as keyof typeof defaultLogicalSkillRoutes];
    if (route.provider !== expected.provider) {
      context.addIssue({ code: 'custom', path: [logicalSkill, 'provider'], message: `Logical Skill ${logicalSkill} must use Provider ${expected.provider}` });
    }
    if (route.skills.some((skill) => !expected.skills.includes(skill))) {
      context.addIssue({ code: 'custom', path: [logicalSkill, 'skills'], message: `Logical Skill ${logicalSkill} contains a Skill outside its PRD route` });
    }
  }
});

const rawProjectConfigSchema = z.object({
  version: z.literal(1),
  execution: z.object({ strategy: z.enum(['auto', 'inline', 'subagent']) }).strict(),
  logicalSkills: logicalSkillsSchema.optional(),
  checks: z.object({
    test: z.tuple([z.literal('npm'), z.literal('test')]),
    typecheck: z.tuple([z.literal('npm'), z.literal('run'), z.literal('typecheck')]),
    build: z.tuple([z.literal('npm'), z.literal('run'), z.literal('build')]),
  }).strict(),
}).strict();

const projectConfigSchema = z.preprocess((raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const input = raw as Record<string, unknown>;
  if (!('logical_skills' in input)) return raw;

  const { logical_skills: logicalSkills, ...rest } = input;
  return { ...rest, logicalSkills };
}, rawProjectConfigSchema);

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
  const { logicalSkills, ...base } = config;
  const document = logicalSkills === undefined
    ? base
    : { ...base, logical_skills: logicalSkills };
  await writeFile(configPath(root), stringify(document), 'utf8');
}
