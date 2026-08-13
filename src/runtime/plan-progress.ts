export type PlanProgress = { completed: number; total: number };

export function planProgress(markdown: string): PlanProgress {
  const matches = [...markdown.matchAll(/^###\s+Task\s+.+$/gm)];
  const completed = matches.filter((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    const checkboxes = [...markdown.slice(start, end).matchAll(/^- \[([ xX])\]/gm)];
    return checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox[1]?.toLowerCase() === 'x');
  }).length;
  return { completed, total: matches.length };
}
