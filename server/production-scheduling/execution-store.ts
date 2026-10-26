import type { PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { canonicalDecimal } from "../quotes/decimal-projection.js";
import { parseExecutionData } from "./execution-contract.js";
import type { ExecutionFacts } from "./execution-preview.js";
import { planFail, type StoredAssignment } from "./repository.js";

export type StoredExecution = ExecutionFacts & {
  assignmentId: string; orderId: string; assignmentVersion: number;
  attribution: { assignmentId: string; orderId: string; executionType: "internal" | "outsource";
    productionGroupId: string | null; outsourceFactoryId: string | null; colorId: string | null; colorNameSnapshot: string | null; resourceSnapshotHash: string };
  createdAt: string; updatedAt: string;
};
type ExecutionRow = Omit<StoredExecution, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date; attributionValid: boolean };
export async function productionExecutionsAvailable(client: PoolClient) {
  const result = (await client.query<{ ready: boolean }>("SELECT to_regclass('production_schedule_executions') IS NOT NULL AND to_regclass('production_schedule_execution_versions') IS NOT NULL AND to_regclass('production_schedule_execution_epochs') IS NOT NULL ready")).rows[0];
  if (!result?.ready) planFail(503, "production_executions_unavailable");
}
/** One batch query, never current master names or commercial terms. */
export async function executionsForAssignments(client: PoolClient, ids: readonly string[]): Promise<Record<string, StoredExecution>> {
  // A plan edit may observe its order and both old/new bounded queues.
  if (ids.length > 1500) planFail(422, "production_execution_projection_limit");
  if (!ids.length) return {};
  const rows = (await client.query<ExecutionRow>(`SELECT e.assignment_id::text AS "assignmentId",e.sales_order_id::text AS "orderId",e.version,
    e.assignment_version AS "assignmentVersion",e.attribution,e.status,e.completed_quantity::text AS "completedQuantity",
    e.actual_start_date::text AS "actualStartDate",e.actual_completed_date::text AS "actualCompletedDate",e.created_at AS "createdAt",e.updated_at AS "updatedAt",
    e.attribution=production_execution_attribution(a) AS "attributionValid"
    FROM production_schedule_executions e JOIN production_schedule_assignments a ON a.id=e.assignment_id WHERE e.assignment_id=ANY($1::uuid[])`, [ids])).rows;
  return Object.fromEntries(rows.map(row => {
    if (!row.attributionValid || !Number.isSafeInteger(row.version) || row.version < 1 || !Number.isSafeInteger(row.assignmentVersion) || row.assignmentVersion < 1) planFail(503, "production_execution_snapshot_invalid");
    let data;
    try { data = parseExecutionData({ status: row.status, completedQuantity: canonicalDecimal(row.completedQuantity), actualStartDate: row.actualStartDate, actualCompletedDate: row.actualCompletedDate }); }
    catch { return planFail(503, "production_execution_snapshot_invalid"); }
    const result: StoredExecution = { ...data, assignmentId: row.assignmentId, orderId: row.orderId, version: row.version,
      assignmentVersion: row.assignmentVersion, attribution: row.attribution, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
    return [row.assignmentId, result];
  }));
}
export const executionFacts = (row: StoredExecution | null | undefined): ExecutionFacts | null => row ? {
  version: row.version, status: row.status, completedQuantity: row.completedQuantity, actualStartDate: row.actualStartDate, actualCompletedDate: row.actualCompletedDate,
} : null;
export async function persistExecution(client: PoolClient, assignment: StoredAssignment, before: StoredExecution | null,
  after: ExecutionFacts, actor: TrustedIdentity, requestId: string, operationId: string, reason: string) {
  if (before === null) {
    await client.query(`INSERT INTO production_schedule_executions(assignment_id,sales_order_id,version,assignment_version,attribution,status,completed_quantity,actual_start_date,actual_completed_date,created_by,updated_by)
      SELECT a.id,a.sales_order_id,$2,a.version,production_execution_attribution(a),$3,$4,$5,$6,$7,$7 FROM production_schedule_assignments a WHERE a.id=$1`,
    [assignment.id, after.version, after.status, after.completedQuantity, after.actualStartDate, after.actualCompletedDate, actor.internalUserId]);
  } else {
    const saved = await client.query(`UPDATE production_schedule_executions SET version=$2,assignment_version=$3,status=$4,completed_quantity=$5,actual_start_date=$6,actual_completed_date=$7,updated_by=$8,updated_at=now()
      WHERE assignment_id=$1 AND version=$9`, [assignment.id, after.version, assignment.version, after.status, after.completedQuantity, after.actualStartDate, after.actualCompletedDate, actor.internalUserId, before.version]);
    if (saved.rowCount !== 1) planFail(409, "production_execution_version_conflict");
  }
  await client.query(`INSERT INTO production_schedule_execution_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason)
    SELECT assignment_id,sales_order_id,version,production_execution_row_snapshot(e),$2,$3,$4,$5 FROM production_schedule_executions e WHERE assignment_id=$1`,
  [assignment.id, actor.internalUserId, requestId, operationId, reason]);
  return (await executionsForAssignments(client, [assignment.id]))[assignment.id];
}
