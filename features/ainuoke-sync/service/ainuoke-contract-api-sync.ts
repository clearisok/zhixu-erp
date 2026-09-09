import type { AinuokeReportSnapshot } from "../../ainuoke-api/model/ainuoke-api.ts";
import type { BasicSettingsState } from "../../basic-settings/model/basic-settings.ts";
import type { OperationLogActor, OperationLogDraft } from "../../operation-logs/model/operation-log.ts";
import type { SalesOrder } from "../../order-center/model/order.ts";
import type { OrderActor } from "../../order-center/service/order-service.ts";
import type { AinuokeImportRun, AinuokeSyncState } from "../model/ainuoke.ts";
import type { AinuokeRepository } from "../repository/ainuoke-repository.ts";
import { buildAinuokeMirrorFromApi, type AinuokeApiContractSourceMetadata } from "../source/ainuoke-contract-api-adapter.ts";
import { stableSourceHash } from "../source/ainuoke-contract-source.ts";
import { synchronizeAinuokeContracts, type AinuokeSyncResult } from "./ainuoke-sync-service.ts";

export type AinuokeContractApiPreview = {
  source: AinuokeApiContractSourceMetadata;
  sync: AinuokeSyncResult;
  dryRun: AinuokeImportRun;
};

export type AinuokeContractApiCommitRepositories = {
  orders: { saveAll(orders: SalesOrder[]): Promise<SalesOrder[]> };
  ainuoke: Pick<AinuokeRepository, "save">;
  operationLogs: { appendMany(logs: OperationLogDraft[]): Promise<unknown[]> };
};

function createApiImportRun(input: {
  source: AinuokeApiContractSourceMetadata;
  sync: AinuokeSyncResult;
  mode: "dry_run" | "commit";
  createdAt: string;
  createdBy: string;
}): AinuokeImportRun {
  const report = input.sync.report;
  return {
    id: `ainuoke-run-api-${stableSourceHash([input.mode, input.source.query.insideOrderNo, ...input.source.snapshotHashes, input.createdAt])}`,
    sourceKind: "api",
    sourceFiles: [],
    sourceHashes: input.sync.state.contracts.map((contract) => contract.sourceHash),
    reportIds: [...input.source.reportIds],
    query: { ...input.source.query },
    snapshotHashes: [...input.source.snapshotHashes],
    fetchedAt: input.source.fetchedAt,
    mode: input.mode,
    contractsSeen: report.contractsSeen,
    contractsChanged: report.updatedExistingCount + report.autoBoundCount + report.autoCreatedCount,
    colorRowsSeen: input.sync.state.contracts.reduce((sum, contract) => sum + contract.colorRows.length, 0),
    mismatchCount: report.mismatchCount,
    autoBoundCount: report.autoBoundCount,
    reviewCount: report.manualReviewCount,
    autoCreatedCount: report.autoCreatedCount,
    duplicatePreventedCount: report.duplicatePreventedCount,
    scheduleCount: 0,
    closingCount: 0,
    correctedDateCount: 0,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  };
}

export function buildAinuokeContractApiPreview(input: {
  contractSnapshots: AinuokeReportSnapshot[];
  colorSnapshots: AinuokeReportSnapshot[];
  state: AinuokeSyncState;
  orders: SalesOrder[];
  settings: BasicSettingsState;
  actor: OrderActor & OperationLogActor;
  timestamp?: string;
}): AinuokeContractApiPreview {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const source = buildAinuokeMirrorFromApi({
    contractSnapshots: input.contractSnapshots,
    colorSnapshots: input.colorSnapshots,
    aliases: input.settings.brandAliases.filter((alias) => alias.enabled).map((alias) => ({
      alias: alias.alias,
      canonicalName: input.settings.brands.find((brand) => brand.id === alias.brandId)?.name ?? alias.alias,
      enabled: alias.enabled,
    })),
    syncedAt: timestamp,
  });
  const sync = synchronizeAinuokeContracts({ state: input.state, contracts: source.contracts, orders: input.orders, settings: input.settings, actor: input.actor, timestamp });
  return { source: source.metadata, sync, dryRun: createApiImportRun({ source: source.metadata, sync, mode: "dry_run", createdAt: timestamp, createdBy: input.actor.userName }) };
}

export async function commitAinuokeContractApiPreview(input: {
  preview: AinuokeContractApiPreview;
  canSync: boolean;
  actorName: string;
  repositories: AinuokeContractApiCommitRepositories;
  timestamp?: string;
}): Promise<{ state: AinuokeSyncState; orders: SalesOrder[]; run: AinuokeImportRun }> {
  if (!input.canSync) throw new Error("缺少 ainuoke.sync 权限，不能确认同步");
  const timestamp = input.timestamp ?? new Date().toISOString();
  const run = createApiImportRun({ source: input.preview.source, sync: input.preview.sync, mode: "commit", createdAt: timestamp, createdBy: input.actorName });
  const state = { ...input.preview.sync.state, importRuns: [run, ...input.preview.sync.state.importRuns] };
  await input.repositories.orders.saveAll(input.preview.sync.orders);
  await input.repositories.ainuoke.save(state);
  await input.repositories.operationLogs.appendMany(input.preview.sync.operationLogs);
  return { state, orders: input.preview.sync.orders, run };
}
