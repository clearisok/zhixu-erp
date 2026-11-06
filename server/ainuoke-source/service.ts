import { supportsOrderHeads, followupModes } from './followup.js';
import { supportsEffectiveAttribution } from '../sales-orders/effective-attribution.js';
import { HttpError } from "../http/errors.js";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { permissionsForUser, requirePermission } from "../auth/permissions.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import type { VisibleMaterialOrder } from "../../features/ainuoke-material-progress/read-service.js";
import { SourceError, sourceKeyValid, validateBundle, hash } from "./contract.js";
export type Collector = (contracts: string[]) => Promise<unknown>;
export async function sourceActor(client: Pool | PoolClient, identity: Pick<TrustedIdentity, "internalUserId" | "userId">, write: boolean, lock = true): Promise<TrustedIdentity> {
    const row = (await client.query<{
        id: string;
        public_id: string;
        username: string;
        display_name: string;
    }>(`SELECT id::text,public_id::text,username,display_name FROM app_users WHERE id=$1::bigint AND public_id=$2::uuid AND active=true ${lock?"FOR SHARE":""}`, [identity.internalUserId, identity.userId])).rows[0];
    if (!row)
        throw new SourceError("source_actor_unavailable");
    const permissions = await permissionsForUser(client, row.id);
    for (const key of ["ainuoke.view", "order.view", "style_progress.read"] as const)
        requirePermission(permissions, key);
    if (write)
        for (const key of ["ainuoke.sync", "style_progress.import"] as const)
            requirePermission(permissions, key);
    return { internalUserId: row.id, userId: row.public_id, username: row.username, userName: row.display_name, permissions };
}
export type BoundSourceOrder=VisibleMaterialOrder & {sourceOwnerOrderId:string;sourceLinkId:string;attributionChangeId:string|null;attributionVersion:number};
export async function supportsSourceAttribution(client:Pool|PoolClient){
 if(!await supportsEffectiveAttribution(client))return false;
 const row=(await client.query<{count:number}>(`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND ((table_name='ainuoke_source_runs' AND column_name='order_scope_hash') OR (table_name='ainuoke_material_source_snapshots' AND column_name='attribution_change_id'))`)).rows[0];
 if(row.count!==2)throw new SourceError('source_attribution_schema_incomplete');return true;
}
export async function supportsMaterialCaptureContext(client:Pool|PoolClient){
 const row=(await client.query<{count:number}>("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND ((table_name='ainuoke_material_source_snapshots' AND column_name IN ('source_link_id','captured_order_version')) OR (table_name='ainuoke_source_runs' AND column_name='order_scope'))")).rows[0];
 if(row.count===0)return false;if(row.count!==3)throw new SourceError('source_capture_context_schema_incomplete');return true;
}
export async function boundOrders(client: Pool | PoolClient, lock = false, selectedIds?: readonly string[]): Promise<BoundSourceOrder[]> {
 const attributed=await supportsSourceAttribution(client);
 if(lock&&attributed)await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('order-effective-attribution',0))");
 const rows=(await client.query<{id:string;version:number;sales_contract_no:string;style_no:string;inside_order_no:string;source_owner_order_id:string;source_link_id:string;attribution_change_id:string|null;attribution_version:number;processing:boolean}>(`SELECT ${attributed?'target.id':'o.id'}::text AS id,${attributed?'target.version':'o.version'} AS version,m.sales_contract_no,m.style_no,m.inside_order_no,o.id::text AS source_owner_order_id,l.id::text AS source_link_id,
 ${attributed?'mapping.attribution_change_id::text':'NULL::text'} AS attribution_change_id,${attributed?'mapping.attribution_version':'0'} AS attribution_version,
 ${attributed?"EXISTS(SELECT 1 FROM processing_order_batch_consumptions p WHERE p.sales_order_id=target.id)":'false'} AS processing
 FROM sales_orders o JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=o.id
 JOIN sales_order_source_links l ON l.sales_order_id=o.id AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract' AND l.external_id=m.source_id AND l.sales_contract_no=m.sales_contract_no
 ${attributed?'JOIN sales_order_effective_identities mapping ON mapping.original_order_id=o.id JOIN sales_orders target ON target.id=mapping.effective_order_id':''}
 ${selectedIds ? `WHERE ${attributed?'target.id':'o.id'}=ANY($1::uuid[])` : ''}
 ORDER BY ${attributed?'target.id':'o.id'},o.id LIMIT 1001 ${lock?'FOR SHARE OF o,m,l'+(attributed?',target':''):''}`,selectedIds?[selectedIds]:[])).rows;
 if(rows.length>1000)throw new SourceError('source_order_limit');
 if(rows.some(r=>r.processing))throw new SourceError('source_business_type_conflict');
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new SourceError('source_binding_conflict');
 return rows.map(r=>({id:r.id,version:r.version,salesContractNo:r.sales_contract_no,styleNo:r.style_no,insideOrderNo:r.inside_order_no,sourceOwnerOrderId:r.source_owner_order_id,sourceLinkId:r.source_link_id,attributionChangeId:r.attribution_change_id,attributionVersion:r.attribution_version}));
}
export async function captureSource(pool: Pool, identity: Pick<TrustedIdentity, "internalUserId" | "userId">, options: {
    sourceKey: string;
    accountFingerprint: string;
    collect: Collector;
    maxAgeMs: number;
    requireExistingProfile?: boolean;
    now?: () => number;
    selectedOrderIds?: readonly string[];
    expectedScopeHash?: string;
}) {
    if (!sourceKeyValid(options.sourceKey) || !/^[0-9a-f]{64}$/u.test(options.accountFingerprint))
        throw new SourceError("invalid_source_configuration");
    const now = options.now ?? Date.now;
    const client = await pool.connect();
    let locked = false, transaction = false, registered = false;
    let perOrder = false; let targetIds: string[] = [];
    try {
        locked = Boolean((await client.query<{
            locked: boolean;
        }>("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", ["ainuoke-source:" + options.sourceKey])).rows[0].locked);
        if (!locked)
            throw new SourceError("source_capture_busy");
        await sourceActor(client, identity, true);
        perOrder = await supportsOrderHeads(client);
        if(options.selectedOrderIds && (!perOrder || !options.selectedOrderIds.length || options.selectedOrderIds.length>25 || new Set(options.selectedOrderIds).size!==options.selectedOrderIds.length)) throw new SourceError('source_group_invalid');
        const targets = await boundOrders(client,false,options.selectedOrderIds);
        const followups = perOrder ? await followupModes(client,targets.map(o=>o.id)) : [];
        if(options.selectedOrderIds && (targets.length!==options.selectedOrderIds.length
          || hash({sourceKey:options.sourceKey,orders:targets,followups})!==options.expectedScopeHash))throw new SourceError('source_group_changed');
        targetIds=targets.map(o=>o.id);
        if (!targets.length)
            throw new SourceError("source_no_bound_orders");
        if(!options.requireExistingProfile)
            await client.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2) ON CONFLICT DO NOTHING", [options.sourceKey, options.accountFingerprint]);
        const profile = (await client.query<{
            account_fingerprint: string;
            enabled: boolean;
        }>("SELECT account_fingerprint,enabled FROM ainuoke_source_profiles WHERE source_key=$1", [options.sourceKey])).rows[0];
        if (!profile || !profile.enabled || profile.account_fingerprint !== options.accountFingerprint)
            throw new SourceError("source_account_mismatch");
        registered = true;
        const data = await options.collect(targets.map(order => order.salesContractNo!));
        const validated = await validateBundle(data, targets, now(), options.maxAgeMs);
        await client.query("BEGIN");
        transaction = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        const attributionSupported=await supportsSourceAttribution(client);
        const contextSupported=await supportsMaterialCaptureContext(client);
        if(attributionSupported)await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('order-effective-attribution',0))");
        const actor = await sourceActor(client, identity, true);
        const currentProfile = (await client.query<{
            account_fingerprint: string;
            enabled: boolean;
            latest_run_id: string | null;
        }>("SELECT account_fingerprint,enabled,latest_run_id::text FROM ainuoke_source_profiles WHERE source_key=$1 FOR UPDATE", [options.sourceKey])).rows[0];
        if (!currentProfile.enabled || currentProfile.account_fingerprint !== options.accountFingerprint)
            throw new SourceError("source_account_mismatch");
        const current = await boundOrders(client, true, options.selectedOrderIds);
        const currentFollowups=perOrder?await followupModes(client,current.map(o=>o.id)):[];
        if(hash(currentFollowups)!==hash(followups))throw new SourceError('source_group_changed');
        if (JSON.stringify(current) !== JSON.stringify(targets))
            throw new SourceError("source_order_changed");
        const scopeHash=hash(current);
        const previous = !options.selectedOrderIds && currentProfile.latest_run_id ? (await client.query<{
            content_hash: string;order_scope_hash:string|null;order_scope:unknown[]|null;
        }>(`SELECT content_hash,${attributionSupported?'order_scope_hash':'NULL::text AS order_scope_hash'},${contextSupported?'order_scope':'NULL::jsonb AS order_scope'} FROM ainuoke_source_runs WHERE id=$1`, [currentProfile.latest_run_id])).rows[0] : null;
        if (previous?.content_hash === validated.contentHash && (!attributionSupported||previous.order_scope_hash===scopeHash) && (!contextSupported||previous.order_scope!==null&&hash(previous.order_scope)===scopeHash)) {
            await client.query("UPDATE ainuoke_source_profiles SET last_error_code=NULL,last_attempt_at=now() WHERE source_key=$1", [options.sourceKey]);
            if(perOrder)for(const row of validated.rows)await client.query(`INSERT INTO ainuoke_material_order_heads(source_key,sales_order_id,run_id,last_error_code) VALUES($1,$2,$3,NULL)
              ON CONFLICT(source_key,sales_order_id) DO UPDATE SET run_id=excluded.run_id,last_error_code=NULL,last_attempt_at=now()`,[options.sourceKey,row.order.id,currentProfile.latest_run_id]);
            await client.query("COMMIT");
            transaction = false;
            return { runId: currentProfile.latest_run_id!, replayed: true, orders: validated.rows.length };
        }
        const runId=await publishMaterialSnapshotsInTransaction(client,actor,options.sourceKey,validated,current);
        if(!options.selectedOrderIds)await client.query("UPDATE ainuoke_source_profiles SET latest_run_id=$2,last_error_code=NULL,last_attempt_at=now() WHERE source_key=$1", [options.sourceKey, runId]);
        await client.query("COMMIT");
        transaction = false;
        return { runId, replayed: false, orders: validated.rows.length };
    }
    catch (error) {
        if (transaction)
            await client.query("ROLLBACK");
        // A failed attempt never changes the accepted pointer. Suppress old facts as current.
        if (registered && perOrder)for(const id of targetIds)await client.query(`INSERT INTO ainuoke_material_order_heads(source_key,sales_order_id,last_error_code)
          VALUES($1,$2,$3) ON CONFLICT(source_key,sales_order_id) DO UPDATE SET last_error_code=excluded.last_error_code,last_attempt_at=now()`,
          [options.sourceKey,id,error instanceof SourceError?error.code:'source_capture_failed']).catch(()=>undefined);
        if (registered && !options.selectedOrderIds)
            await client.query("UPDATE ainuoke_source_profiles SET last_error_code=$2,last_attempt_at=now() WHERE source_key=$1", [options.sourceKey, error instanceof SourceError ? error.code : "source_capture_failed"]).catch(() => undefined);
        throw error instanceof SourceError ? error : new SourceError(error instanceof HttpError && error.status === 403 ? "forbidden" : "source_capture_failed");
    }
    finally {
        if (locked)
            await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", ["ainuoke-source:" + options.sourceKey]).catch(() => undefined);
        client.release();
    }
}

