import {withSyncAudit,auditAcquired,auditPublished,commitWithSyncAudit} from './sync-audit.js';
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { readCurrentActor } from "../auth/current-actor.js";
import { requirePermission } from "../auth/permissions.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import { freezePhysicalOrderGroups, lockEffectiveAttribution, resolveEffectiveOrder } from "../sales-orders/effective-attribution.js";
import { requireVerifiedOrderBusiness } from "../sales-orders/identity-service.js";
import { identityUuid } from "../sales-orders/identity-model.js";
import { readStableOrderColors, ensureStableOrderColor, orderColorBusinessKey, stableOrderColorId } from "../sales-orders/color-identities.js";
import { boundOrders, type BoundSourceOrder } from "./service.js";
import { hash, sourceKeyValid } from "./contract.js";
import { restoreGarmentObservationSnapshot, GARMENT_OBSERVATION_LIMITS, type GarmentObservationScope, type GarmentObservationSnapshot } from "./garment-shipment-observations.js";
import type { GarmentEmptyView, GarmentObservedView } from "../../features/ainuoke-garment-shipments/model.js";

const tables = ["ainuoke_garment_shipment_targets", "ainuoke_garment_shipment_snapshots", "ainuoke_garment_shipment_color_matches", "ainuoke_garment_shipment_heads"];
const fail = (status: number, code: string): never => { throw new HttpError(status, code, "成衣出货观察暂不可用。"); };
type Target = { account_fingerprint: string; enabled: boolean; verification_sha256: string | null; freshness_ms: number;
  version: number; profile_fingerprint: string; profile_enabled: boolean };
type ColorBasis = { id: string; businessKey: string; colorName: string; ambiguous: boolean }[];
type ColorMatch = { state: "matched"; orderColorId: string; orderColorName: string }
  | { state: "missing_source_color" | "unmatched" | "ambiguous" };
export type GarmentPublicationContext = {
  sourceKey: string; salesOrderId: string; sourceFingerprint: string; salesContractNo: string;
  sourceOwnerOrderId: string; sourceLinkId: string; attributionChangeId: string | null; attributionVersion: number;
  orderVersion: number; targetVersion: number; freshnessMs: number; colorBasisHash: string; generation: number; preparedAt: number;
};
type Payload = Omit<GarmentObservationSnapshot, "rows"> & { rows: (GarmentObservationSnapshot["rows"][number] & { colorMatch: ColorMatch })[] };
type Stored = { id: string; source_key: string; sales_order_id: string; generation: number; account_fingerprint: string; target_version: number;
  freshness_ms: number; source_owner_order_id: string; source_link_id: string; attribution_change_id: string | null; attribution_version: number;
  order_version: number; sales_contract_no: string; snapshot_id: string; row_count: number; input: unknown; scope: GarmentObservationScope;
  publication_context: GarmentPublicationContext; color_basis: ColorBasis; color_basis_hash: string; payload: Payload; content_hash: string };
const columns = "s.id::text,s.source_key,s.sales_order_id::text,s.generation,s.account_fingerprint,s.target_version,s.freshness_ms,"
  + "s.source_owner_order_id::text,s.source_link_id::text,s.attribution_change_id::text,s.attribution_version,s.order_version,s.sales_contract_no,"
  + "s.snapshot_id,s.row_count,s.input,s.scope,s.publication_context,s.color_basis,s.color_basis_hash,s.payload,s.content_hash";
