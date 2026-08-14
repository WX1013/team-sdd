import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomainError } from '../domain/errors.js';
import { agentNames, type AgentInstallManifest, type AgentName, type AgentSelection, type ProjectAgentInspection, type ProjectAgentInstaller, type ProjectAgentSyncResult } from './types.js';

const managedMarker = '<!-- Team SDD managed: v1 -->';
const manifestRelativePath = '.sdd/runtime/agent-installations.json';
const mcpRelativePath = '.mcp.json';
const teamSddMcpServer = {
  type: 'stdio',
  command: 'node',
  args: ['node_modules/@zbp/sdd/dist/mcp-server.js'],
};

type ManagedFile = { agent: AgentName; source: string; destination: string };

function packageTemplateRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates');
}

function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function pathParts(relativePath: string): string[] {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new DomainError('AGENT_PATH_UNSAFE', `Unsafe project-relative path: ${relativePath}`);
  }
  return normalized.split('/');
}

async function statOrMissing(path: string) {
  try {
    return await lstat(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function assertSafeDirectory(root: string, directoryRelativePath: string, create: boolean): Promise<void> {
  let current = root;
  for (const part of pathParts(directoryRelativePath)) {
    current = join(current, part);
    const metadata = await statOrMissing(current);
    if (!metadata) {
      if (!create) return;
      await mkdir(current);
      continue;
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new DomainError('AGENT_PATH_UNSAFE', `Agent directory must be a real directory: ${current}`);
    }
  }
}

async function assertSafeFile(root: string, relativePath: string): Promise<void> {
  const parts = pathParts(relativePath);
  if (parts.length > 1) await assertSafeDirectory(root, parts.slice(0, -1).join('/'), false);
  const target = join(root, relativePath);
  const metadata = await statOrMissing(target);
  if (metadata && (metadata.isSymbolicLink() || !metadata.isFile())) {
    throw new DomainError('AGENT_PATH_UNSAFE', `Agent file must be a real file: ${target}`);
  }
}

async function ensureSafeFileParent(root: string, relativePath: string): Promise<void> {
  const parent = dirname(relativePath);
  if (parent !== '.') await assertSafeDirectory(root, parent, true);
  await assertSafeFile(root, relativePath);
}

async function readOptionalFile(root: string, relativePath: string): Promise<string | undefined> {
  await assertSafeFile(root, relativePath);
  try {
    return await readFile(join(root, relativePath), 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseManifest(raw: string | undefined): AgentInstallManifest {
  if (!raw) return { version: 1, files: {} };
  try {
    const value = JSON.parse(raw) as AgentInstallManifest;
    if (value.version !== 1 || typeof value.files !== 'object' || value.files === null || Array.isArray(value.files)) {
      throw new Error('schema');
    }
    return value;
  } catch {
    throw new DomainError('AGENT_INSTALL_MANIFEST_INVALID', 'Team SDD Agent installation manifest is invalid.');
  }
}

function parseJsonObject(raw: string, code: string, label: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not object');
    return value as Record<string, unknown>;
  } catch {
    throw new DomainError(code, `${label} must contain a JSON object.`);
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isLegacyTeamSddMarketplacePlugin(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const plugin = value as Record<string, unknown>;
  return plugin.name === 'team-sdd'
    && plugin.source === './plugins/team-sdd'
    && plugin.description === 'Project-local Team SDD workflow commands.'
    && (plugin.version === '0.1.0' || plugin.version === '0.1.1');
}

function outputFiles(templateRoot: string, agents: AgentSelection): ManagedFile[] {
  const actions = ['new', 'status', 'next', 'approve', 'doctor'] as const;
  const files: ManagedFile[] = [];
  if (agents.includes('claude')) {
    for (const action of actions) files.push({ agent: 'claude', source: `claude/commands/sdd/${action}.md`, destination: `.claude/commands/sdd/${action}.md` });
    files.push({ agent: 'claude', source: 'claude/skills/team-sdd/SKILL.md', destination: '.claude/skills/team-sdd/SKILL.md' });
  }
  if (agents.includes('codebuddy')) {
    for (const action of actions) files.push({ agent: 'codebuddy', source: `codebuddy/.codebuddy/commands/sdd/${action}.md`, destination: `.codebuddy/commands/sdd/${action}.md` });
    files.push({ agent: 'codebuddy', source: 'codebuddy/.codebuddy/skills/team-sdd/SKILL.md', destination: '.codebuddy/skills/team-sdd/SKILL.md' });
  }
  if (agents.includes('codex')) {
    files.push({ agent: 'codex', source: 'codex/plugins/team-sdd/.codex-plugin/plugin.json', destination: '.agents/plugins/team-sdd/.codex-plugin/plugin.json' });
    files.push({ agent: 'codex', source: 'codex/plugins/team-sdd/.mcp.json', destination: '.agents/plugins/team-sdd/.mcp.json' });
    for (const action of actions) files.push({ agent: 'codex', source: `codex/plugins/team-sdd/skills/sdd-${action}/SKILL.md`, destination: `.agents/plugins/team-sdd/skills/sdd-${action}/SKILL.md` });
  }
  return files.map((file) => ({ ...file, source: join(templateRoot, file.source) }));
}

export function parseAgentSelection(input: string): AgentSelection {
  const values = input.split(',').map((value) => value.trim());
  if (values.some((value) => !value)) throw new DomainError('INVALID_AGENT_SELECTION', 'Agent selection cannot contain an empty value.');
  if (values.includes('all')) {
    if (values.length !== 1) throw new DomainError('INVALID_AGENT_SELECTION', 'all cannot be combined with another Agent.');
    return [...agentNames];
  }
  const unknown = values.find((value) => !(agentNames as readonly string[]).includes(value));
  if (unknown) throw new DomainError('INVALID_AGENT_SELECTION', `Unknown Agent: ${unknown}`);
  if (new Set(values).size !== values.length) throw new DomainError('INVALID_AGENT_SELECTION', 'Agent selection cannot contain duplicates.');
  return agentNames.filter((agent) => values.includes(agent));
}

export function createProjectAgentInstaller(input: { templateRoot?: string } = {}): ProjectAgentInstaller {
  const templateRoot = input.templateRoot ?? packageTemplateRoot();

  async function readSource(file: ManagedFile): Promise<string> {
    return readFile(file.source, 'utf8');
  }

  async function inspect(input: { root: string; agents: AgentSelection }): Promise<readonly ProjectAgentInspection[]> {
    const manifest = parseManifest(await readOptionalFile(input.root, manifestRelativePath));
    const findings: ProjectAgentInspection[] = [];
    for (const file of outputFiles(templateRoot, input.agents)) {
      const current = await readOptionalFile(input.root, file.destination);
      if (!current) {
        findings.push({ path: file.destination, status: 'missing' });
        continue;
      }
      const recorded = manifest.files[file.destination];
      findings.push({ path: file.destination, status: recorded?.sha256 === digest(current) ? 'present' : 'conflict' });
    }
    return findings;
  }

  async function sync(input: { root: string; agents: AgentSelection }): Promise<ProjectAgentSyncResult> {
    const root = resolve(input.root);
    const manifest = parseManifest(await readOptionalFile(root, manifestRelativePath));
    const files = outputFiles(templateRoot, input.agents);
    const sources = await Promise.all(files.map(async (file) => ({ file, content: await readSource(file) })));
    const installed: string[] = [];
    const unchanged: string[] = [];

    for (const { file, content } of sources) {
      await ensureSafeFileParent(root, file.destination);
      const current = await readOptionalFile(root, file.destination);
      if (!current) continue;
      if (current === content) {
        unchanged.push(file.destination);
        continue;
      }
      if (manifest.files[file.destination]?.sha256 !== digest(current)) {
        throw new DomainError('AGENT_FILE_CONFLICT', `Refusing to overwrite user-modified Agent file: ${file.destination}`);
      }
    }

    let mcpContent: string | undefined;
    if (input.agents.includes('claude') || input.agents.includes('codebuddy')) {
      await ensureSafeFileParent(root, mcpRelativePath);
      const existing = await readOptionalFile(root, mcpRelativePath);
      if (!existing) {
        mcpContent = `${JSON.stringify({ mcpServers: { 'team-sdd': teamSddMcpServer } }, null, 2)}\n`;
      } else {
        const config = parseJsonObject(existing, 'MCP_CONFIG_INVALID', 'Project .mcp.json');
        const servers = config.mcpServers;
        if (servers !== undefined && (!servers || typeof servers !== 'object' || Array.isArray(servers))) {
          throw new DomainError('MCP_CONFIG_INVALID', 'Project .mcp.json mcpServers must be an object.');
        }
        const mergedServers = { ...(servers as Record<string, unknown> | undefined) };
        if (mergedServers['team-sdd'] !== undefined && !sameJson(mergedServers['team-sdd'], teamSddMcpServer)) {
          throw new DomainError('MCP_SERVER_CONFLICT', 'Project .mcp.json already defines a different team-sdd server.');
        }
        if (mergedServers['team-sdd'] === undefined) {
          mcpContent = `${JSON.stringify({ ...config, mcpServers: { ...mergedServers, 'team-sdd': teamSddMcpServer } }, null, 2)}\n`;
        }
      }
    }

    let marketplaceContent: string | undefined;
    if (input.agents.includes('codex')) {
      const marketplacePath = '.agents/plugins/marketplace.json';
      await ensureSafeFileParent(root, marketplacePath);
      const templateMarketplace = parseJsonObject(await readFile(join(templateRoot, 'codex/plugins/marketplace.json'), 'utf8'), 'CODEX_MARKETPLACE_INVALID', 'Template Codex marketplace');
      const desiredPlugin = (templateMarketplace.plugins as unknown[])[0];
      const existing = await readOptionalFile(root, marketplacePath);
      if (!existing) {
        marketplaceContent = `${JSON.stringify(templateMarketplace, null, 2)}\n`;
      } else {
        const marketplace = parseJsonObject(existing, 'CODEX_MARKETPLACE_INVALID', 'Codex marketplace');
        if (!Array.isArray(marketplace.plugins)) throw new DomainError('CODEX_MARKETPLACE_INVALID', 'Codex marketplace plugins must be an array.');
        const matches = marketplace.plugins.filter((plugin) => typeof plugin === 'object' && plugin !== null && (plugin as { name?: unknown }).name === 'team-sdd');
        if (matches.length > 0 && !sameJson(matches[0], desiredPlugin)) {
          if (!isLegacyTeamSddMarketplacePlugin(matches[0])) {
            throw new DomainError('CODEX_MARKETPLACE_CONFLICT', 'Codex marketplace already defines a different team-sdd plugin.');
          }
          marketplaceContent = `${JSON.stringify({
            ...marketplace,
            plugins: marketplace.plugins.map((plugin) => plugin === matches[0] ? desiredPlugin : plugin),
          }, null, 2)}\n`;
        }
        if (matches.length === 0) marketplaceContent = `${JSON.stringify({ ...marketplace, plugins: [...marketplace.plugins, desiredPlugin] }, null, 2)}\n`;
      }
    }

    for (const { file, content } of sources) {
      const current = await readOptionalFile(root, file.destination);
      if (current === content) {
        manifest.files[file.destination] = { sha256: digest(content), agent: file.agent };
        continue;
      }
      await writeFile(join(root, file.destination), content, 'utf8');
      manifest.files[file.destination] = { sha256: digest(content), agent: file.agent };
      installed.push(file.destination);
    }
    if (mcpContent) await writeFile(join(root, mcpRelativePath), mcpContent, 'utf8');
    if (marketplaceContent) await writeFile(join(root, '.agents/plugins/marketplace.json'), marketplaceContent, 'utf8');

    await ensureSafeFileParent(root, manifestRelativePath);
    await writeFile(join(root, manifestRelativePath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { installed, unchanged, warnings: [] };
  }

  return { sync, inspect };
}