/** Caller holds the source profile and trusted order locks; no IO or transaction ownership. */
export async function publishMaterialSnapshotsInTransaction(client:PoolClient,actor:TrustedIdentity,sourceKey:string,
 validated:Awaited<ReturnType<typeof validateBundle>>,current:BoundSourceOrder[],historical?:{historicalObservationId:string}) {
 const attributionSupported=await supportsSourceAttribution(client),contextSupported=await supportsMaterialCaptureContext(client);
 const perOrder=await supportsOrderHeads(client),scopeHash=hash(current);
        const runId = randomUUID();
        const runValues=[runId,sourceKey,actor.internalUserId,validated.capturedAt,JSON.stringify(validated.bundle.discoveryAfter),hash(validated.bundle.discoveryAfter),validated.contentHash,...(attributionSupported?[scopeHash]:[])];if(contextSupported)runValues.push(JSON.stringify(current));
        await client.query(`INSERT INTO ainuoke_source_runs(id,source_key,actor_user_id,captured_at,discovery,discovery_hash,content_hash${attributionSupported?',order_scope_hash':''}${contextSupported?',order_scope':''}) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7${attributionSupported?',$8':''}${contextSupported?`, $${runValues.length}::jsonb`:''})`,runValues);
        for (const row of validated.rows) {
            const target=current.find(order=>order.id===row.order.id)!;
            const values:Array<string|number|null>=[runId,row.order.id,row.contract,JSON.stringify(row.pages),row.contentHash,...(attributionSupported?[target.attributionChangeId]:[])];if(contextSupported)values.push(target.sourceLinkId,target.version);
            await client.query(`INSERT INTO ainuoke_material_source_snapshots(run_id,sales_order_id,sales_contract_no,snapshots,content_hash${attributionSupported?',attribution_change_id':''}${contextSupported?',source_link_id,captured_order_version':''}) VALUES($1,$2,$3,$4::jsonb,$5${attributionSupported?',$6':''}${contextSupported?`, $${values.length-1}, $${values.length}`:''})`,values);
        }
        if(perOrder)for(const target of current) {
            const present=validated.rows.some(r=>r.order.id===target.id);
            if(historical){
             if(!present)throw new SourceError('source_missing');
             await client.query(`INSERT INTO ainuoke_material_order_heads(source_key,sales_order_id,run_id,last_error_code,last_attempt_at)
              VALUES($1,$2,$3,NULL,$4) ON CONFLICT(source_key,sales_order_id) DO UPDATE SET
              run_id=coalesce(ainuoke_material_order_heads.run_id,excluded.run_id)`,[sourceKey,target.id,runId,validated.capturedAt]);
             continue;
            }
            await client.query(`INSERT INTO ainuoke_material_order_heads(source_key,sales_order_id,run_id,last_error_code,last_attempt_at)
             VALUES($1,$2,$3,$4,now()) ON CONFLICT(source_key,sales_order_id) DO UPDATE SET
             run_id=coalesce(excluded.run_id,ainuoke_material_order_heads.run_id),last_error_code=excluded.last_error_code,last_attempt_at=now()`,
             [sourceKey,target.id,present?runId:null,present?null:'source_visibility_changed']);
        }
        await appendOperationLog(client, actor, { module: "艾诺科同步", action: "采集艾诺科来源", entityType: "AinuokeSourceRun", entityId: runId,
            metadata: { sourceKey: sourceKey, sourceRunId: runId, orderCount: validated.rows.length, contentHash: validated.contentHash, orderScopeHash: attributionSupported?scopeHash:null, sourceOnly: true,
             ...(historical?{historicalObservationId:historical.historicalObservationId,historicalPublication:true,sourceRequests:0}: {}) } });

 return runId;
}