function ids(sourceKey: string, orderId: string) {
  if (!sourceKeyValid(sourceKey) || !identityUuid.test(orderId)) fail(400, "invalid_garment_source_request");
}
async function available(client: PoolClient) {
  const count = (await client.query<{ n: number }>("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])", [tables])).rows[0].n;
  if (count !== tables.length) fail(503, "garment_observations_unavailable");
}
async function actorFor(client: PoolClient, identity: TrustedIdentity, write: boolean, lock = write) {
  const actor = await readCurrentActor(client, identity, lock);
  requirePermission(actor.permissions, "order.view"); requirePermission(actor.permissions, "ainuoke.view");
  if (write) requirePermission(actor.permissions, "ainuoke.sync"); return actor;
}
async function transaction<T>(pool: Pool, write: boolean, fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    if (write) await client.query("SET LOCAL lock_timeout='5s'");
    const result = await fn(client); await commitWithSyncAudit(client); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
async function targetFor(client: PoolClient, sourceKey: string, orderId: string, lock: boolean) {
  if (lock) await client.query("SELECT source_key FROM ainuoke_source_profiles WHERE source_key=$1 FOR SHARE", [sourceKey]);
  return (await client.query<Target>(`SELECT t.account_fingerprint,t.enabled,t.verification_sha256,t.freshness_ms,t.version,
    p.account_fingerprint profile_fingerprint,p.enabled profile_enabled FROM ainuoke_garment_shipment_targets t
    JOIN ainuoke_source_profiles p ON p.source_key=t.source_key WHERE t.source_key=$1 AND t.sales_order_id=$2 ${lock ? "FOR SHARE OF t" : ""}`, [sourceKey, orderId])).rows[0];
}
const enabled = (target: Target | undefined): target is Target => Boolean(target?.enabled && target.profile_enabled && target.verification_sha256
  && target.account_fingerprint === target.profile_fingerprint);
function basisOf(colors: Awaited<ReturnType<typeof readStableOrderColors>>): ColorBasis {
  if (colors.length > 1000) return fail(422, "garment_color_basis_limit");
  return colors.map(({ id, businessKey, colorName, ambiguous }) => ({ id, businessKey, colorName, ambiguous }))
    .sort((a, b) => a.businessKey < b.businessKey ? -1 : a.businessKey > b.businessKey ? 1 : a.colorName < b.colorName ? -1 : a.colorName > b.colorName ? 1 : 0);
}
function projectColors(snapshot: GarmentObservationSnapshot, basis: ColorBasis): Payload {
  return { ...snapshot, rows: snapshot.rows.map(row => {
    const field = row.fields.CnColor;
    let colorMatch: ColorMatch;
    if (field.state !== "known") colorMatch = { state: "missing_source_color" };
    else {
      const matches = basis.filter(color => color.businessKey === orderColorBusinessKey(field.raw));
      colorMatch = matches.length === 1 && !matches[0].ambiguous
        ? { state: "matched", orderColorId: matches[0].id, orderColorName: matches[0].colorName }
        : { state: matches.length ? "ambiguous" : "unmatched" };
    }
    return { ...row, colorMatch };
  }) };
}
function contextOf(sourceKey: string, order: BoundSourceOrder, target: Target, basis: ColorBasis, generation: number, preparedAt: number): GarmentPublicationContext {
  return { sourceKey, salesOrderId: order.id, sourceFingerprint: target.account_fingerprint, salesContractNo: order.salesContractNo!,
    sourceOwnerOrderId: order.sourceOwnerOrderId, sourceLinkId: order.sourceLinkId, attributionChangeId: order.attributionChangeId,
    attributionVersion: order.attributionVersion, orderVersion: order.version, targetVersion: target.version, freshnessMs: target.freshness_ms,
    colorBasisHash: hash(basis), generation, preparedAt };
}
type StoredBinding = Pick<Stored, "account_fingerprint" | "sales_contract_no" | "source_owner_order_id" | "source_link_id" | "attribution_change_id" | "attribution_version">;
function bindingMatches(stored: StoredBinding, order: BoundSourceOrder, target: Target) {
  return stored.account_fingerprint === target.account_fingerprint && stored.sales_contract_no === order.salesContractNo
    && stored.source_owner_order_id === order.sourceOwnerOrderId && stored.source_link_id === order.sourceLinkId
    && stored.attribution_change_id === order.attributionChangeId && stored.attribution_version === order.attributionVersion;
}
async function headFor(client: PoolClient, sourceKey: string, orderId: string) {
  return (await client.query<Stored>(`SELECT ${columns} FROM ainuoke_garment_shipment_heads h
    JOIN ainuoke_garment_shipment_snapshots s ON s.id=h.snapshot_id AND s.sales_order_id=h.sales_order_id AND s.source_key=h.source_key
    WHERE h.source_key=$1 AND h.sales_order_id=$2`, [sourceKey, orderId])).rows[0];
}
function verifyStored(row: Stored): Payload {
  try {
    const counts = new Map<string, number>();
    if (!Array.isArray(row.color_basis) || row.color_basis.length > 1000) throw Error();
    for (const color of row.color_basis) {
      if (!color || Object.keys(color).sort().join(",") !== "ambiguous,businessKey,colorName,id" || typeof color.colorName !== "string"
        || color.businessKey !== orderColorBusinessKey(color.colorName) || color.id !== stableOrderColorId(row.sales_order_id, color.businessKey)) throw Error();
      counts.set(color.businessKey, (counts.get(color.businessKey) ?? 0) + 1);
    }
    if (row.color_basis.some(color => color.ambiguous !== (counts.get(color.businessKey)! > 1)) || hash(row.color_basis) !== row.color_basis_hash) throw Error();
    const snapshot = restoreGarmentObservationSnapshot(row.input, row.scope), saved = row.publication_context;
    if (saved.sourceKey !== row.source_key || saved.salesOrderId !== row.sales_order_id || saved.sourceFingerprint !== row.account_fingerprint
      || saved.salesContractNo !== row.sales_contract_no || saved.sourceOwnerOrderId !== row.source_owner_order_id || saved.sourceLinkId !== row.source_link_id
      || saved.attributionChangeId !== row.attribution_change_id || saved.attributionVersion !== row.attribution_version || saved.targetVersion !== row.target_version
      || saved.freshnessMs !== row.freshness_ms || saved.orderVersion !== row.order_version || saved.colorBasisHash !== row.color_basis_hash
      || saved.generation !== row.generation - 1 || !Number.isFinite(saved.preparedAt) || saved.preparedAt > Date.parse(snapshot.observedFrom)) throw Error();
    const payload = projectColors(snapshot, row.color_basis);
    if (snapshot.rows.length !== row.row_count || snapshot.snapshotId !== row.snapshot_id || snapshot.sourceFingerprint !== row.account_fingerprint || snapshot.salesContractNo !== row.sales_contract_no
      || hash(payload) !== row.content_hash || hash(row.payload) !== row.content_hash) throw Error();
    return payload;
  } catch { return fail(503, "garment_observation_integrity_failed"); }
}
async function verifiedOrder(client: PoolClient, orderId: string) {
  const effective = await resolveEffectiveOrder(client, orderId);
  if (effective.historicalDuplicate) fail(404, "garment_order_not_available");
  return requireVerifiedOrderBusiness(client, orderId);
}
async function boundedStorage(client: PoolClient, values: { input: unknown; scope: unknown; context: unknown; basis: unknown; payload: unknown }) {
  const texts = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)])) as Record<keyof typeof values, string>;
  const limits = { input: 16777216, scope: 8192, context: 8192, basis: 524288, payload: 16777216 };
  for (const key of Object.keys(texts) as (keyof typeof texts)[]) if (Buffer.byteLength(texts[key], "utf8") > limits[key])
    fail(422, "garment_observation_storage_limit");
  // CHECK constraints count jsonb::text, whose formatting differs from compact
  // JSON. Measure that exact representation before any identity/snapshot write.
  const size = (await client.query<Record<keyof typeof values, number>>(`SELECT octet_length($1::jsonb::text) input,octet_length($2::jsonb::text) scope,
    octet_length($3::jsonb::text) context,octet_length($4::jsonb::text) basis,octet_length($5::jsonb::text) payload`,
  [texts.input, texts.scope, texts.context, texts.basis, texts.payload])).rows[0];
  for (const key of Object.keys(size) as (keyof typeof size)[]) if (size[key] > limits[key]) fail(422, "garment_observation_storage_limit");
  return texts;
}

