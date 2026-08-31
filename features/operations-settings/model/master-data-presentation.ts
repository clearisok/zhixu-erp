import type { ProductionGroup } from "./operations-settings";

const productionGroupCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

export function productionGroupsForMasterData(items: ProductionGroup[], query = ""): ProductionGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  return items
    .filter((item) => !needle || [item.name, item.shortName, item.remark].some((value) => value.toLocaleLowerCase().includes(needle)))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || productionGroupCollator.compare(a.name, b.name) || a.id.localeCompare(b.id));
}
