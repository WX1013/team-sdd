import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const actions = ['new', 'next', 'approve', 'status', 'doctor'];
const codeBuddyTools = {
  new: 'sdd_new',
  next: 'sdd_next',
  approve: 'sdd_approve',
  status: 'sdd_status',
} as const;
const claudeScopedTools = {
  new: 'mcp__plugin_team-sdd_team-sdd__sdd_new',
  next: 'mcp__plugin_team-sdd_team-sdd__sdd_next',
  approve: 'mcp__plugin_team-sdd_team-sdd__sdd_approve',
  status: 'mcp__plugin_team-sdd_team-sdd__sdd_status',
} as const;

describe('Team SDD native Agent artifacts', () => {
  it('declares a Claude Code plugin with commands, Skill, and local MCP configuration', async () => {
    const manifest = JSON.parse(
      await readFile('integrations/claude-code/.claude-plugin/plugin.json', 'utf8'),
    );
    const mcp = JSON.parse(await readFile('integrations/claude-code/.mcp.json', 'utf8'));

    expect(manifest).toMatchObject({
      name: 'team-sdd',
      commands: './commands/',
      skills: './skills/',
      mcpServers: './.mcp.json',
    });
    expect(mcp.mcpServers['team-sdd']).toMatchObject({
      command: 'node',
      args: ['${CLAUDE_PROJECT_DIR}/dist/mcp-server.js'],
    });
  });

  it.each(Object.entries(claudeScopedTools))(
    '%s invokes the scoped Claude plugin MCP tool',
    async (action, tool) => {
      const command = await readFile(`integrations/claude-code/commands/sdd-${action}.md`, 'utf8');

      expect(command).toContain(tool);
    },
  );

  it.each(actions)('%s is available for both Agents', async (action) => {
    await expect(readFile(`integrations/claude-code/commands/sdd-${action}.md`, 'utf8')).resolves.toContain('Team SDD');
    await expect(readFile(`integrations/codebuddy/.codebuddy/commands/sdd-${action}.md`, 'utf8')).resolves.toContain('Team SDD');
  });

  it('keeps Agent instructions governed by MCP context and submission', async () => {
    const skills = await Promise.all([
      readFile('integrations/claude-code/skills/team-sdd/SKILL.md', 'utf8'),
      readFile('integrations/codebuddy/.codebuddy/skills/team-sdd/SKILL.md', 'utf8'),
    ]);

    for (const skill of skills) {
      expect(skill).toContain('sdd_get_context');
      expect(skill).toContain('sdd_submit_artifact');
      expect(skill).not.toMatch(/^\s*(?:[-*]\s*)?(?:write|append)\s+.*(?:delivery\.yaml|events?)(?:\s|$)/im);
    }
  });

  it('identifies the scoped Claude tools used by the governed Skill', async () => {
    const skill = await readFile('integrations/claude-code/skills/team-sdd/SKILL.md', 'utf8');

    expect(skill).toContain('mcp__plugin_team-sdd_team-sdd__sdd_get_context');
    expect(skill).toContain('mcp__plugin_team-sdd_team-sdd__sdd_submit_artifact');
    expect(skill).toContain('mcp__plugin_team-sdd_team-sdd__sdd_approve');
  });

  it('declares the CodeBuddy project MCP server at the target repository root', async () => {
    const mcp = JSON.parse(await readFile('integrations/codebuddy/.mcp.json', 'utf8'));

    expect(mcp.mcpServers['team-sdd']).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['dist/mcp-server.js'],
    });
  });

  it('documents a non-destructive CodeBuddy MCP installation that preserves existing servers', async () => {
    const [rootReadme, integrationsReadme, source] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('integrations/README.md', 'utf8'),
      readFile('integrations/codebuddy/.mcp.json', 'utf8'),
    ]);

    for (const readme of [rootReadme, integrationsReadme]) {
      expect(readme).not.toMatch(/cp\s+integrations\/codebuddy\/\.mcp\.json\s+\.mcp\.json/);
      expect(readme).toMatch(/(?:never replace or use a bare overwrite copy|绝不能替换已有目标).*\.mcp\.json/i);
      expect(readme).toMatch(/(?:if .*\.mcp\.json.*(?:does not exist|is absent).*copy|\.mcp\.json`? 不存在时.*复制)/i);
      expect(readme).toMatch(/(?:if .*\.mcp\.json.*exists.*preserv.*mcpServers|\.mcp\.json`? 已存在时.*保留.*mcpServers)/i);
      expect(readme).toMatch(/(?:merge.*team-sdd|team-sdd.*合并)/i);
    }

    expect(Object.keys(JSON.parse(source).mcpServers)).toEqual(['team-sdd']);
  });

  it.each(Object.entries(codeBuddyTools))(
    '%s uses only its governed CodeBuddy MCP tool',
    async (action, tool) => {
      const command = await readFile(`integrations/codebuddy/.codebuddy/commands/sdd-${action}.md`, 'utf8');

      expect(command).toContain('description:');
      expect(command).toContain('argument-hint:');
      expect(command).toContain(`allowed-tools: mcp__team-sdd__${tool}`);
      expect(command).toContain('disable-model-invocation: true');
      expect(command).toContain(`mcp__team-sdd__${tool}`);
      expect(command).not.toContain('Bash');
    },
  );

  it('uses the built CLI for repository diagnostics without a Delivery argument', async () => {
    const command = await readFile('integrations/codebuddy/.codebuddy/commands/sdd-doctor.md', 'utf8');

    expect(command).not.toContain('argument-hint:');
    expect(command).toContain('allowed-tools: Bash(node dist/cli.js doctor --json)');
    expect(command).toContain('node dist/cli.js doctor --json');
    expect(command).not.toContain('mcp__team-sdd__');
    expect(command).not.toContain('$1');
  });

  it.each(actions)('%s routes governed failures to diagnostics and an explicit repair step', async (action) => {
    const command = await readFile(`integrations/codebuddy/.codebuddy/commands/sdd-${action}.md`, 'utf8');

    expect(command).toContain('`/sdd-doctor`');
    expect(command).toContain('next repair step');
    expect(command).toMatch(/do not .*?(?:mutate|change).*?(?:state|metadata|events?)/i);
  });

  it('requires the CodeBuddy Skill to route governed failures through diagnostics', async () => {
    const skill = await readFile('integrations/codebuddy/.codebuddy/skills/team-sdd/SKILL.md', 'utf8');

    expect(skill).toContain('`/sdd-doctor`');
    expect(skill).toContain('next repair step');
    expect(skill).toMatch(/do not .*?(?:mutate|change).*?(?:state|metadata|events?)/i);
  });

  it('uses CodeBuddy approval positional arguments', async () => {
    const command = await readFile('integrations/codebuddy/.codebuddy/commands/sdd-approve.md', 'utf8');

    expect(command).toContain('$1');
    expect(command).toContain('$2');
    expect(command).toContain('$3');
  });

  it('documents the repository-local Codex, Claude Code, and CodeBuddy entry points', async () => {
    const readme = await readFile('README.md', 'utf8');

    expect(readme).toContain('plugins/team-sdd');
    expect(readme).toContain('Claude Code');
    expect(readme).toContain('integrations/claude-code');
    expect(readme).toContain('CodeBuddy');
    expect(readme).toContain('integrations/codebuddy');
  });

  it('uses Chinese headings while preserving the documented Agent names', async () => {
    const readme = await readFile('README.md', 'utf8');

    expect(readme).toContain('## 快速开始');
    expect(readme).toContain('## 原生 Agent 集成');
    expect(readme).toContain('Claude Code');
    expect(readme).toContain('CodeBuddy');
  });

  it('documents separate intervention guides for CodeBuddy, Codex, and Claude Code', async () => {
    const readme = await readFile('README.md', 'utf8');

    expect(readme).toContain('### CodeBuddy：在桌面会话中介入');
    expect(readme).toContain('### Codex：通过项目插件介入');
    expect(readme).toContain('### Claude Code：通过项目命令介入');
    expect(readme).toContain('npx @zbp/sdd init --agents codebuddy --install');
    expect(readme).toContain('npx @zbp/sdd init --agents codex --install --register-codex');
    expect(readme).toContain('npx @zbp/sdd init --agents claude --install');
  });

  it('keeps maintenance instructions out of the user README', async () => {
    const [readme, maintainers] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('MAINTAINERS.md', 'utf8'),
    ]);

    expect(readme).not.toContain('npm publish --registry=');
    expect(maintainers).toContain('npm publish --registry=');
    expect(maintainers).toContain('## 发布到 Nexus');
  });
});
