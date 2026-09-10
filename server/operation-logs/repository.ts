import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  createOperationLogChanges,
  type OperationLog,
  type OperationLogChange,
  type OperationLogData,
} from "../../features/operation-logs/model/operation-log.js";
import type { TrustedIdentity } from "../auth/session.js";

export type ServerOperationLogInput = {
  operationId?: string;
  operationSequence?: number;
  module: OperationLog["module"];
  action: OperationLog["action"];
  entityType: OperationLog["entityType"];
  entityId: string;
  quoteId?: string | null;
  context?: Record<string, unknown>;
  beforeData?: OperationLogData | null;
  afterData?: OperationLogData | null;
  changes?: OperationLogChange[];
  metadata?: Record<string, unknown>;
};

export type ServerOperationLog = {
  id: string;
  operationId: string;
  operationSequence: number;
  actorUserId: string;
  actorName: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  quoteId: string | null;
  context: Record<string, unknown>;
  beforeData: OperationLogData | null;
  afterData: OperationLogData | null;
  changes: OperationLogChange[];
  metadata: Record<string, unknown>;
  createdAt: string;
};

type OperationLogRow = {
  id: string;
  operation_id: string;
  operation_sequence: number;
  actor_public_id: string;
  actor_name: string;
  module: string;
  action: string;
  entity_type: string;
  entity_id: string;
  quote_id: string | null;
  context: Record<string, unknown>;
  before_data: OperationLogData | null;
  after_data: OperationLogData | null;
  changes: OperationLogChange[];
  metadata: Record<string, unknown>;
  created_at: Date;
};

function mapRow(row: OperationLogRow): ServerOperationLog {
  return {
    id: row.id,
    operationId: row.operation_id,
    operationSequence: row.operation_sequence,
    actorUserId: row.actor_public_id,
    actorName: row.actor_name,
    module: row.module,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    quoteId: row.quote_id,
    context: row.context,
    beforeData: row.before_data,
    afterData: row.after_data,
    changes: row.changes,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

export function createServerOperationId(): string {
  return `operation-${randomUUID()}`;
}

export async function appendOperationLog(
  client: Pool | PoolClient,
  actor: TrustedIdentity,
  input: ServerOperationLogInput,
): Promise<ServerOperationLog> {
  const id = `operation-log-${randomUUID()}`;
  const beforeData = input.beforeData ?? null;
  const afterData = input.afterData ?? null;
  const changes = input.changes ?? createOperationLogChanges(beforeData, afterData);
  const result = await client.query<OperationLogRow>(
    `INSERT INTO operation_logs(
       id, operation_id, operation_sequence,
       actor_user_id, actor_public_id, actor_name,
       module, action, entity_type, entity_id, quote_id,
       context, before_data, after_data, changes, metadata
     ) VALUES (
       $1, $2, $3, $4::bigint, $5::uuid, $6,
       $7, $8, $9, $10, $11,
       $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb
     )
     RETURNING *`,
    [
      id,
      input.operationId ?? createServerOperationId(),
      input.operationSequence ?? 0,
      actor.internalUserId,
      actor.userId,
      actor.userName,
      input.module,
      input.action,
      input.entityType,
      input.entityId,
      input.quoteId ?? null,
      JSON.stringify(input.context ?? {}),
      beforeData === null ? null : JSON.stringify(beforeData),
      afterData === null ? null : JSON.stringify(afterData),
      JSON.stringify(changes),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return mapRow(result.rows[0]);
}

export async function listOperationLogs(pool: Pool, limit = 100): Promise<ServerOperationLog[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await pool.query<OperationLogRow>(
    "SELECT * FROM operation_logs ORDER BY created_at DESC, id DESC LIMIT $1",
    [boundedLimit],
  );
  return result.rows.map(mapRow);
}
