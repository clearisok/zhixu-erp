import type { Pool } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import type { AinuokeColorMirrorInput, AinuokeContractMirrorInput } from "./model.js";
import { createAinuokeSalesOrder } from "./service.js";

export type SalesOrderBootstrapDryRunCandidate = {
  previewOnlyOrderNo: string;
  source: AinuokeContractMirrorInput;
  colors: readonly AinuokeColorMirrorInput[];
};

export type SalesOrderBootstrapDryRunResult = {
  planned: number;
  created: number;
  rejected: number;
  rolledBack: number;
  idempotent: number;
  sourceLinkConflicts: number;
  schemaRejections: number;
  operationLogs: number;
  idempotencyPassed: boolean;
  rollbackPassed: boolean;
};

type DatabaseError = Error & { code?: string; constraint?: string };

function isSourceLinkConflict(error: unknown): boolean {
  const databaseError = error as DatabaseError;
  return databaseError.code === "23505" && String(databaseError.constraint ?? "").includes("source");
}

function isSchemaRejection(error: unknown): boolean {
  return /^23/u.test((error as DatabaseError).code ?? "");
}

export async function runSalesOrderBootstrapDryRun(
  pool: Pool,
  actor: TrustedIdentity,
  candidates: readonly SalesOrderBootstrapDryRunCandidate[],
): Promise<SalesOrderBootstrapDryRunResult> {
  const result: SalesOrderBootstrapDryRunResult = {
    planned: candidates.length,
    created: 0,
    rejected: 0,
    rolledBack: 0,
    idempotent: 0,
    sourceLinkConflicts: 0,
    schemaRejections: 0,
    operationLogs: 0,
    idempotencyPassed: false,
    rollbackPassed: false,
  };
  const logCountBefore = (await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM operation_logs")).rows[0].count;

  for (const candidate of candidates) {
    try {
      const created = await createAinuokeSalesOrder(pool, actor, {
        orderNo: candidate.previewOnlyOrderNo,
        source: candidate.source,
        colors: candidate.colors,
      });
      if (created.created) result.created += 1;
      else result.idempotent += 1;
    } catch (error) {
      result.rejected += 1;
      if (isSourceLinkConflict(error)) result.sourceLinkConflicts += 1;
      if (isSchemaRejection(error)) result.schemaRejections += 1;
    }
  }

  if (result.rejected === 0) {
    for (const candidate of candidates) {
      try {
        const duplicate = await createAinuokeSalesOrder(pool, actor, {
          orderNo: `${candidate.previewOnlyOrderNo}-DUPLICATE-MUST-NOT-CREATE`,
          source: candidate.source,
          colors: candidate.colors,
        });
        if (!duplicate.created) result.idempotent += 1;
        else result.rejected += 1;
      } catch (error) {
        result.rejected += 1;
        if (isSourceLinkConflict(error)) result.sourceLinkConflicts += 1;
        if (isSchemaRejection(error)) result.schemaRejections += 1;
      }
    }
  }

  if (candidates.length > 0) {
    const probe = candidates[0];
    const rollbackSourceId = `${probe.source.sourceId}:preview-rollback-probe`;
    const rollbackOrderNo = "PREVIEW-ROLLBACK-PROBE";
    try {
      await createAinuokeSalesOrder(pool, actor, {
        orderNo: rollbackOrderNo,
        source: {
          ...probe.source,
          sourceId: rollbackSourceId,
          sourceRowIdentity: `${probe.source.sourceRowIdentity}:preview-rollback-probe`,
          salesContractNo: `${probe.source.salesContractNo}-ROLLBACK-PROBE`,
          insideOrderNo: `${probe.source.insideOrderNo}-ROLLBACK-PROBE`,
        },
        colors: [{
          sourceLineIdentity: "preview-rollback-probe",
          colorName: "ROLLBACK-PROBE",
          quantity: -1,
          deliveryDate: null,
          sourceHash: "preview-rollback-probe",
        }],
      });
      result.rejected += 1;
    } catch (error) {
      if (isSchemaRejection(error)) result.rolledBack += 1;
      else result.rejected += 1;
    }
    const residue = await pool.query<{ count: number }>(
      `SELECT (
        (SELECT count(*) FROM sales_orders WHERE order_no = $1)
        + (SELECT count(*) FROM sales_order_source_links WHERE external_id = $2)
      )::int AS count`,
      [rollbackOrderNo, rollbackSourceId],
    );
    result.rollbackPassed = result.rolledBack === 1 && residue.rows[0].count === 0;
  } else {
    result.rollbackPassed = true;
  }

  const logCountAfter = (await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM operation_logs")).rows[0].count;
  result.operationLogs = logCountAfter - logCountBefore;
  result.idempotencyPassed = result.idempotent === candidates.length
    && result.created === candidates.length
    && result.operationLogs === candidates.length;
  return result;
}
