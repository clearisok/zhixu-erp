import { hash } from "./contract.js";

/** The bounded collector's actual request, never a general pagination fallback. */
export function garmentFirstPageRequest(salesContractNo: string) {
  return { reportId: 6086979, sqlCdtn: { targetId: 6086979, entId: 6086979, currentPage: 1, pageIndex: 1,
    pageSize: 100, targetType: 1, conditionList: [{ conditionRelation: "and", cuHaiType: 0, dbTableName: "",
      fieldName: "ExpContractNo", compareType: "is", dataType: "varchar", dataTypeId: 2, valueType: 1,
      dealWithType: 0, compareValue: salesContractNo, flowName: "[内层]" }], sqlParamList: [], orderFieldList: [] },
    isFirstTime: true, isIniPage: false };
}

export type GarmentFirstPageEvidence = {
  schemaVersion: "ainuoke-garment-first-page-evidence.v1"; reportRequestNumber: 1 | 2;
  requestBodySha256: string; responsePageIndex: 0 | 1; responsePageSize: 0 | 100;
};

/** Preserve the response sentinel as evidence. Only the paired 0/0 sentinel is
 * compatible with a proven, complete first-page request; mixed values fail. */
export function checkedGarmentFirstPageEvidence(input: unknown, salesContractNo: string, reportRequestNumber: number): GarmentFirstPageEvidence {
  const fail = (): never => { throw new Error("shipment_observation_invalid_paging_evidence"); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join(",") !== "reportRequestNumber,requestBodySha256,responsePageIndex,responsePageSize,schemaVersion"
    || value.schemaVersion !== "ainuoke-garment-first-page-evidence.v1" || ![1, 2].includes(reportRequestNumber)
    || value.reportRequestNumber !== reportRequestNumber || value.requestBodySha256 !== hash(garmentFirstPageRequest(salesContractNo))
    || !(value.responsePageIndex === 1 && value.responsePageSize === 100 || value.responsePageIndex === 0 && value.responsePageSize === 0)) return fail();
  return { schemaVersion: "ainuoke-garment-first-page-evidence.v1", reportRequestNumber: reportRequestNumber as 1 | 2,
    requestBodySha256: value.requestBodySha256 as string, responsePageIndex: value.responsePageIndex as 0 | 1,
    responsePageSize: value.responsePageSize as 0 | 100 };
}
