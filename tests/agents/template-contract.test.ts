import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const shortActions = ['new', 'status', 'next', 'approve', 'doctor'] as const;

async function readAllTemplateText(): Promise<string> {
  const files = [
    ...shortActions.flatMap((action) => [
      `templates/claude/commands/sdd/${action}.md`,
      `templates/codebuddy/.codebuddy/commands/sdd/${action}.md`,
      `templates/codex/plugins/team-sdd/skills/sdd-${action}/SKILL.md`,
    ]),
    'templates/claude/skills/team-sdd/SKILL.md',
    'templates/codebuddy/.codebuddy/skills/team-sdd/SKILL.md',
    'templates/codex/plugins/team-sdd/.mcp.json',
  ];
  return (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
}

describe('project Agent templates', () => {
  it.each(shortActions)('gives Claude and CodeBuddy the colon command %s', async (action) => {
    await expect(readFile(`templates/claude/commands/sdd/${action}.md`, 'utf8'))
      .resolves.toContain('<!-- Team SDD managed: v1 -->');
    await expect(readFile(`templates/codebuddy/.codebuddy/commands/sdd/${action}.md`, 'utf8'))
      .resolves.toContain('<!-- Team SDD managed: v1 -->');
  });

  it.each(shortActions)('gives Codex the hyphen command Skill %s', async (action) => {
    const skill = await readFile(`templates/codex/plugins/team-sdd/skills/sdd-${action}/SKILL.md`, 'utf8');
    expect(skill).toContain(`name: sdd-${action}`);
    expect(skill).toContain('<!-- Team SDD managed: v1 -->');
  });

  it('keeps every Agent governed by the project-local Core runtime', async () => {
    const contents = await readAllTemplateText();
    expect(contents).toContain('node_modules/@zbp/sdd/dist/mcp-server.js');
    expect(contents).toContain('sdd_get_context');
    expect(contents).toContain('skillRuntime.instructions');
    expect(contents).toContain('sdd_submit_artifact');
    expect(contents).not.toMatch(/(?:write|append).*?(?:delivery\.yaml|events?)/i);
  });

  it('declares a local Codex marketplace and plugin', async () => {
    const marketplace = JSON.parse(await readFile('templates/codex/plugins/marketplace.json', 'utf8'));
    expect(marketplace).toMatchObject({
      name: 'team-sdd-project',
      plugins: [{ name: 'team-sdd', source: './plugins/team-sdd' }],
    });
  });
});
