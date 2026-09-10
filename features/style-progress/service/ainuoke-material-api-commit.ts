import { createOperationLogDraft, type OperationLogActor } from "../../operation-logs/model/operation-log.ts";
import type { OperationLogRepository } from "../../operation-logs/repository/operation-log-repository.ts";
import { emptyStyleProgressData, type MaterialImportCommitReport, type MaterialImportPreview, type MaterialRawSnapshot } from "../model/style-progress.ts";
import type { StyleProgressRepository } from "../repository/style-progress-repository.ts";
import { createAinuokeMaterialSourceArtifactHash, type AinuokeMaterialApiPreview } from "./ainuoke-material-api-preview.ts";

export type AinuokeMaterialApiCommitResult = {
  batchId: string;
  sourceArtifactHash: string;
  report: MaterialImportCommitReport;
};

type CommitDependencies = {
  styleProgress: Pick<StyleProgressRepository, "commitImport">;
  operationLogs: Pick<OperationLogRepository, "append">;
};

function assertCommitReady(preview: AinuokeMaterialApiPreview): void {
  if (preview.source.reportId !== "6087050" || preview.source.sourceSchemaVersion !== "ainuoke-direct-read.v2") {
    throw new Error("6087050 API Preview source contract 不受支持");
  }
  const readCount = preview.source.pages.reduce((sum, page) => sum + page.rowCount, 0);
  if (readCount < preview.source.reportedTotal) throw new Error("6087050 API Snapshot 分页不完整，禁止导入");
  if (new Set(preview.source.pages.map((page) => page.total)).size !== 1) throw new Error("6087050 API Snapshot 分页 total 不一致，禁止导入");
  if (preview.source.sourceIdentityCollisions !== 0) throw new Error("6087050 API Snapshot 存在 source identity collision，禁止导入");
  if (preview.summary.rejectedRows !== 0 || preview.summary.errors.length !== 0) throw new Error("6087050 API Preview 存在阻断校验错误，禁止导入");
  if (preview.pipeline.rawRows.length !== preview.source.uniqueSourceIdentityCount) throw new Error("6087050 API Preview Source Trace 不完整，禁止导入");
  const apiRows = preview.pipeline.rawRows.map((row) => {
    if (row.trace.sourceKind !== "api") throw new Error("6087050 API Preview 含非 API Source Trace");
    return row as typeof row & { trace: Extract<typeof row.trace, { sourceKind: "api" }> };
  });
  const computedArtifactHash = createAinuokeMaterialSourceArtifactHash({
    reportId: preview.source.reportId,
    sourceSchemaVersion: preview.source.sourceSchemaVersion,
    insideOrderNo: preview.source.query.insideOrderNo,
    rows: apiRows,
  });
  if (computedArtifactHash !== preview.sourceArtifactHash) throw new Error("6087050 API Preview 已变化，请重新预检");
  const batchReferences = [
    ...preview.pipeline.demands.map((item) => item.lastImportBatchId),
    ...preview.pipeline.purchaseEvents.map((item) => item.importBatchId),
    ...preview.pipeline.inboundEvents.map((item) => item.importBatchId),
    ...preview.pipeline.shipmentEvents.map((item) => item.importBatchId),
    ...preview.pipeline.outboundEvents.map((item) => item.importBatchId),
  ];
  if (batchReferences.some((batchId) => batchId !== preview.importBatchId)) throw new Error("6087050 API Preview batch identity 不一致，禁止导入");
}

export function toAinuokeMaterialImportPreview(preview: AinuokeMaterialApiPreview, actorName: string): MaterialImportPreview {
  assertCommitReady(preview);
  const affectedSalesContractNos = [...new Set(preview.pipeline.demands.map((item) => item.salesContractNo))].sort();
  if (!affectedSalesContractNos.length) throw new Error("6087050 API Preview 没有可提交的 operational contract scope");
  const batch = {
    id: preview.importBatchId,
    sourceKind: "api" as const,
    sourceArtifactHash: preview.sourceArtifactHash,
    reportId: "6087050" as const,
    snapshotHashes: preview.source.pages.map((page) => page.snapshotHash),
    fetchedAt: preview.source.fetchedAt,
    queryContext: { insideOrderNo: preview.source.query.insideOrderNo },
    sourceSchemaVersion: preview.source.sourceSchemaVersion,
    ...preview.pipeline.stats,
    status: "preview" as const,
    createdAt: preview.source.fetchedAt,
    createdBy: actorName,
    committedAt: null,
  };
  const rawSnapshots: MaterialRawSnapshot[] = preview.pipeline.rawRows.map((row) => {
    if (row.trace.sourceKind !== "api") throw new Error("6087050 API Preview 含非 API Source Trace");
    return {
      id: row.id,
      importBatchId: preview.importBatchId,
      sourceKind: "api",
      sourceArtifactHash: preview.sourceArtifactHash,
      reportId: row.trace.reportId,
      sourceRowIdentity: row.trace.sourceRowIdentity,
      snapshotHash: row.trace.snapshotHash,
      fetchedAt: row.trace.fetchedAt,
      queryContext: { ...row.trace.queryContext },
      sourceSchemaVersion: row.trace.sourceSchemaVersion,
      rawFields: structuredClone(row.rawFields),
      normalizedDemandId: row.normalizedDemandId,
      validationIssues: [...row.validationIssues],
    };
  });
  return {
    ...emptyStyleProgressData(),
    batch,
    batches: [batch],
    rawSnapshots,
    demands: structuredClone(preview.pipeline.demands),
    purchaseEvents: structuredClone(preview.pipeline.purchaseEvents),
    inboundEvents: structuredClone(preview.pipeline.inboundEvents),
    shipmentEvents: structuredClone(preview.pipeline.shipmentEvents),
    outboundEvents: structuredClone(preview.pipeline.outboundEvents),
    replaceSourceScope: {
      sourceKind: "api",
      reportId: "6087050",
      queryContext: { insideOrderNo: preview.source.query.insideOrderNo },
      affectedSalesContractNos,
    },
  };
}

export async function commitAinuokeMaterialApiPreview(input: {
  preview: AinuokeMaterialApiPreview;
  canImport: boolean;
  actor: OperationLogActor;
  repositories: CommitDependencies;
}): Promise<AinuokeMaterialApiCommitResult> {
  if (!input.canImport) throw new Error("缺少 style_progress.import 权限，不能导入艾诺科物料 API Preview");
  const materialImport = toAinuokeMaterialImportPreview(input.preview, input.actor.userName);
  const report = await input.repositories.styleProgress.commitImport(materialImport);
  if (!report.duplicateFile) {
    await input.repositories.operationLogs.append(createOperationLogDraft({
      actor: input.actor,
      module: "款式进度",
      entityType: "MaterialImportBatch",
      entityId: materialImport.batch.id,
      action: "导入面辅料跟进",
      afterData: {
        objectName: `6087050 / ${input.preview.source.query.insideOrderNo}`,
        values: {
          来源: "艾诺科 Direct API",
          报表: "6087050",
          InsideOrderNo: input.preview.source.query.insideOrderNo,
          Source行: input.preview.source.sourceRowCount,
          有效行: input.preview.summary.normalizedRows,
          物料需求: input.preview.summary.demands,
          采购事件: input.preview.summary.purchaseEvents,
          入库事件: input.preview.summary.inboundEvents,
          出运事件: input.preview.summary.shipmentEvents,
          出库事件: input.preview.summary.outboundEvents,
        },
      },
    }));
  }
  return { batchId: materialImport.batch.id, sourceArtifactHash: input.preview.sourceArtifactHash, report };
}
