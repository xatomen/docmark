export type SvgCacheStats = {
  hits: number;
  misses: number;
  entries: number;
  characters: number;
};

/** LRU cache for sanitized SVG strings; values never contain shared DOM nodes. */
export class SanitizedSvgCache {
  private readonly entries = new Map<string, string>();
  private characters = 0;
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly maxEntries = 32,
    private readonly maxCharacters = 1_000_000,
  ) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    if (value.length > this.maxCharacters || this.maxEntries < 1) return;
    const previous = this.entries.get(key);
    if (previous !== undefined) {
      this.characters -= previous.length;
      this.entries.delete(key);
    }
    this.entries.set(key, value);
    this.characters += value.length;
    while (this.entries.size > this.maxEntries || this.characters > this.maxCharacters) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.characters -= this.entries.get(oldest)?.length ?? 0;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
    this.characters = 0;
    this.hits = 0;
    this.misses = 0;
  }

  stats(): SvgCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.entries.size,
      characters: this.characters,
    };
  }
}

export const MERMAID_RENDER_CACHE_VERSION = "mermaid-12-neutral-svg-v1";

const sanitizedSvgCache = new SanitizedSvgCache();

export function createMermaidSvgCacheKey(source: string): string {
  return `${MERMAID_RENDER_CACHE_VERSION}:${source}`;
}

export function getSanitizedMermaidSvgCache(): SanitizedSvgCache {
  return sanitizedSvgCache;
}

export async function getOrCreateSanitizedSvg(
  cache: SanitizedSvgCache,
  key: string,
  render: () => Promise<string>,
): Promise<{ svg: string; cacheHit: boolean }> {
  const cached = cache.get(key);
  if (cached !== undefined) return { svg: cached, cacheHit: true };
  const svg = await render();
  cache.set(key, svg);
  return { svg, cacheHit: false };
}
