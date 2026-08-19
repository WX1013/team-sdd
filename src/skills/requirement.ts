import type { SkillDefinition } from './types.js';

export const requirementSkill: SkillDefinition = {
  logicalSkill: 'requirement-analysis',
  artifactKind: 'requirement',
  requiredSections: ['来源', '需求理解', '范围', '业务规则', '问题', '答复', '需求基线'],
  renderTemplate: ({ delivery }) => `# 需求\n\n交付：${delivery.id} · ${delivery.title}\n\n## 来源\n\n引用 PRD、变更请求或其仓库路径。\n\n## 需求理解\n\n说明对目标和可观察结果的结构化理解。\n\n## 范围\n\n列出包含与不包含的行为。识别到 PRD 的需求或功能点编号时，使用 \`- 编号：<PRD 原始编号>\` 原样记录；仅无可识别编号的来源项补充递增的 Team SDD 编号。\n\n## 业务规则\n\n列出稳定规则与例外。识别到 PRD 规则编号时，使用 \`- 编号：<PRD 原始编号>\` 原样记录；仅无可识别编号的规则补充递增的 Team SDD 编号。\n\n## 问题\n\n列出待确认事项，并标注 \`状态：已解决\` 或 \`状态：未解决\`。\n\n## 答复\n\n记录每个已解决问题的确认结论。\n\n## 需求基线\n\n在所有阻塞问题解决后，说明最终可实施的需求基线。\n`,
  submissionCommand: ({ deliveryId }) => `sdd submit ${deliveryId} requirement`,
};