/** Internal preparation on a caller-owned read snapshot. No collection or activation. */
export async function prepareGarmentPublicationInTransaction(client: PoolClient, identity: TrustedIdentity,
  sourceKey: string, orderId: string, now = Date.now()) {
  ids(sourceKey, orderId);
  if (!Number.isFinite(now) || now < 0) fail(503, "garment_capture_clock_invalid");
  await actorFor(client, identity, true, false); await available(client);
  const business = await verifiedOrder(client, orderId);
  if (business.businessType === "processing") fail(409, "garment_source_not_applicable");
  const target = await targetFor(client, sourceKey, orderId, false); if (!enabled(target)) fail(503, "garment_source_not_connected");
  const order = (await boundOrders(client, false, [orderId]))[0]; if (!order) return fail(409, "garment_binding_unavailable");
  const basis = basisOf(await readStableOrderColors(client, orderId)), current = await headFor(client, sourceKey, orderId);
  return contextOf(sourceKey, order, target, basis, current?.generation ?? 0, now);
}

/** Internal preparation only. It performs no collector, HTTP or activation. */
export async function prepareGarmentPublication(pool: Pool, identity: TrustedIdentity, sourceKey: string, orderId: string, now = Date.now()) {
  ids(sourceKey, orderId);
  if (!Number.isFinite(now) || now < 0) fail(503, "garment_capture_clock_invalid");
  return transaction(pool, false, client => prepareGarmentPublicationInTransaction(client, identity, sourceKey, orderId, now));
}

