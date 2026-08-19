const markerPattern = /^\s*-\s*编号\s*[:：]\s*(\S(?:.*?\S)?)\s*$/gm;
const legacyIdentifierPattern = /\b(?:REQ|BR)-\d+\b/g;

function markerIds(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(markerPattern)].map((match) => match[1]!.trim()))];
}

function identifiers(markdown: string): string[] {
  const marked = markerIds(markdown);
  return marked.length > 0 ? marked : [...new Set(markdown.match(legacyIdentifierPattern) ?? [])];
}

export function requirementIds(markdown: string): string[] {
  return identifiers(markdown);
}

export function coverageFindingIds(required: readonly string[], coveredText: string): string[] {
  const covered = new Set(identifiers(coveredText));
  return required.filter((id) => !covered.has(id));
}
