import { HttpError } from "../http/errors.js";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { permissionsForUser, requirePermission } from "../auth/permissions.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import type { VisibleMaterialOrder } from "../../features/ainuoke-material-progress/read-service.js";
import { SourceError, sourceKeyValid, validateBundle, hash } from "./contract.js";
export type Collector = (contracts: string[]) => Promise<unknown>;
export async function sourceActor(client: Pool | PoolClient, identity: Pick<TrustedIdentity, "internalUserId" | "userId">, write: boolean): Promise<TrustedIdentity> {
    const row = (await client.query<{
        id: string;
        public_id: string;
        username: string;
        display_name: string;
    }>("SELECT id::text,public_id::text,username,display_name FROM app_users WHERE id=$1::bigint AND public_id=$2::uuid AND active=true FOR SHARE", [identity.internalUserId, identity.userId])).rows[0];
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
export async function boundOrders(client: Pool | PoolClient, lock = false): Promise<VisibleMaterialOrder[]> {
    const rows = (await client.query<{
        id: string;
        version: number;
        sales_contract_no: string;
        style_no: string;
        inside_order_no: string;
    }>(`SELECT o.id::text,o.version,m.sales_contract_no,m.style_no,m.inside_order_no
    FROM sales_orders o JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=o.id
    JOIN sales_order_source_links l ON l.sales_order_id=o.id AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract'
    AND l.external_id=m.source_id AND l.sales_contract_no=m.sales_contract_no
    ORDER BY o.id LIMIT 1001 ${lock ? "FOR SHARE OF o,m,l" : ""}`)).rows;
    if (rows.length > 1000)
        throw new SourceError("source_order_limit");
    return rows.map(r => ({ id: r.id, version: r.version, salesContractNo: r.sales_contract_no, styleNo: r.style_no, insideOrderNo: r.inside_order_no }));
}
export async function captureSource(pool: Pool, identity: Pick<TrustedIdentity, "internalUserId" | "userId">, options: {
    sourceKey: string;
    accountFingerprint: string;
    collect: Collector;
    maxAgeMs: number;
    now?: () => number;
}) {
    if (!sourceKeyValid(options.sourceKey) || !/^[0-9a-f]{64}$/u.test(options.accountFingerprint))
        throw new SourceError("invalid_source_configuration");
    const now = options.now ?? Date.now;
    const client = await pool.connect();
    let locked = false, transaction = false, registered = false;
    try {
        locked = Boolean((await client.query<{
            locked: boolean;
        }>("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", ["ainuoke-source:" + options.sourceKey])).rows[0].locked);
        if (!locked)
            throw new SourceError("source_capture_busy");
        await sourceActor(client, identity, true);
        const targets = await boundOrders(client);
        if (!targets.length)
            throw new SourceError("source_no_bound_orders");
        await client.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2) ON CONFLICT DO NOTHING", [options.sourceKey, options.accountFingerprint]);
        const profile = (await client.query<{
            account_fingerprint: string;
            enabled: boolean;
        }>("SELECT account_fingerprint,enabled FROM ainuoke_source_profiles WHERE source_key=$1", [options.sourceKey])).rows[0];
        if (!profile.enabled || profile.account_fingerprint !== options.accountFingerprint)
            throw new SourceError("source_account_mismatch");
        registered = true;
        const data = await options.collect(targets.map(order => order.salesContractNo!));
        const validated = await validateBundle(data, targets, now(), options.maxAgeMs);
        await client.query("BEGIN");
        transaction = true;
        const actor = await sourceActor(client, identity, true);
        const currentProfile = (await client.query<{
            account_fingerprint: string;
            enabled: boolean;
            latest_run_id: string | null;
        }>("SELECT account_fingerprint,enabled,latest_run_id::text FROM ainuoke_source_profiles WHERE source_key=$1 FOR UPDATE", [options.sourceKey])).rows[0];
        if (!currentProfile.enabled || currentProfile.account_fingerprint !== options.accountFingerprint)
            throw new SourceError("source_account_mismatch");
        const current = await boundOrders(client, true);
        if (JSON.stringify(current) !== JSON.stringify(targets))
            throw new SourceError("source_order_changed");
        const previous = currentProfile.latest_run_id ? (await client.query<{
            content_hash: string;
        }>("SELECT content_hash FROM ainuoke_source_runs WHERE id=$1", [currentProfile.latest_run_id])).rows[0] : null;
        if (previous?.content_hash === validated.contentHash) {
            await client.query("UPDATE ainuoke_source_profiles SET last_error_code=NULL,last_attempt_at=now() WHERE source_key=$1", [options.sourceKey]);
            await client.query("COMMIT");
            transaction = false;
            return { runId: currentProfile.latest_run_id!, replayed: true, orders: validated.rows.length };
        }
        const runId = randomUUID();
        await client.query("INSERT INTO ainuoke_source_runs(id,source_key,actor_user_id,captured_at,discovery,discovery_hash,content_hash) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)", [runId, options.sourceKey, actor.internalUserId, validated.capturedAt, JSON.stringify(validated.bundle.discoveryAfter), hash(validated.bundle.discoveryAfter), validated.contentHash]);
        for (const row of validated.rows)
            await client.query("INSERT INTO ainuoke_material_source_snapshots(run_id,sales_order_id,sales_contract_no,snapshots,content_hash) VALUES($1,$2,$3,$4::jsonb,$5)", [runId, row.order.id, row.contract, JSON.stringify(row.pages), row.contentHash]);
        await appendOperationLog(client, actor, { module: "艾诺科同步", action: "采集艾诺科来源", entityType: "AinuokeSourceRun", entityId: runId,
            metadata: { sourceKey: options.sourceKey, sourceRunId: runId, orderCount: validated.rows.length, contentHash: validated.contentHash, sourceOnly: true } });
        await client.query("UPDATE ainuoke_source_profiles SET latest_run_id=$2,last_error_code=NULL,last_attempt_at=now() WHERE source_key=$1", [options.sourceKey, runId]);
        await client.query("COMMIT");
        transaction = false;
        return { runId, replayed: false, orders: validated.rows.length };
    }
    catch (error) {
        if (transaction)
            await client.query("ROLLBACK");
        // A failed attempt never changes the accepted pointer. Suppress old facts as current.
        if (registered)
            await client.query("UPDATE ainuoke_source_profiles SET last_error_code=$2,last_attempt_at=now() WHERE source_key=$1", [options.sourceKey, error instanceof SourceError ? error.code : "source_capture_failed"]).catch(() => undefined);
        throw error instanceof SourceError ? error : new SourceError(error instanceof HttpError && error.status === 403 ? "forbidden" : "source_capture_failed");
    }
    finally {
        if (locked)
            await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", ["ainuoke-source:" + options.sourceKey]).catch(() => undefined);
        client.release();
    }
}
