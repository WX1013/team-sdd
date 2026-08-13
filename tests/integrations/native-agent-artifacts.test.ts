import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const actions = ['new', 'next', 'approve', 'status', 'doctor'];
const codeBuddyTools = {
  new: 'sdd_new',
  next: 'sdd_next',
  approve: 'sdd_approve',
  status: 'sdd_status',
} as const;
const claudeCommand = (action: string) => `templates/claude/commands/sdd/${action}.md`;
const codeBuddyCommand = (action: string) => `templates/codebuddy/.codebuddy/commands/sdd/${action}.md`;

describe('Team SDD project Agent templates', () => {
  it('keeps project Agent adapters only in published templates', async () => {
    await expect(stat('integrations/claude-code')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat('integrations/codebuddy')).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(readFile(claudeCommand('new'), 'utf8')).resolves.toContain('Team SDD');
    await expect(readFile(codeBuddyCommand('new'), 'utf8')).resolves.toContain('Team SDD');
  });

  it.each(actions)('%s is available in the Claude and CodeBuddy project templates', async (action) => {
    await expect(readFile(claudeCommand(action), 'utf8')).resolves.toContain('Team SDD');
    await expect(readFile(codeBuddyCommand(action), 'utf8')).resolves.toContain('Team SDD');
  });

  it('keeps Claude commands governed by Core context and submission', async () => {
    const contents = await Promise.all([
      ...actions.map((action) => readFile(claudeCommand(action), 'utf8')),
      readFile('templates/claude/skills/team-sdd/SKILL.md', 'utf8'),
    ]);
    const text = contents.join('\n');

    expect(text).toContain('mcp__team-sdd__sdd_get_context');
    expect(text).toContain('mcp__team-sdd__sdd_submit_artifact');
    expect(text).not.toMatch(/(?:write|append).*?(?:delivery\.yaml|events?)/i);
  });

  it.each(Object.entries(codeBuddyTools))(
    '%s uses only its governed CodeBuddy MCP tool',
    async (action, tool) => {
      const command = await readFile(codeBuddyCommand(action), 'utf8');

      expect(command).toContain('description:');
      expect(command).toContain('argument-hint:');
      expect(command).toContain(`mcp__team-sdd__${tool}`);
      expect(command).toContain('disable-model-invocation: true');
      expect(command).toContain(`mcp__team-sdd__${tool}`);
      expect(command).not.toContain('Bash');
    },
  );

  it('uses the built CLI for repository diagnostics without a Delivery argument', async () => {
    const command = await readFile(codeBuddyCommand('doctor'), 'utf8');

    expect(command).not.toContain('argument-hint:');
    expect(command).toContain('allowed-tools: Bash(node node_modules/@zbp/sdd/dist/cli.js doctor --json)');
    expect(command).toContain('node node_modules/@zbp/sdd/dist/cli.js doctor --json');
    expect(command).not.toContain('mcp__team-sdd__');
    expect(command).not.toContain('$1');
  });

  it.each(['new', 'next', 'approve', 'status'])('%s prevents CodeBuddy from directly writing governed state', async (action) => {
    const command = await readFile(codeBuddyCommand(action), 'utf8');

    expect(command).toMatch(/do not directly change .*?(?:metadata|events?)/i);
  });

  it('keeps the CodeBuddy Skill governed by context and submission', async () => {
    const skill = await readFile('templates/codebuddy/.codebuddy/skills/team-sdd/SKILL.md', 'utf8');

    expect(skill).toContain('sdd_get_context');
    expect(skill).toContain('sdd_submit_artifact');
    expect(skill).toContain('`/sdd:doctor`');
    expect(skill).not.toMatch(/(?:write|append).*?(?:delivery\.yaml|events?)/i);
  });

  it('uses CodeBuddy approval positional arguments', async () => {
    const command = await readFile(codeBuddyCommand('approve'), 'utf8');

    expect(command).toContain('$1');
    expect(command).toContain('$2');
    expect(command).toContain('$3');
  });

  it('documents templates as the only project Agent adapter authority', async () => {
    const [readme, maintainers, integrations] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('MAINTAINERS.md', 'utf8'),
      readFile('integrations/README.md', 'utf8'),
    ]);

    expect(readme).not.toContain('integrations/claude-code');
    expect(readme).not.toContain('integrations/codebuddy');
    expect(maintainers).toContain('`templates/` 是唯一的项目级 Agent 安装权威源');
    expect(maintainers).toContain('`integrations/` 只保留源码调试说明');
    expect(maintainers).toContain('`plugins/team-sdd/` 只保留 Codex Logical Skills');
    expect(integrations).toContain('`../templates/`');
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
