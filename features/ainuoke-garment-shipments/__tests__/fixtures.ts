import { buildGarmentObservationSnapshot } from "../../../server/ainuoke-source/garment-shipment-observations.js";
import { hash } from "../../../server/ainuoke-source/contract.js";
import type { GarmentObservedView } from "../model.js";

export const orderId = "11111111-2222-4333-8444-555555555555", publicationId = "22222222-3333-4444-8555-666666666666", contract = "SYN-SC-READ";
export const start = Date.parse("2026-10-21T10:00:00.000Z");
export function observed(total = 127, freshnessMs = 60000): GarmentObservedView {
  const scope = { sourceFingerprint: "a".repeat(64), salesContractNo: contract };
  const page = (pass: number, number: number) => ({ schemaVersion: "ainuoke-garment-shipment-page.v1", reportId: "6086979", sourceFingerprint: scope.sourceFingerprint,
    queryContext: { match: "exact", salesContractNo: contract }, capturedAt: new Date(start + pass * 1000 + number).toISOString(),
    page: number, pageSize: 100, reportedTotal: total, rawResponseSha256: hash([pass, number]),
    rows: Array.from({ length: Math.min(100, Math.max(0, total - (number - 1) * 100)) }, (_, index) => ({
      id: "SYN-" + ((number - 1) * 100 + index), ExpContractNo: contract, billno: "SYN-OUT-1", CnColor: "蓝色", QtyUnit: "件",
      Num: "9007199254740993.000000000001", outdate: "2026-10-11", FDate: "2026-10-07", indate: "2026-10-07",
      wxprice: "PRIVATE-PRICE", remark: "PRIVATE-NOTES" })) });
  const pages = Math.max(1, Math.ceil(total / 100));
  const input = { schemaVersion: "ainuoke-garment-shipment-input.v1", firstPass: Array.from({ length: pages }, (_, i) => page(1, i + 1)),
    secondPass: Array.from({ length: pages }, (_, i) => page(2, i + 1)) };
  const snapshot = buildGarmentObservationSnapshot(input, scope, start + 5000);
  return { ...snapshot, schemaVersion: "order-garment-shipments.v1", salesOrderId: orderId, sourceReportId: "6086979",
    sourceStatus: total ? "observed" : "observed_empty", publicationId, generation: 1, freshness: freshnessMs > 3999 ? "fresh" : "stale",
    evaluatedAt: new Date(start + 5000).toISOString(), expiresAt: new Date(Date.parse(snapshot.observedFrom) + freshnessMs).toISOString(),
    targetPolicyChanged: false, colorBasisChanged: false, rows: snapshot.rows.map(row => ({ ...row,
      colorMatch: { state: "matched", orderColorId: "33333333-4444-4555-8666-777777777777", orderColorName: "蓝色" } })) };
}
