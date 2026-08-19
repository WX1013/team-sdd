import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const shortActions = ['new', 'status', 'next', 'approve', 'doctor'] as const;
const agentTemplateFiles = shortActions.flatMap((action) => [
  `templates/claude/commands/sdd/${action}.md`,
  `templates/codebuddy/.codebuddy/commands/sdd/${action}.md`,
  `templates/codex/plugins/team-sdd/skills/sdd-${action}/SKILL.md`,
]);
const governedSkillFiles = [
  'templates/claude/skills/team-sdd/SKILL.md',
  'templates/codebuddy/.codebuddy/skills/team-sdd/SKILL.md',
];

async function readAllTemplateText(): Promise<string> {
  const files = [
    ...agentTemplateFiles,
    ...governedSkillFiles,
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

  it.each(agentTemplateFiles)('%s renders a Chinese user-facing summary instead of raw tool output', async (file) => {
    const command = await readFile(file, 'utf8');

    expect(command).toContain('面向用户的内容必须使用简体中文');
    expect(command).toContain('不得展示原始 JSON、MCP 响应包络或 Core 结果原文');
    expect(command).not.toMatch(/(?:Return|Present) (?:the )?Core (?:data, findings, or errors |result )?unchanged/i);
    expect(command).not.toMatch(/(?:present|Present) its JSON output unchanged/);
  });

  it.each(governedSkillFiles)('%s keeps governed Skill findings human-readable', async (file) => {
    const skill = await readFile(file, 'utf8');

    expect(skill).toContain('面向用户的内容必须使用简体中文');
    expect(skill).toContain('不得展示原始 JSON、MCP 响应包络或 Core 结果原文');
    expect(skill).not.toMatch(/Return Core findings unchanged/i);
  });

  it.each([
    ['new', '创建结果'],
    ['next', '推荐动作'],
    ['approve', '审批结果'],
    ['doctor', '诊断问题'],
  ] as const)('%s defines its Chinese summary content', async (action, summary) => {
    const files = [
      `templates/claude/commands/sdd/${action}.md`,
      `templates/codebuddy/.codebuddy/commands/sdd/${action}.md`,
      `templates/codex/plugins/team-sdd/skills/sdd-${action}/SKILL.md`,
    ];

    for (const file of files) {
      await expect(readFile(file, 'utf8')).resolves.toContain(summary);
    }
  });

  it.each([
    ['Claude', 'templates/claude/commands/sdd/status.md'],
    ['CodeBuddy', 'templates/codebuddy/.codebuddy/commands/sdd/status.md'],
    ['Codex', 'templates/codex/plugins/team-sdd/skills/sdd-status/SKILL.md'],
  ])('%s status renders the PRD Status UX instead of raw Core JSON', async (_agent, file) => {
    const command = await readFile(file, 'utf8');

    expect(command).toContain('不得展示原始 JSON、MCP 响应包络或 Core 结果原文');
    expect(command).toContain('工作流');
    expect(command).toContain('规格包');
    expect(command).toContain('当前');
    expect(command).toContain('下一步');
    expect(command).toContain('需求');
    expect(command).toContain('技术设计');
    expect(command).toContain('规格');
    expect(command).toContain('执行');
    expect(command).toContain('检查');
    expect(command).toContain('完成');
    expect(command).toContain('→');
    expect(command).not.toMatch(/(?:Present|Return) the Core result unchanged/);
  });

  it('keeps every Agent governed by the project-local Core runtime', async () => {
    const contents = await readAllTemplateText();
    expect(contents).toContain('node_modules/@zbp/sdd/dist/mcp-server.js');
    expect(contents).toContain('sdd_get_context');
    expect(contents).toContain('skillRuntime.instructions');
    expect(contents).toContain('sdd_submit_artifact');
    expect(contents).toContain('Do not directly change `.sdd`, Delivery metadata, approvals, or Event Log files.');
    expect(contents).not.toMatch(/\b(?:Write|Append)\s+(?:to\s+)?(?:the\s+)?(?:\.sdd|Delivery metadata|Event Log)/);
  });

  it('declares a local Codex marketplace and plugin', async () => {
    const marketplace = JSON.parse(await readFile('templates/codex/plugins/marketplace.json', 'utf8'));
    expect(marketplace).toMatchObject({
      name: 'team-sdd-project',
      plugins: [{
        name: 'team-sdd',
        source: { source: 'local', path: './.agents/plugins/team-sdd' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      }],
    });
  });
});
