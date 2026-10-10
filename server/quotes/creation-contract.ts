import { HttpError } from "../http/errors.js";
import { canonicalDecimal } from "./model.js";

export type CreationInput = {
  source: null;
  quoteType: "processing" | "distribution";
  selection: { country: string | null; presetId: string | null };
  fields: { brandId: string | null; salespersonId: string | null; styleNo: string; styleName: string; quantity: string | null; garmentLeadDate: string | null; note: string };
  parameterOverrides: { laborCurrency?: "CNY" | "USD" | null; usdCnyRate?: string | null; markupRate?: string | null; includeFreight?: boolean | null; freightName?: string | null; freightAmount?: string | null };
};
export type CreationCommand = CreationInput & { clientRequestId: string; previewId: string; imageSelection: null };
export type CreationResult = { quoteId: string; revisionId: string; priceVersionId: string; version: number };
export type CreationReceipt = { state: "pending" | "committed" | "rejected"; result?: CreationResult; errorCode?: string; retryable: false };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function invalid(): never { throw new HttpError(400, "invalid_creation_input", "Invalid Quote creation input"); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) invalid();
  return result;
}
export function creationId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value.toLowerCase();
}
// Existing master identities are TEXT (including preserved non-UUID IDs).
function optionalId(value: unknown) { if (value === null) return null; const id = text(value, 256); if (!id) invalid(); return id; }
function text(value: unknown, max: number, nullable = false): string {
  if (nullable && value === null) return "";
  if (typeof value !== "string" || value.length > max) invalid();
  return value.trim();
}
function amount(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 128 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) invalid();
  return canonicalDecimal(value);
}
export function creationDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value < "0001-01-01" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid();
  return value;
}
export function parseCreationInput(value: unknown): CreationInput {
  const body = object(value, ["source", "quoteType", "selection", "fields", "parameterOverrides"]);
  if (body.source !== null || !["processing", "distribution"].includes(String(body.quoteType))) invalid();
  const selection = object(body.selection, ["country", "presetId"]);
  const fields = object(body.fields, ["brandId", "salespersonId", "styleNo", "styleName", "quantity", "garmentLeadDate", "note"]);
  const raw = object(body.parameterOverrides, ["laborCurrency", "usdCnyRate", "markupRate", "includeFreight", "freightName", "freightAmount"]);
  const overrides: CreationInput["parameterOverrides"] = {};
  for (const key of ["laborCurrency", "usdCnyRate", "markupRate", "includeFreight", "freightName", "freightAmount"] as const) {
    if (!Object.hasOwn(raw, key)) continue;
    const item = raw[key];
    if (key === "laborCurrency") {
      if (item !== null && item !== "CNY" && item !== "USD") invalid();
      overrides.laborCurrency = item;
    } else if (key === "includeFreight") {
      if (item !== null && typeof item !== "boolean") invalid();
      overrides.includeFreight = item;
    } else if (key === "freightName") overrides.freightName = item === null ? null : text(item, 200);
    else overrides[key] = amount(item);
  }
  return { source: null, quoteType: body.quoteType as CreationInput["quoteType"], selection: { country: selection.country === null ? null : text(selection.country, 200).normalize("NFKC") || null, presetId: optionalId(selection.presetId) },
    fields: { brandId: optionalId(fields.brandId), salespersonId: optionalId(fields.salespersonId), styleNo: text(fields.styleNo, 200), styleName: text(fields.styleName, 200, true), quantity: amount(fields.quantity), garmentLeadDate: creationDate(fields.garmentLeadDate), note: text(fields.note, 2000) }, parameterOverrides: overrides };
}
export function parseCreationCommand(value: unknown): CreationCommand {
  const body = object(value, ["clientRequestId", "previewId", "source", "quoteType", "selection", "fields", "parameterOverrides", "imageSelection"]);
  const { clientRequestId, previewId, imageSelection, ...input } = body;
  if (imageSelection !== null) invalid();
  return { ...parseCreationInput(input), clientRequestId: creationId(clientRequestId), previewId: creationId(previewId), imageSelection: null };
}
