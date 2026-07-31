export function parseSetFromTitle(title: string): string | null {
  const matches = [...title.matchAll(/\[([^\]]+)\]/g)];
  if (matches.length < 2) return null;
  return matches[1][1].trim();
}

export function collectSetsFromTitles(titles: string[]): string[] {
  const sets = new Set<string>();
  for (const title of titles) {
    const set = parseSetFromTitle(title);
    if (set) sets.add(set);
  }
  return [...sets].sort((a, b) => a.localeCompare(b));
}