function checkedGarmentPublication(caller: TrustedIdentity, requestedContext: GarmentPublicationContext,
  input: unknown, scope: GarmentObservationScope, now: number) {
  const identity = structuredClone(caller), context = structuredClone(requestedContext), checkedInput = structuredClone(input), checkedScope = structuredClone(scope);
  ids(context.sourceKey, context.salesOrderId);
  const snapshot = restoreGarmentObservationSnapshot(checkedInput, checkedScope);
  if (!Number.isFinite(now) || now < Date.parse(snapshot.observedThrough) || !Number.isFinite(context.preparedAt) || context.preparedAt < 0 || context.preparedAt > now
    || Date.parse(snapshot.observedFrom) < context.preparedAt) fail(409, "garment_capture_precedes_scope");
  return { identity, context, checkedInput, checkedScope, snapshot, now };
}

async function publishCheckedGarmentObservation(client: PoolClient, checked: ReturnType<typeof checkedGarmentPublication>) {
  const { identity, context, checkedInput, checkedScope, snapshot, now } = checked;
  await lockEffectiveAttribution(client);
  const actor = await actorFor(client, identity, true); await available(client);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["garment-publication:" + context.sourceKey + ":" + context.salesOrderId]);
  const target = await targetFor(client, context.sourceKey, context.salesOrderId, true); if (!enabled(target)) return fail(503, "garment_source_not_connected");
  await freezePhysicalOrderGroups(client, [context.salesOrderId]);
  const business = await verifiedOrder(client, context.salesOrderId); if (business.businessType !== "ainuoke_contract") fail(409, "garment_source_not_applicable");
  const order = (await boundOrders(client, true, [context.salesOrderId]))[0]; if (!order) return fail(409, "garment_binding_changed");
  const colors = await readStableOrderColors(client, order.id), basis = basisOf(colors);
  const actual = contextOf(context.sourceKey, order, target, basis, context.generation, context.preparedAt);
  const old = (await client.query<Stored>(`SELECT ${columns} FROM ainuoke_garment_shipment_snapshots s
    WHERE source_key=$1 AND sales_order_id=$2 AND snapshot_id=$3`, [context.sourceKey, order.id, snapshot.snapshotId])).rows[0];
  if (old) {
    if (!bindingMatches(old, order, target) || hash(old.publication_context) !== hash(context) || hash(old.input) !== hash(checkedInput)
      || hash(verifyStored(old)) !== hash(projectColors(snapshot, old.color_basis)))
      return fail(409, "garment_capture_retry_conflict");
    await auditAcquired(client,checkedInput,null,context.salesContractNo);
    await auditPublished(client,context.sourceKey,old.id,checkedInput,context.salesContractNo,undefined,true);
    return { publicationId: old.id, snapshotId: old.snapshot_id, generation: old.generation, alreadyPublished: true };
  }
  if (hash(actual) !== hash(context) || snapshot.sourceFingerprint !== actual.sourceFingerprint || snapshot.salesContractNo !== actual.salesContractNo)
    fail(409, "garment_binding_changed");
  if (now - Date.parse(snapshot.observedFrom) > GARMENT_OBSERVATION_LIMITS.captureWindowMs) fail(409, "garment_capture_expired");
  const payload = projectColors(snapshot, basis);
  const current = await headFor(client, context.sourceKey, order.id);
  if ((current?.generation ?? 0) !== context.generation) fail(409, "garment_generation_conflict");
  if (context.generation >= 2147483647) fail(422, "garment_generation_limit");
  if (current) {
    verifyStored(current);
    if (Date.parse(snapshot.observedFrom) < Date.parse(current.payload.observedFrom) || Date.parse(snapshot.observedThrough) < Date.parse(current.payload.observedThrough))
      fail(409, "garment_observation_regressed");
  }
  const texts = await boundedStorage(client, { input: checkedInput, scope: checkedScope, context, basis, payload });
  await auditAcquired(client,checkedInput,null,context.salesContractNo);
  for (const color of colors.filter(color => !color.ambiguous)) await ensureStableOrderColor(client, order.id, color);
  const publicationId = randomUUID(), generation = context.generation + 1;
  await client.query(`INSERT INTO ainuoke_garment_shipment_snapshots(id,source_key,sales_order_id,generation,account_fingerprint,target_version,freshness_ms,
    source_owner_order_id,source_link_id,attribution_change_id,attribution_version,order_version,sales_contract_no,snapshot_id,row_count,observed_from,observed_through,
    input,scope,publication_context,color_basis,color_basis_hash,payload,content_hash,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
  [publicationId, context.sourceKey, order.id, generation, context.sourceFingerprint, context.targetVersion, context.freshnessMs, context.sourceOwnerOrderId,
    context.sourceLinkId, context.attributionChangeId, context.attributionVersion, context.orderVersion, context.salesContractNo, snapshot.snapshotId, payload.rows.length,
    snapshot.observedFrom, snapshot.observedThrough, texts.input, texts.scope, texts.context, texts.basis, hash(basis), texts.payload, hash(payload), actor.internalUserId]);
  for (const row of payload.rows) await client.query(`INSERT INTO ainuoke_garment_shipment_color_matches(snapshot_id,sales_order_id,source_record_id,match_state,order_color_id)
    VALUES($1,$2,$3,$4,$5)`, [publicationId, order.id, row.sourceRecordId, row.colorMatch.state, row.colorMatch.state === "matched" ? row.colorMatch.orderColorId : null]);
  if (current) {
    const changed = await client.query("UPDATE ainuoke_garment_shipment_heads SET snapshot_id=$3,generation=$4 WHERE source_key=$1 AND sales_order_id=$2 AND generation=$5",
      [context.sourceKey, order.id, publicationId, generation, current.generation]); if (changed.rowCount !== 1) fail(409, "garment_generation_conflict");
  } else await client.query("INSERT INTO ainuoke_garment_shipment_heads(source_key,sales_order_id,snapshot_id,generation) VALUES($1,$2,$3,$4)", [context.sourceKey, order.id, publicationId, generation]);
  await appendOperationLog(client, actor, { module: "艾诺科同步", action: "采集艾诺科来源", entityType: "AinuokeSourceRun", entityId: publicationId,
    afterData: { values: { salesOrderId: order.id, generation } }, metadata: { sourceReportId: "6086979", publicationId, generation, rowCount: payload.rows.length, sourceOnly: true } });
  await auditPublished(client,context.sourceKey,publicationId,checkedInput,context.salesContractNo);
  return { publicationId, snapshotId: snapshot.snapshotId, generation, alreadyPublished: false };
}

/** The caller owns BEGIN/COMMIT. This allows a publication and its durable
 * operator success receipt to commit atomically, using the same lock order and
 * fresh authorization as the original wrapper. Never hold it across network IO. */
export async function publishGarmentObservationInTransaction(client: PoolClient, caller: TrustedIdentity,
  requestedContext: GarmentPublicationContext, input: unknown, scope: GarmentObservationScope, now = Date.now()) {
  const checked = checkedGarmentPublication(caller, requestedContext, input, scope, now);
  return publishCheckedGarmentObservation(client, checked);
}

/** Server-only checked-page publication. Preserve synchronous input capture
 * before the first await, current permissions, scope/CAS and original replay. */
async function publishGarmentObservationImplementation(pool: Pool, caller: TrustedIdentity, requestedContext: GarmentPublicationContext,
  input: unknown, scope: GarmentObservationScope, now = Date.now()) {
  const checked = checkedGarmentPublication(caller, requestedContext, input, scope, now);
  return transaction(pool, true, client => publishCheckedGarmentObservation(client, checked));
}

function readProjection(row: Stored, basis: ColorBasis, target: Target, now: number): GarmentObservedView {
  if (!Number.isFinite(now) || now < Date.parse(row.payload.observedThrough)) fail(503, "garment_observation_clock_invalid");
  const payload = verifyStored(row);
  return { ...payload, schemaVersion: "order-garment-shipments.v1" as const, salesOrderId: row.sales_order_id, sourceReportId: "6086979" as const,
    sourceStatus: payload.rows.length ? "observed" as const : "observed_empty" as const, publicationId: row.id, generation: row.generation,
    freshness: now - Date.parse(payload.observedFrom) < row.freshness_ms ? "fresh" as const : "stale" as const,
    evaluatedAt: new Date(now).toISOString(), expiresAt: new Date(Date.parse(payload.observedFrom) + row.freshness_ms).toISOString(),
    targetPolicyChanged: row.target_version !== target.version,
    colorBasisChanged: hash(basis) !== row.color_basis_hash };
}
/** DB-only reader. Current and historical data remain observations as-of capture;
 * stale observations are labelled, not silently discarded or reinterpreted. */
export function createGarmentShipmentReader(pool: Pool, config: { sourceKey: string }, now: () => number = Date.now) {
  if (!sourceKeyValid(config.sourceKey)) fail(400, "invalid_garment_source_configuration"); const sourceKey = config.sourceKey;
  async function read(identity: TrustedIdentity, orderId: string, publicationId?: string) {
    ids(sourceKey, orderId); if (publicationId !== undefined && !identityUuid.test(publicationId)) fail(400, "invalid_garment_source_request");
    return transaction(pool, false, async client => {
      await actorFor(client, identity, false); await available(client); const business = await verifiedOrder(client, orderId);
      const empty = (sourceStatus: "not_applicable" | "not_connected" | "not_captured" | "identity_changed"): GarmentEmptyView => ({
        schemaVersion: "order-garment-shipments.v1" as const, salesOrderId: orderId, sourceReportId: "6086979" as const, sourceStatus, rows: [] });
      if (business.businessType === "processing") return empty("not_applicable");
      const target = await targetFor(client, sourceKey, orderId, false); if (!enabled(target)) return empty("not_connected");
      const order = (await boundOrders(client, false, [orderId]))[0]; if (!order) return empty("identity_changed");
      const stored = publicationId ? (await client.query<Stored>(`SELECT ${columns} FROM ainuoke_garment_shipment_snapshots s
        WHERE source_key=$1 AND sales_order_id=$2 AND id=$3`, [sourceKey, orderId, publicationId])).rows[0] : await headFor(client, sourceKey, orderId);
      if (!stored) { if (publicationId) fail(404, "garment_observation_not_found"); return empty("not_captured"); }
      if (!bindingMatches(stored, order, target)) return empty("identity_changed");
      return readProjection(stored, basisOf(await readStableOrderColors(client, orderId)), target, now());
    });
  }
  async function history(identity: TrustedIdentity, orderId: string, beforeGeneration?: number) {
    ids(sourceKey, orderId);
    if (beforeGeneration !== undefined && (!Number.isSafeInteger(beforeGeneration) || beforeGeneration < 1 || beforeGeneration > 2147483647)) fail(400, "invalid_garment_history_query");
    return transaction(pool, false, async client => {
      await actorFor(client, identity, false); await available(client); const business = await verifiedOrder(client, orderId);
      const target = await targetFor(client, sourceKey, orderId, false), order = (await boundOrders(client, false, [orderId]))[0];
      if (business.businessType === "processing" || !enabled(target) || !order) return { salesOrderId: orderId, records: [], nextBeforeGeneration: null };
      type Summary = StoredBinding & { id: string; generation: number; observed_from: Date; observed_through: Date; row_count: number; color_basis_hash: string };
      const rows = (await client.query<Summary>(`SELECT s.id::text,s.generation,s.account_fingerprint,s.sales_contract_no,s.source_owner_order_id::text,
        s.source_link_id::text,s.attribution_change_id::text,s.attribution_version,s.observed_from,s.observed_through,s.row_count,s.color_basis_hash
        FROM ainuoke_garment_shipment_snapshots s
        WHERE source_key=$1 AND sales_order_id=$2 AND ($3::integer IS NULL OR generation<$3) ORDER BY generation DESC LIMIT 26`, [sourceKey, orderId, beforeGeneration ?? null])).rows;
      const records = rows.slice(0, 25).filter(row => bindingMatches(row, order, target)).map(row => ({ publicationId: row.id, generation: row.generation,
        observedFrom: row.observed_from.toISOString(), observedThrough: row.observed_through.toISOString(), rowCount: row.row_count, colorBasisHash: row.color_basis_hash }));
      return { salesOrderId: orderId, records, nextBeforeGeneration: rows.length > 25 ? rows[24].generation : null,
        validation: "immutable_summary_detail_verified_on_open" as const };
    });
  }
  return { read, history };
}
export type GarmentShipmentReader = ReturnType<typeof createGarmentShipmentReader>;
export function garmentShipmentReadConfig(values: Readonly<Record<string, string | undefined>>, identityMode: string) {
  if ((values.ZHIXU_AINUOKE_GARMENT_SHIPMENT_READ ?? "disabled") === "disabled") return null;
  const sourceKey = values.ZHIXU_AINUOKE_SOURCE_KEY ?? "";
  if (values.ZHIXU_AINUOKE_GARMENT_SHIPMENT_READ !== "snapshot" || identityMode !== "session" || !sourceKeyValid(sourceKey))
    fail(400, "invalid_garment_source_configuration");
  return { sourceKey };
}

export async function publishGarmentObservation(...args:Parameters<typeof publishGarmentObservationImplementation>){return withSyncAudit(args[0],{sourceKey:args[2].sourceKey,type:'publication',historical:true,reports:['6086979']},()=>publishGarmentObservationImplementation(...args));}
