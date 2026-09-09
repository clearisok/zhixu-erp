import type { RawCellValue } from "../model/style-progress.ts";

export type MaterialSemanticField =
  | "styleNo" | "materialType" | "companyHeader" | "salesContractNo" | "brand" | "salesperson" | "owner" | "factoryStyleNo"
  | "garmentColors" | "relatedGarmentColors" | "garmentQuantity" | "customerName" | "contractDeliveryDate"
  | "materialCode" | "materialName" | "sourceActualName" | "plannedConsumption" | "lossRate" | "totalConsumption" | "width" | "gsm"
  | "materialColor" | "specification" | "supplyMethod" | "requiredQuantity" | "sampleQuantity"
  | "purchaseOrderNo" | "purchaseDate" | "supplier" | "purchaseEntity" | "sourceMaterialDueDate" | "currency" | "purchaser"
  | "purchasedMaterialName" | "invoiceName" | "purchaseActualName" | "purchaseSpecification" | "purchaseColor" | "purchaseQuantity"
  | "purchaseSampleQuantity" | "purchaseUnitPrice" | "purchaseAmount" | "purchaseExtraCost"
  | "inboundDocumentNo" | "inboundDate" | "inboundQuantity" | "shipmentDocumentNo" | "shipmentDate" | "transportMode" | "shipmentQuantity"
  | "outboundQuantity" | "outboundDocumentNo" | "outboundDate" | "actualConsumption";

export type MaterialExcelSourceTrace = {
  sourceKind: "excel";
  fileHash: string;
  fileName: string;
  sheetName: string;
  sourceRow: number;
};

export type MaterialApiSourceTrace = {
  sourceKind: "api";
  reportId: "6087050";
  sourceRowIdentity: string;
  snapshotHash: string;
  fetchedAt: string;
  queryContext: { insideOrderNo: string };
  sourceSchemaVersion: "ainuoke-direct-read.v2";
};

export type MaterialSourceTrace = MaterialExcelSourceTrace | MaterialApiSourceTrace;

export type MaterialSourceRow = {
  trace: MaterialSourceTrace;
  rawFields: Record<string, RawCellValue>;
  values: Partial<Record<MaterialSemanticField, unknown>>;
};

export type MaterialNormalizedSourceRow = MaterialSourceRow & {
  id: string;
  normalizedDemandId: string | null;
  validationIssues: string[];
};
