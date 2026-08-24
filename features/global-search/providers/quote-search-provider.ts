import { getDefaultRevision } from "../../quote-center/model/quote-view-model.ts";
import { matchesQuoteSearch } from "../../quote-center/model/quote-workflows.ts";
import type { QuoteRepository } from "../../quote-center/repository/quote-repository";
import type { SearchProvider, SearchResult } from "../model/global-search";

const score = (result: SearchResult, query: string) => {
  const needle = query.trim().toLocaleLowerCase();
  const title = result.title.toLocaleLowerCase();
  if (title === needle) return 0;
  if (title.startsWith(needle)) return 1;
  return 2;
};

export function createQuoteSearchProvider(repository: QuoteRepository): SearchProvider {
  return {
    id: "quotes",
    label: "报价",
    canSearch: (context) => context.can("quote.view"),
    async search(query) {
      const quotes = await repository.list();
      return quotes.flatMap((quote): SearchResult[] => {
        const revision = getDefaultRevision(quote);
        const searchable = [quote.quoteCode, revision.baseInfo.quoteStyleNo, revision.baseInfo.styleName, revision.baseInfo.brandName, revision.baseInfo.salespersonName].join(" ");
        if (!matchesQuoteSearch(searchable, query)) return [];
        return [{
          id: `quote:${quote.id}`,
          providerId: "quotes",
          type: "quote",
          typeLabel: "报价",
          icon: "¥",
          title: revision.baseInfo.quoteStyleNo.trim() || "未填写款号",
          subtitle: revision.baseInfo.styleName.trim() || "未填写款式名称",
          meta: [
            { label: "品牌", value: revision.baseInfo.brandName.trim() || "未填写品牌" },
            { label: "业务员", value: revision.baseInfo.salespersonName.trim() || "未填写业务员" },
            { label: "当前版本", value: revision.revisionLabel },
          ],
          href: `/quote-center/detail?id=${encodeURIComponent(quote.id)}`,
        }];
      }).sort((left, right) => score(left, query) - score(right, query) || left.title.localeCompare(right.title, "zh-CN")).slice(0, 20);
    },
  };
}
