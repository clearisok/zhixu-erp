import type { SourceBundle } from "../ainuoke-source/contract.js";
import { createSyntheticMaterialSource, syntheticOrder, syntheticFetchedAt } from "../../features/ainuoke-material-progress/synthetic-source.js";
export { syntheticOrder, syntheticFetchedAt };
export function bundle(): SourceBundle {
    const pages = createSyntheticMaterialSource()!;
    for (const row of pages[0].rows)
        Object.assign(row.values, { cydh: "SHIP-" + row.values.id, cyrq: "2026-10-09", CYNum: 3, ckdh: "OUT-" + row.values.id, ckrq: "2026-10-09", OutStoreNum: 2, cgprice: 12.75, goodsamount: 255, CurrencyName: "CNY", customerConfirmedPrice: "protected-commercial-sentinel" });
    const discovery: SourceBundle["discoveryBefore"] = [{ schemaVersion: "ainuoke-direct-read.v2", reportId: "6086103", fetchedAt: syntheticFetchedAt, page: 1, pageSize: 50, total: 1, queryContext: {}, snapshotHash: "synthetic-discovery",
            rows: [{ sourceRowIdentity: "synthetic-discovery-1", values: { id: "synthetic-1", BillNo: syntheticOrder.salesContractNo, InsideOrderNo: "SYNTHETIC-IN-OLD", Status: "生效", GoodsDesc: syntheticOrder.styleNo } }] }];
    return { schemaVersion: "ainuoke-server-source.v1", discoveryBefore: discovery, discoveryAfter: structuredClone(discovery), materials: { [syntheticOrder.salesContractNo]: pages } };
}
