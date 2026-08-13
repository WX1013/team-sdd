const identifierPattern = /\b(?:REQ|BR)-\d+\b/g;

export function requirementIds(markdown: string): string[] {
  return [...new Set(markdown.match(identifierPattern) ?? [])];
}

export function coverageFindingIds(required: readonly string[], coveredText: string): string[] {
  const covered = new Set(coveredText.match(identifierPattern) ?? []);
  return required.filter((id) => !covered.has(id));
}
