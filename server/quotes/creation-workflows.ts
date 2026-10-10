import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Pool, PoolClient } from "pg";
import { permissionsForUser, requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import * as masters from "../quote-masters/repository.js";
import { createServerQuoteDraft } from "./draft.js";
import { createTrustedQuoteService, type QuoteMutationContext } from "./service.js";
import type { ServerQuote } from "./model.js";
import { creationId, parseCreationInput, type CreationCommand, type CreationInput, type CreationReceipt, type CreationResult } from "./creation-contract.js";

type Parameters = ServerQuote["revisions"][number]["priceVersions"][number]["pricingParameters"];
type Review = { versions: { brand: number | null; salesperson: number | null; preset: number | null; settings: number | null }; parameters: Parameters; names: { brand: string; salesperson: string } };
export type CreationPreview = { previewId: string; expiresAt: string; parametersVisibility: "visible" | "redacted"; pricingParameters?: Parameters; configuration: NonNullable<Parameters["configuration"]>; missingFields: string[] };
export type CreationOptions = { brands: Array<{ id: string; name: string }>; salespeople: Array<{ id: string; name: string; brandId: string }>; presets: Array<{ id: string; name: string; country: string }>; truncated: boolean };
const hash = (input: CreationInput) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
function failure(status: number, code: string): never { throw new HttpError(status, code, code); }
async function transaction<T>(pool: Pool, readOnly: boolean, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    const result = await run(client); await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
async function currentActor(client: PoolClient, actor: TrustedIdentity): Promise<TrustedIdentity> {
  // A permission revocation / user deactivation cannot commit through this serialisation point.
  const user = (await client.query("SELECT active,public_id::text FROM app_users WHERE id=$1 FOR SHARE", [actor.internalUserId])).rows[0];
  if (!user?.active || user.public_id !== actor.userId) failure(401, "authentication_required");
  await client.query("SELECT ur.user_id FROM app_user_roles ur JOIN app_role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=$1 FOR SHARE OF ur,rp", [actor.internalUserId]);
  const permissions = await permissionsForUser(client, actor.internalUserId);
  requirePermission(permissions, "quote.create");
  return { ...actor, permissions };
}
function ensureOverrides(actor: TrustedIdentity, input: CreationInput) {
  if (Object.keys(input.parameterOverrides).length) requirePermission(actor.permissions, "quote.settings.edit");
}
async function review(client: PoolClient, actor: TrustedIdentity, input: CreationInput, lock: boolean): Promise<Review> {
  ensureOverrides(actor, input);
  // Fixed order: global settings -> brand -> salesperson -> explicitly selected preset.
  const settings = await masters.getGlobalSettings(client, lock);
  const brand = input.fields.brandId ? await masters.getBrand(client, input.fields.brandId, lock) : null;
  const person = input.fields.salespersonId ? await masters.getSalesperson(client, input.fields.salespersonId, lock) : null;
  const preset = input.selection.presetId ? await masters.getPreset(client, input.selection.presetId, lock) : null;
  if (input.fields.brandId && (!brand || brand.status !== "active")) failure(400, "invalid_brand_selection");
  if (input.fields.salespersonId && (!person || person.status !== "active" || !brand || person.brandId !== brand.id)) failure(400, "invalid_salesperson_selection");
  if (input.selection.presetId && (!preset || preset.status !== "active")) failure(400, "invalid_preset_selection");
  if (preset && (!input.selection.country || preset.country.normalize("NFKC").trim() !== input.selection.country)) failure(400, "preset_country_mismatch");
  const parameters = createServerQuoteDraft({ quoteId: "", revisionId: "", priceVersionId: "", quoteCode: "" }, actor, new Date(0)).revisions[0].priceVersions[0].pricingParameters;
  parameters.manufacturingCountry = input.selection.country ?? "";
  const sources: NonNullable<Parameters["configuration"]>["sources"] = [
    { field: "manufacturingCountry", source: input.selection.country ? "explicit" : "unset" },
    { field: "laborCurrency", source: "technical_default" }, { field: "usdCnyRate", source: "unset" },
    { field: "markupRate", source: "unset" }, { field: "freight", source: "technical_default" },
  ];
  const source = (field: string, value: (typeof sources)[number]["source"]) => { sources.find(item => item.field === field)!.source = value; };
  if (preset) {
    Object.assign(parameters, { manufacturingPresetId: preset.id, manufacturingPresetName: preset.name, laborCurrency: preset.laborCurrency, markupRate: preset.markupRate, includeFreight: preset.includeFreight, freightName: preset.freightName, freightAmount: preset.freightAmount,
      usdCnyRate: person?.defaults.defaultUsdCnyRate ?? brand?.defaults.defaultUsdCnyRate ?? settings?.defaultUsdCnyRate ?? null });
    source("laborCurrency", "preset"); source("markupRate", preset.markupRate === null ? "unset" : "preset"); source("freight", "preset");
    source("usdCnyRate", parameters.usdCnyRate === null ? "unset" : "accepted_default");
  }
  for (const [field, value] of Object.entries(input.parameterOverrides)) {
    if (field === "laborCurrency") { parameters.laborCurrency = value as "CNY" | "USD" || "CNY"; source(field, value === null ? "technical_default" : "explicit"); }
    else if (field === "includeFreight") { parameters.includeFreight = value as boolean ?? false; source("freight", value === null ? "unset" : "explicit"); }
    else if (field === "freightName") parameters.freightName = value as string ?? "";
    else { (parameters as unknown as Record<string, unknown>)[field] = value; if (field !== "freightAmount") source(field, value === null ? "unset" : "explicit"); }
  }
  const configured = Boolean(parameters.manufacturingCountry) && sources.find(item => item.field === "laborCurrency")!.source !== "technical_default" && parameters.markupRate !== null
    && !["technical_default", "unset"].includes(sources.find(item => item.field === "freight")!.source)
    && (!parameters.includeFreight || Boolean(parameters.freightName) && parameters.freightAmount !== null)
    && (parameters.laborCurrency !== "USD" || parameters.usdCnyRate !== null);
  parameters.configuration = { schemaVersion: 1, status: configured ? "configured" : "incomplete", sources };
  return { versions: { brand: brand?.version ?? null, salesperson: person?.version ?? null, preset: preset?.version ?? null, settings: settings?.version ?? null }, parameters, names: { brand: brand?.name ?? "", salesperson: person?.name ?? "" } };
}
export function createQuoteCreationService(pool: Pool) {
  return {
    async options(actor: TrustedIdentity, search = ""): Promise<CreationOptions> {
      requirePermission(actor.permissions, "quote.create");
      return transaction(pool, true, async client => {
        const term = `%${search.replace(/[\\%_]/gu, "\\$&")}%`;
        const brands = (await client.query("SELECT id,name FROM quote_master_brands WHERE status='active' AND name ILIKE $1 ORDER BY name,id LIMIT 201", [term])).rows;
        const salespeople = (await client.query('SELECT p.id,p.name,p.brand_id AS "brandId" FROM quote_master_customer_salespeople p JOIN quote_master_brands b ON b.id=p.brand_id WHERE p.status=\'active\' AND b.status=\'active\' AND p.name ILIKE $1 ORDER BY p.name,p.id LIMIT 201', [term])).rows;
        const presets = (await client.query("SELECT id,name,country FROM quote_manufacturing_presets WHERE status='active' AND name ILIKE $1 ORDER BY country,name,id LIMIT 201", [term])).rows;
        return { brands: brands.slice(0, 200), salespeople: salespeople.slice(0, 200), presets: presets.slice(0, 200), truncated: [brands, salespeople, presets].some(rows => rows.length > 200) };
      });
    },
    async preview(actor: TrustedIdentity, raw: CreationInput): Promise<CreationPreview> {
      requirePermission(actor.permissions, "quote.create");
      const input = parseCreationInput(raw);
      // Repeatable-read review and issuing token share one connection/snapshot.
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        const reviewed = await review(client, actor, input, false);
        const previewId = randomUUID(); const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
        await client.query("INSERT INTO quote_creation_previews(id,actor_id,payload_hash,reviewed,expires_at) VALUES($1,$2,$3,$4,$5)", [previewId, actor.internalUserId, hash(input), reviewed, expiresAt]);
        await client.query("COMMIT");
        const visible = actor.permissions.includes("quote.cost.view") || actor.permissions.includes("quote.settings.edit");
        const missingFields = [!input.fields.brandId && "品牌", !input.fields.salespersonId && "业务员", !input.fields.styleNo && "款号", !input.fields.styleName && "款式名称", input.fields.quantity === null && "数量", reviewed.parameters.configuration!.status === "incomplete" && "制作参数"].filter(Boolean) as string[];
        return { previewId, expiresAt, configuration: reviewed.parameters.configuration!, parametersVisibility: visible ? "visible" : "redacted", ...(visible ? { pricingParameters: reviewed.parameters } : {}), missingFields };
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    },
    async receipt(actor: TrustedIdentity, requestId: string): Promise<CreationReceipt> {
      requirePermission(actor.permissions, "quote.create"); creationId(requestId);
      const row = (await pool.query("SELECT state,result,error_code FROM quote_creation_receipts WHERE actor_id=$1 AND client_request_id=$2", [actor.internalUserId, requestId])).rows[0];
      // Absence cannot prove that an in-flight request will not commit. Never authorise a new token/re-POST here.
      return row ? { state: row.state, ...(row.result ? { result: row.result } : {}), ...(row.error_code ? { errorCode: row.error_code } : {}), retryable: false } : { state: "pending", retryable: false };
    },
    async execute(actor: TrustedIdentity, command: CreationCommand, context: QuoteMutationContext = {}): Promise<{ receipt: CreationReceipt; replayed: boolean }> {
      requirePermission(actor.permissions, "quote.create");
      const { clientRequestId, previewId, imageSelection, ...raw } = command;
      if (imageSelection !== null) failure(400, "invalid_creation_input");
      creationId(clientRequestId); creationId(previewId);
      const input = parseCreationInput(raw); const payloadHash = hash(input);
      // Registration is durable before work, with no allocator/Quote/business audit writes.
      await transaction(pool, false, async client => {
        const trusted = await currentActor(client, actor); ensureOverrides(trusted, input);
        const preview = (await client.query("SELECT actor_id::text,payload_hash FROM quote_creation_previews WHERE id=$1", [previewId])).rows[0];
        if (!preview || preview.actor_id !== actor.internalUserId) failure(404, "creation_preview_not_found");
        if (preview.payload_hash !== payloadHash) failure(409, "creation_payload_mismatch");
        await client.query("INSERT INTO quote_creation_receipts(actor_id,client_request_id,preview_id,payload_hash,state) VALUES($1,$2,$3,$4,'pending') ON CONFLICT DO NOTHING", [actor.internalUserId, clientRequestId, previewId, payloadHash]);
      });
      try {
        return await transaction(pool, false, async client => {
          const receipt = (await client.query("SELECT * FROM quote_creation_receipts WHERE actor_id=$1 AND client_request_id=$2 FOR UPDATE", [actor.internalUserId, clientRequestId])).rows[0];
          const trusted = await currentActor(client, actor); ensureOverrides(trusted, input);
          if (receipt.payload_hash !== payloadHash || receipt.preview_id !== previewId) failure(409, "idempotency_payload_mismatch");
          if (receipt.state === "committed") return { replayed: true, receipt: { state: "committed" as const, result: receipt.result as CreationResult, retryable: false as const } };
          if (receipt.state === "rejected") failure(409, "creation_rejected");
          const preview = (await client.query("SELECT reviewed,expires_at FROM quote_creation_previews WHERE id=$1 AND actor_id=$2", [previewId, actor.internalUserId])).rows[0];
          if (new Date(preview.expires_at).getTime() <= Date.now()) failure(409, "preview_expired");
          let current: Review;
          try { current = await review(client, trusted, input, true); } catch (error) { if (error instanceof HttpError && error.status === 400) failure(409, "stale_parameters"); throw error; }
          if (!isDeepStrictEqual(current, preview.reviewed)) failure(409, "stale_parameters");
          const record = await createTrustedQuoteService(pool).createPreparedDraftInTransaction(client, trusted, input, current.parameters, current.names, context);
          const result = { quoteId: record.quote.id, revisionId: record.quote.defaultRevisionId, priceVersionId: record.quote.revisions[0].priceVersions[0].id, version: record.version };
          await client.query("UPDATE quote_creation_receipts SET state='committed',result=$3 WHERE actor_id=$1 AND client_request_id=$2", [actor.internalUserId, clientRequestId, result]);
          return { replayed: false, receipt: { state: "committed" as const, result, retryable: false as const } };
        });
      } catch (error) {
        // Known domain rejections are terminal. Unexpected/commit transport errors stay pending for read-only reconciliation.
        if (error instanceof HttpError && [400, 409].includes(error.status) && !["idempotency_payload_mismatch", "creation_rejected"].includes(error.code))
          await pool.query("UPDATE quote_creation_receipts SET state='rejected',error_code=$3 WHERE actor_id=$1 AND client_request_id=$2 AND state='pending' AND payload_hash=$4", [actor.internalUserId, clientRequestId, error.code, payloadHash]);
        throw error;
      }
    },
  };
}
