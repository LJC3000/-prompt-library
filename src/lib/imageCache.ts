const ratioCache = new Map<string, number>();
const loadedSet = new Set<string>();

export function setCachedRatio(cardKey: string, ratio: number) {
  ratioCache.set(cardKey, ratio);
}

export function getCachedRatio(cardKey: string): number | null {
  return ratioCache.get(cardKey) ?? null;
}

export function markLoaded(cardKey: string) {
  loadedSet.add(cardKey);
}

export function isLoaded(cardKey: string): boolean {
  return loadedSet.has(cardKey);
}
