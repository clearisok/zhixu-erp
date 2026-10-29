import { createHash } from "node:crypto";
import { accountFingerprint, parseCollectorConfig } from "../ainuoke-source/collector.js";
import { hash } from "../ainuoke-source/contract.js";
import type { GarmentCollectionRequest } from "../ainuoke-source/garment-collection-control.js";
import type { GarmentObservationScope } from "../ainuoke-source/garment-shipment-observations.js";
import { garmentFirstPageRequest } from "../ainuoke-source/garment-first-page.js";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const configFor = (operatorUsername = "garment.collector", sourceKey = "synthetic-garment-collection") => parseCollectorConfig({
  sourceKey, baseUrl: "http://61.164.81.194:9043", transportPolicy: "user-approved-http-d109", username: "synthetic-collection-account",
  password: "Synthetic-Collection-Private-Only", operatorUsername });
export const sourceRow = (salesContractNo: string, patch: Record<string, unknown> = {}) => ({ id: "SYN-WITNESS", billno: "SYN-D1",
  ExpContractNo: salesContractNo, insideorderno: "D1933", CnColor: "合成蓝", QtyUnit: "件", Num: "9007199254740993.000000000001",
  outdate: "2026-10-11", ...patch });
export function rawPage(rows: unknown[], patch: Record<string, unknown> = {}) {
  return JSON.stringify({ reObj: { isOk: true }, dataList: JSON.stringify({ rows, total: rows.length }), dataCount: rows.length,
    pageIndex: 1, pageSize: 100, reportObj: JSON.stringify({ reportId: 6086979, cellList: [] }), ...patch });
}
export function collectionRequest(orderId: string, salesContractNo: string, now: number, operatorUsername = "garment.collector"): GarmentCollectionRequest {
  const config = configFor(operatorUsername), positive = rawPage([sourceRow(salesContractNo)]);
  const selection = { schemaVersion: "ainuoke-garment-filter-selection.v1" as const, sourceFingerprint: accountFingerprint(config),
    candidateSha256: hash("synthetic-candidate"), rawResponseSha256: digest(positive), toolingCommit: "c".repeat(40), salesContractNo,
    witness: { id: "SYN-WITNESS", billno: "SYN-D1" } };
  return { config, salesOrderId: orderId, verification: { selection, checkedAt: new Date(now).toISOString(),
    evidence: { schemaVersion: "ainuoke-garment-filter-evidence.v1", result: "complete", code: null, workerStage: "validation",
      selectionHash: hash(selection), httpAttempts: 4, reportRequests: 3,
      pages: [positive, rawPage([]), positive].map((text, i) => ({ sequence: i + 1, alias: i === 1 ? "C0" : "C1",
        capturedAt: new Date(now - 2000 + 1000 * i).toISOString(), rawReportResponse: text, rawResponseSha256: digest(text) })) } } };
}
export function workerFrame(scope: GarmentObservationScope, now: number, rows = [sourceRow(scope.salesContractNo)]) {
  return { schemaVersion: "ainuoke-garment-collection-worker.v1", result: "complete", counts: { httpAttempts: 3, reportRequests: 2 },
    captures: [0, 1].map(i => { const text = rawPage(rows); return { schemaVersion: "ainuoke-garment-shipment-capture.v1", reportId: "6086979",
      sourceFingerprint: scope.sourceFingerprint, queryContext: { match: "exact", salesContractNo: scope.salesContractNo }, page: 1, pageSize: 100,
      capturedAt: new Date(now - 20 + i * 10).toISOString(), rawResponseSha256: digest(text), rawReportResponse: text }; }) };
}
export function workerFrameV2(scope: GarmentObservationScope, now: number, rows = [sourceRow(scope.salesContractNo)], sentinel = true) {
  const frame = workerFrame(scope, now, rows);
  return { ...frame, captures: frame.captures.map((cap, i) => {
    const text = rawPage(rows, sentinel ? { pageIndex: 0, pageSize: 0 } : {});
    return { ...cap, schemaVersion: "ainuoke-garment-shipment-capture.v2", rawReportResponse: text, rawResponseSha256: digest(text),
      executedRequest: { reportRequestNumber: i + 1, body: garmentFirstPageRequest(scope.salesContractNo) } };
  }) };
}
