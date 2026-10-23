import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  createOperationLogChanges,
  type OperationLog,
  type OperationLogChange,
  type OperationLogData,
} from "../../features/operation-logs/model/operation-log.js";
import type { TrustedIdentity } from "../auth/session.js";
import { projectOperationLogResponse, type OperationLogQuery } from "./query.js";

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
  costVisibility?: "restricted";
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
  created_at: Date | string;
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
    createdAt: new Date(row.created_at).toISOString(),
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

export type ServerOperationLogPage = {
  logs: ServerOperationLog[];
  facets: {modules:string[];actions:string[];actors:{id:string;name:string}[]};
  technicalAllowed: boolean;
  page: { limit: number; offset: number; count: number; total: number; hasMore: boolean };
};

export async function queryOperationLogs(
  pool: Pool, query: OperationLogQuery, actor: TrustedIdentity,
): Promise<ServerOperationLogPage> {
  const values:(string|number)[]=[];
  const parameter=(value:string|number)=>{values.push(value);return "$"+values.length;};
  const scope:string[]=[];
  if(query.quoteId!==undefined)scope.push("quote_id="+parameter(query.quoteId));
  if(!actor.permissions.includes("estimate.view")||!actor.permissions.includes("quote.cost.view")){
    scope.push("entity_type <> 'EstimateCost'","COALESCE(metadata->>'workflowAction','') NOT LIKE 'estimate.%'","action NOT IN ('生成估算成本','恢复历史估算成本')");
  }
  const where:string[]=[];
  if(query.module!==undefined)where.push("module="+parameter(query.module));
  if(query.action!==undefined)where.push("action="+parameter(query.action));
  if(query.actorId!==undefined)where.push("actor_public_id::text="+parameter(query.actorId));
  if(query.operationId!==undefined)where.push("operation_id="+parameter(query.operationId));
  if(query.from!==undefined)where.push("created_at>="+parameter(query.from)+"::timestamptz");
  if(query.to!==undefined)where.push("created_at<="+parameter(query.to)+"::timestamptz");
  // Deliberately excludes raw JSON, changes, notes, reasons and monetary fields.
  // Searching a hidden amount must not reveal its existence via count/facets.
  const names=["actor_name","module","action",
    ...["before_data","after_data"].flatMap(d=>["objectName","orderNo","orderStyleNo","quoteStyleNo","quoteCode","styleName","rowName","presetName"].map(k=>d+"->>'"+k+"'")),
    ...["before_data","after_data"].flatMap(d=>["name","account","名称","款号"].map(k=>d+"->'values'->>'"+k+"'"))];
  for(const term of (query.q??"").split(/\s+/u).filter(Boolean)){
    const p=parameter("%"+term.replace(/[\\%_]/gu,c=>"\\"+c)+"%");
    where.push("("+names.map(n=>n+" ILIKE "+p).join(" OR ")+")");
  }
  const limit=parameter(query.limit),offset=parameter(query.offset);
  const r=await pool.query<{total:string;rows:OperationLogRow[];modules:string[];actions:string[];actors:{id:string;name:string}[]}>(`
    WITH authorized AS (SELECT * FROM operation_logs ${scope.length?"WHERE "+scope.join(" AND "):""}),
    filtered AS (SELECT * FROM authorized ${where.length?"WHERE "+where.join(" AND "):""}),
    page AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset})
    SELECT (SELECT count(*) FROM filtered)::text total,
    COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb) rows,
    COALESCE((SELECT jsonb_agg(module ORDER BY module) FROM (SELECT DISTINCT module FROM authorized) m),'[]'::jsonb) modules,
    COALESCE((SELECT jsonb_agg(action ORDER BY action) FROM (SELECT DISTINCT action FROM authorized) a),'[]'::jsonb) actions,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id) FROM
      (SELECT DISTINCT actor_public_id::text id,actor_name name FROM authorized) u),'[]'::jsonb) actors`,values);
  const row=r.rows[0],total=Number(row.total);
  const logs=row.rows.map(l=>projectOperationLogResponse(actor,mapRow(l)));
  const technicalAllowed=actor.permissions.includes("user_permissions.manage")&&Boolean((await pool.query(
    "SELECT 1 FROM app_user_roles ur JOIN app_users u ON u.id=ur.user_id WHERE u.id=$1 AND u.active AND ur.role_id='role-server-admin'",[actor.internalUserId])).rowCount);
  return {logs,page:{limit:query.limit,offset:query.offset,count:logs.length,total,hasMore:query.offset+logs.length<total},
    facets:{modules:row.modules,actions:row.actions,actors:row.actors},technicalAllowed};
}
