import type { Pool } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import type { AinuokeColorMirrorInput, AinuokeContractMirrorInput } from "./model.js";
import { createAinuokeSalesOrder } from "./service.js";

export type SalesOrderBootstrapDryRunCandidate = {
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
  firstOrderNo: string | null;
  lastOrderNo: string | null;
  orderNumberDuplicates: number;
  uuidDuplicates: number;
  clientOverrideRejected: boolean;
  mutationRejected: boolean;
  rollbackNumberReuse: boolean;
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
    firstOrderNo: null,
    lastOrderNo: null,
    orderNumberDuplicates: 0,
    uuidDuplicates: 0,
    clientOverrideRejected: false,
    mutationRejected: false,
    rollbackNumberReuse: false,
    idempotencyPassed: false,
    rollbackPassed: false,
  };
  const createdBySource = new Map<string, { id: string; orderNo: string; version: number }>();
  const logCountBefore = (await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM operation_logs")).rows[0].count;

  for (const [index, candidate] of candidates.entries()) {
    try {
      const created = await createAinuokeSalesOrder(pool, actor, {
        source: candidate.source,
        colors: candidate.colors,
        ...(index === 0 ? { orderNo: "SO-99999999" } : {}),
      } as Parameters<typeof createAinuokeSalesOrder>[2] & { orderNo?: string });
      if (created.created) {
        result.created += 1;
        createdBySource.set(candidate.source.sourceId, {
          id: created.salesOrder.id,
          orderNo: created.salesOrder.orderNo,
          version: created.salesOrder.version,
        });
      }
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
          source: candidate.source,
          colors: candidate.colors,
        });
        const original = createdBySource.get(candidate.source.sourceId);
        if (!duplicate.created
          && original
          && duplicate.salesOrder.id === original.id
          && duplicate.salesOrder.orderNo === original.orderNo
          && duplicate.salesOrder.version === original.version) result.idempotent += 1;
        else result.rejected += 1;
      } catch (error) {
        result.rejected += 1;
        if (isSourceLinkConflict(error)) result.sourceLinkConflicts += 1;
        if (isSchemaRejection(error)) result.schemaRejections += 1;
      }
    }
  }

  const createdRows = await pool.query<{ id: string; order_no: string }>(
    "SELECT id::text, order_no FROM sales_orders ORDER BY order_no ASC",
  );
  result.firstOrderNo = createdRows.rows.at(0)?.order_no ?? null;
  result.lastOrderNo = createdRows.rows.at(-1)?.order_no ?? null;
  result.orderNumberDuplicates = createdRows.rows.length - new Set(createdRows.rows.map((row) => row.order_no)).size;
  result.uuidDuplicates = createdRows.rows.length - new Set(createdRows.rows.map((row) => row.id)).size;
  result.clientOverrideRejected = createdRows.rows.every((row) => row.order_no !== "SO-99999999");
  const mutationTarget = createdRows.rows.at(0);
  if (mutationTarget) {
    try {
      await pool.query(
        "UPDATE sales_orders SET order_no = 'SO-99999998', version = version + 1 WHERE id = $1::uuid",
        [mutationTarget.id],
      );
    } catch (error) {
      result.mutationRejected = (error as DatabaseError).code === "23514";
    }
  } else {
    result.mutationRejected = true;
  }

  if (candidates.length > 0) {
    const probe = candidates[0];
    const rollbackSourceId = `${probe.source.sourceId}:preview-rollback-probe`;
    try {
      await createAinuokeSalesOrder(pool, actor, {
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
    const consumed = await pool.query<{ last_value: string }>("SELECT last_value::text FROM sales_order_number_seq");
    const probeClient = await pool.connect();
    try {
      await probeClient.query("BEGIN");
      const afterRollback = await probeClient.query<{ order_no: string }>(
        "INSERT INTO sales_orders(creation_source) VALUES ('manual') RETURNING order_no",
      );
      result.rollbackNumberReuse = afterRollback.rows[0].order_no === `SO-${consumed.rows[0].last_value.padStart(8, "0")}`;
      await probeClient.query("ROLLBACK");
    } finally {
      probeClient.release();
    }
    const residue = await pool.query<{ count: number }>(
      `SELECT (
        (SELECT count(*) FROM sales_order_source_links WHERE external_id = $1)
        + (SELECT count(*) FROM ainuoke_sales_order_contract_mirrors WHERE source_id = $1)
        + ((SELECT count(*) FROM sales_orders) - $2::int)
      )::int AS count`,
      [rollbackSourceId, candidates.length],
    );
    result.rollbackPassed = result.rolledBack === 1 && residue.rows[0].count === 0;
  } else {
    result.rollbackPassed = true;
  }

  const logCountAfter = (await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM operation_logs")).rows[0].count;
  result.operationLogs = logCountAfter - logCountBefore;
  result.idempotencyPassed = result.idempotent === candidates.length
    && result.created === candidates.length
    && result.operationLogs === candidates.length
    && result.orderNumberDuplicates === 0
    && result.uuidDuplicates === 0
    && result.clientOverrideRejected;
  return result;
}
