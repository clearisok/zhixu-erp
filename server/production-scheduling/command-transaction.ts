import type { Pool, PoolClient } from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { readCurrentActor } from "../auth/current-actor.js";
import { requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { lockProductionResourceScope } from "../production-resources/snapshot-lock.js";
import { lockEffectiveAttribution } from "../sales-orders/effective-attribution.js";
import { executionRequiredPermissions, parseExecutionCommand } from "./execution-contract.js";
import { parsePlanCommand } from "./contract.js";
import { ORDER_TRACKING_WRITE_PERMISSIONS, parseOrderTrackingCommand } from "./tracking-contract.js";
import { planFail, planHash, productionPlansAvailable } from "./repository.js";

export type RejectedProductionCommand = { requestId: string; status: "rejected"; error: { status: number; code: string } };
type Applied = { requestId: string; status: "applied" };
type Command = { requestId: string; intent: { action: string }; previewHash: string };
export const productionRequestLock = (actor: TrustedIdentity, requestId: string) => `production-plan:${actor.internalUserId}:${requestId}`;
export function requireProductionPermissions(actor: TrustedIdentity, permissions: readonly PermissionKey[]) {
  for (const permission of permissions) requirePermission(actor.permissions, permission);
}
export function savedCommandPermissions(raw: unknown): PermissionKey[] {
  const action = (raw as { intent?: { action?: unknown } } | null)?.intent?.action;
  if (action === "record_execution") return executionRequiredPermissions(parseExecutionCommand(raw).intent);
  if (action === "set_order_tracking") { parseOrderTrackingCommand(raw); return [...ORDER_TRACKING_WRITE_PERMISSIONS]; }
  const command = parsePlanCommand(raw);
  return ["order.view", "schedule.view", command.intent.action === "create" ? "schedule.create" : "schedule.edit"];
}
export function boundProductionPayload(value: unknown, code = "production_plan_preview_too_large") {
  if (Buffer.byteLength(JSON.stringify(value)) > 1024 * 1024) planFail(422, code);
}
/** Shared actor/request identity, lock order, durable rejection and atomic audit
 * boundary for planning and actual execution. The callback never nests BEGIN. */
export async function runProductionCommand<T extends Applied>(pool: Pool, identity: TrustedIdentity, command: Command,
  permissions: readonly PermissionKey[], apply: (client: PoolClient, actor: TrustedIdentity) => Promise<{ result: T; orderIds: string[] }>) {
  const digest = planHash(command), client = await pool.connect();
  try {
    await client.query("BEGIN"); await client.query("SET LOCAL lock_timeout='5s'");
    await lockEffectiveAttribution(client);
    const actor = await readCurrentActor(client, identity, true); requireProductionPermissions(actor, permissions);
    await productionPlansAvailable(client);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [productionRequestLock(actor, command.requestId)]);
    const prior = (await client.query<{ payload_hash: string; command: unknown; result: T | RejectedProductionCommand }>(
      "SELECT payload_hash,command,result FROM production_schedule_commands WHERE actor_id=$1 AND request_id=$2", [actor.internalUserId, command.requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== digest) planFail(409, "production_plan_request_conflict");
      requireProductionPermissions(actor, savedCommandPermissions(prior.command));
      await client.query("COMMIT"); return { ...prior.result, payloadHash: digest, replayed: true };
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('production-planning-write-v1',0))");
    await lockProductionResourceScope(client, "freeze");
    await client.query("SAVEPOINT production_apply");
    let result: T | RejectedProductionCommand, orderIds: string[] = [];
    try {
      ({ result, orderIds } = await apply(client, actor));
      boundProductionPayload(result, "production_plan_receipt_too_large");
    } catch (error) {
      if (!(error instanceof HttpError) || ![404, 409, 422].includes(error.status)) throw error;
      await client.query("ROLLBACK TO SAVEPOINT production_apply"); orderIds = [];
      result = { requestId: command.requestId, status: "rejected", error: { status: error.status, code: error.code } };
    }
    await client.query("INSERT INTO production_schedule_commands(actor_id,request_id,action,payload_hash,command,result) VALUES($1,$2,$3,$4,$5,$6)",
      [actor.internalUserId, command.requestId, command.intent.action, digest, command, result]);
    for (const id of [...new Set(orderIds)].sort()) await client.query("INSERT INTO production_schedule_command_orders(actor_id,request_id,sales_order_id) VALUES($1,$2,$3)", [actor.internalUserId, command.requestId, id]);
    await client.query("COMMIT"); return { ...result, payloadHash: digest, replayed: false };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
