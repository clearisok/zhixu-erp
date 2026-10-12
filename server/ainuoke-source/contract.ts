import { createHash } from "node:crypto";
import { adaptAinuokeOrderDiscoverySnapshots } from "../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js";
import type { AinuokeOrderDiscoveryQuery, AinuokeReportSnapshot } from "../../features/ainuoke-api/model/ainuoke-api.js";
import { normalizeAinuokeSalesContractNo, normalizeAinuokeInsideOrderNo } from "../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js";
import { projectMaterialProgress } from "../../features/ainuoke-material-progress/projection.js";
import type { VisibleMaterialOrder } from "../../features/ainuoke-material-progress/read-service.js";
export class SourceError extends Error {
    constructor(readonly code: string) { super(code); this.name = "SourceError"; }
}
export const sourceKeyValid = (key: string) => /^[a-z][a-z0-9_-]{2,63}$/u.test(key);
export const hash = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
function canonical(value: unknown): string {
    if (Array.isArray(value))
        return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object")
        return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
    return JSON.stringify(value);
}
export type SourceBundle = {
    schemaVersion: "ainuoke-server-source.v1";
    discoveryBefore: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
    discoveryAfter: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
    materials: Record<string, AinuokeReportSnapshot[]>;
};
function inspect(value: unknown, depth = 0): void {
    if (depth > 12)
        throw new SourceError("source_invalid");
    if (typeof value === "number" && !Number.isFinite(value))
        throw new SourceError("source_invalid");
    if (Array.isArray(value)) {
        for (const item of value)
            inspect(item, depth + 1);
    }
    else if (value && typeof value === "object")
        for (const [key, item] of Object.entries(value)) {
            if (/password|passwd|credential|authorization|cookie|token|session|^pwd$/iu.test(key))
                throw new SourceError("source_secret_field");
            inspect(item, depth + 1);
        }
}
function pagesValid(pages: Array<Pick<AinuokeReportSnapshot, "fetchedAt" | "pageSize" | "page" | "total">>, now: number, maxAgeMs: number) {
    if (!Array.isArray(pages) || !pages.length || pages.length > 200)
        throw new SourceError("source_invalid");
    for (const page of pages) {
        const timestamp = Date.parse(page.fetchedAt);
        if (!Number.isSafeInteger(page.total) || page.total < 0 || !Number.isSafeInteger(page.pageSize) || page.pageSize < 1
            || !Number.isSafeInteger(page.page) || page.page < 1 || !Number.isFinite(timestamp) || timestamp > now || now - timestamp > maxAgeMs)
            throw new SourceError("source_stale_or_invalid");
    }
}
export async function validateBundle(input: unknown, targets: VisibleMaterialOrder[], now: number, maxAgeMs: number) {
    try {
        if (!Number.isFinite(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1)
            throw new SourceError("invalid_source_policy");
        if (!input || typeof input !== "object" || Buffer.byteLength(JSON.stringify(input), "utf8") > 32 * 1024 * 1024)
            throw new SourceError("source_invalid");
        inspect(input);
        const bundle = structuredClone(input) as SourceBundle;
        if (bundle.schemaVersion !== "ainuoke-server-source.v1" || Object.keys(bundle).sort().join(",") !== "discoveryAfter,discoveryBefore,materials,schemaVersion"
            || !bundle.materials || Array.isArray(bundle.materials))
            throw new SourceError("source_invalid");
        pagesValid(bundle.discoveryBefore, now, maxAgeMs);
        pagesValid(bundle.discoveryAfter, now, maxAgeMs);
        const before = await adaptAinuokeOrderDiscoverySnapshots(bundle.discoveryBefore);
        const after = await adaptAinuokeOrderDiscoverySnapshots(bundle.discoveryAfter);
        if (before.snapshotHash !== after.snapshotHash)
            throw new SourceError("discovery_changed");
        const targetContracts = new Set(targets.map(o => normalizeAinuokeSalesContractNo(o.salesContractNo)));
        if (targetContracts.size !== targets.length || targetContracts.has("") || Object.keys(bundle.materials).some(k => !targetContracts.has(k)))
            throw new SourceError("source_scope_mismatch");
        const rows = [];
        for (const order of targets) {
            const contract = normalizeAinuokeSalesContractNo(order.salesContractNo);
            const discovered = after.rows.find(row => row.salesContractNo === contract);
            const pages = bundle.materials[contract];
            if (!discovered) {
                if (pages)
                    throw new SourceError("source_scope_mismatch");
                continue;
            }
            if (!pages)
                throw new SourceError("source_missing");
            pagesValid(pages, now, maxAgeMs);
            if (pages.some(p => normalizeAinuokeInsideOrderNo(p.queryContext.insideOrderNo) !== normalizeAinuokeInsideOrderNo(discovered.insideOrderNo)))
                throw new SourceError("source_scope_mismatch");
            const view = projectMaterialProgress({ salesContractNo: contract, styleNo: order.styleNo, insideOrderNo: order.insideOrderNo ?? "" }, pages);
            if (view.sourceStatus !== "ready")
                throw new SourceError("source_incomplete");
            rows.push({ order, contract, pages, contentHash: hash(pages) });
        }
        return { bundle, rows, contentHash: hash(bundle), capturedAt: new Date(now).toISOString() };
    }
    catch (error) {
        throw error instanceof SourceError ? error : new SourceError("source_invalid");
    }
}
