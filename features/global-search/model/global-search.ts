import type { PermissionKey } from "../../permissions/model/permissions";

export type SearchContext = {
  userId: string;
  can: (permission: PermissionKey) => boolean;
};

export type SearchResultMeta = { label: string; value: string };

export type SearchResult = {
  id: string;
  providerId: string;
  type: string;
  typeLabel: string;
  icon: string;
  title: string;
  subtitle: string;
  meta: SearchResultMeta[];
  href: string;
};

export type SearchProvider = {
  id: string;
  label: string;
  canSearch: (context: SearchContext) => boolean;
  canAccessResult?: (result: SearchResult, context: SearchContext) => boolean;
  search: (query: string, context: SearchContext) => Promise<SearchResult[]>;
};

export type SearchResultGroup = { providerId: string; label: string; results: SearchResult[] };

export class SearchRegistry {
  readonly providers: readonly SearchProvider[];

  constructor(providers: SearchProvider[]) {
    const ids = new Set<string>();
    for (const provider of providers) {
      if (ids.has(provider.id)) throw new Error(`SearchProvider id 重复：${provider.id}`);
      ids.add(provider.id);
    }
    this.providers = providers;
  }

  async search(query: string, context: SearchContext): Promise<SearchResultGroup[]> {
    const normalized = query.trim();
    if (!normalized) return [];
    const available = this.providers.filter((provider) => provider.canSearch(context));
    const groups = await Promise.all(available.map(async (provider) => ({
      providerId: provider.id,
      label: provider.label,
      results: (await provider.search(normalized, context)).filter((result) => result.providerId === provider.id && (provider.canAccessResult?.(result, context) ?? true)),
    })));
    return groups.filter((group) => group.results.length > 0);
  }

  filterAccessible(results: SearchResult[], context: SearchContext): SearchResult[] {
    const providers = new Map(this.providers.map((provider) => [provider.id, provider]));
    return results.filter((result) => {
      const provider = providers.get(result.providerId);
      return Boolean(provider?.canSearch(context) && (provider.canAccessResult?.(result, context) ?? true));
    });
  }
}

export function nextSearchResultIndex(current: number, direction: 1 | -1, resultCount: number): number {
  if (resultCount <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : resultCount - 1;
  return (current + direction + resultCount) % resultCount;
}
