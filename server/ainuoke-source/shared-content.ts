import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AinuokeReportSnapshot } from '../../features/ainuoke-api/model/ainuoke-api.js';
import { hash, SourceError } from './contract.js';

type Database = Pick<Pool | PoolClient, 'query'>;
type AnyPage = AinuokeReportSnapshot<Record<string, unknown>>;
export type ContentScope = { sourceKey: string; accountFingerprint: string; sourceId: string; contract: string; kind: 'materials' | 'colors' };
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const compare = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
/** Versioned typed JSON encoding. No locale, coercion, rounding or removal of business dates. */
export function businessCanonical(value: unknown): string {
 if (value === null) return 'z';
 if (typeof value === 'string') return `s${Buffer.byteLength(value)}:${value}`;
 if (typeof value === 'boolean') return value ? 't' : 'f';
 if (typeof value === 'number') {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new SourceError('content_number_unsafe');
  return `n${JSON.stringify(value)};`;
 }
 if (Array.isArray(value)) return `a${value.length}[${value.map(businessCanonical).join('')}]`;
 if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
  const entries = Object.entries(value).sort(([a], [b]) => compare(a, b));
  return `o${entries.length}{${entries.map(([k, v]) => businessCanonical(k) + businessCanonical(v)).join('')}}`;
 }
 throw new SourceError('content_json_invalid');
}
export const businessDigest = (value: unknown) => createHash('sha256').update(businessCanonical(value)).digest('hex');
type Group = { reportId: string; queryContext: Json; rows: Json[] };
type ManifestPage = { metadata: Omit<AnyPage, 'rows'>; group: number; ordinals: number[]; identities?: string[]; identityOverrides?: Array<[number,string]> };
export type PackedPages = { schemaVersion: 'ainuoke-shared-pages.v1'; contentId: string; captureHash: string; manifest: ManifestPage[] };
type Content = { schemaVersion: 'ainuoke-business-content.v1'; scope: ContentScope; groups: Group[] };
const unorderedReports = new Set(['6087050', '6087051', '6086997', '6087105', '6086405', '6086408', '6086875', '6086354']);

export function packContent(scope: ContentScope, pages: AnyPage[]) {
 if (!pages.length || pages.length > 200) throw new SourceError('content_pages_invalid');
 const groups = new Map<string, Group>();
 for (const page of pages) {
  if (!unorderedReports.has(page.reportId)||(['6086997','6087105'].includes(page.reportId)!==(scope.kind==='colors'))) throw new SourceError('content_report_unsupported');
  if(page.schemaVersion!=='ainuoke-direct-read.v2'||Object.keys(page).sort().join(',')!=='fetchedAt,page,pageSize,queryContext,reportId,rows,schemaVersion,snapshotHash,total')throw new SourceError('content_page_schema_unknown');
  const key = businessCanonical([page.reportId, page.queryContext]);
  const group = groups.get(key) ?? { reportId: page.reportId, queryContext: structuredClone(page.queryContext) as Json, rows: [] };
  group.rows.push(...page.rows.map(({ sourceRowIdentity, ...row }) => { void sourceRowIdentity; return structuredClone(row) as Json; }));
  groups.set(key, group);
 }
 const entries = [...groups].sort(([a], [b]) => compare(a, b));
 const body: Content = { schemaVersion: 'ainuoke-business-content.v1', scope: { ...scope }, groups: entries.map(([, group]) => ({ ...group, rows: group.rows.sort((a, b) => compare(businessCanonical(a), businessCanonical(b))) })) };
 const identityMap:string[][]=body.groups.map(group=>group.rows.map(()=>''));
 const manifest = pages.map(page => {
  const { rows, ...metadata } = page;
  const group = entries.findIndex(([key]) => key === businessCanonical([page.reportId, page.queryContext]));
  // Repeated rows retain multiplicity in the body and repeated mappings in the capture.
  const available = new Map<string, number[]>();
  body.groups[group].rows.forEach((row, i) => { const key = businessCanonical(row); available.set(key, [...(available.get(key) ?? []), i]); });
  const ordinals = rows.map(({ sourceRowIdentity, ...row }) => {
   void sourceRowIdentity;
   const index = available.get(businessCanonical(row))?.shift();
   if (index === undefined) throw new SourceError('content_manifest_invalid');
   return index;
  });
  const identities=rows.map(row=>row.sourceRowIdentity);
  ordinals.forEach((ordinal,i)=>{identityMap[group][ordinal]||=identities[i];});
  return { metadata: structuredClone(metadata), group, ordinals, identities };
 });
 return { body, identityMap, businessHash: businessDigest(body), canonicalSize: Buffer.byteLength(businessCanonical(body)), manifest, captureHash: hash(pages) };
}

export async function saveSharedPages(db: Database, scope: ContentScope, pages: AnyPage[]): Promise<PackedPages> {
 const packed = packContent(scope, pages), id = randomUUID();
 const stored = (await db.query(`INSERT INTO ainuoke_contract_contents(id,source_key,account_fingerprint,source_id,sales_contract_no,kind,business_hash,body,canonical_size,identity_map)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb) ON CONFLICT(source_key,account_fingerprint,source_id,sales_contract_no,kind,business_hash) DO NOTHING RETURNING id::text,body,canonical_size,identity_map`,
 [id,scope.sourceKey,scope.accountFingerprint,scope.sourceId,scope.contract,scope.kind,packed.businessHash,JSON.stringify(packed.body),packed.canonicalSize,JSON.stringify(packed.identityMap)])).rows[0]
 ?? (await db.query(`SELECT id::text,body,canonical_size,identity_map FROM ainuoke_contract_contents WHERE source_key=$1 AND account_fingerprint=$2 AND source_id=$3 AND sales_contract_no=$4 AND kind=$5 AND business_hash=$6`,
 [scope.sourceKey,scope.accountFingerprint,scope.sourceId,scope.contract,scope.kind,packed.businessHash])).rows[0];
 if (!stored || Number(stored.canonical_size) !== packed.canonicalSize || businessCanonical(stored.body) !== businessCanonical(packed.body)) throw new SourceError('content_integrity_failure');
 const manifest:ManifestPage[]=packed.manifest.map(page=>({metadata:page.metadata,group:page.group,ordinals:page.ordinals,
  identityOverrides:page.identities.flatMap((identity,i)=>stored.identity_map[page.group]?.[page.ordinals[i]]===identity?[]:[[i,identity] as [number,string]])}));
 return { schemaVersion: 'ainuoke-shared-pages.v1', contentId: stored.id, captureHash: packed.captureHash, manifest };
}

export async function hydrateSharedPages(db: Database, sourceKey: string, pages: AinuokeReportSnapshot[] | unknown[], expected?: Partial<ContentScope>): Promise<AinuokeReportSnapshot[]> {
 const marker = pages[0] as PackedPages | undefined;
 if (marker?.schemaVersion !== 'ainuoke-shared-pages.v1') return pages as AinuokeReportSnapshot[];
 if (pages.length !== 1 || !Array.isArray(marker.manifest)) throw new SourceError('content_manifest_invalid');
 const stored = (await db.query(`SELECT c.*,p.account_fingerprint AS current_account FROM ainuoke_contract_contents c JOIN ainuoke_source_profiles p USING(source_key) WHERE c.id=$1 AND c.source_key=$2`, [marker.contentId,sourceKey])).rows[0];
 if (!stored || stored.account_fingerprint !== stored.current_account) throw new SourceError('content_scope_invalid');
 const body = stored.body as Content;
 const scope: ContentScope = { sourceKey, accountFingerprint: stored.account_fingerprint, sourceId: stored.source_id, contract: stored.sales_contract_no, kind: stored.kind };
 if (body.schemaVersion !== 'ainuoke-business-content.v1' || businessCanonical(body.scope) !== businessCanonical(scope)
  || Object.entries(expected ?? {}).some(([k, v]) => scope[k as keyof ContentScope] !== v)
  || businessDigest(body) !== stored.business_hash || Buffer.byteLength(businessCanonical(body)) !== Number(stored.canonical_size)) throw new SourceError('content_integrity_failure');
 const hydrated = marker.manifest.map(page => {
  const group = body.groups[page.group];
  if (!group || !Array.isArray(page.ordinals) || page.identities&&page.ordinals.length !== page.identities.length || group.reportId !== page.metadata.reportId || businessCanonical(group.queryContext) !== businessCanonical(page.metadata.queryContext)) throw new SourceError('content_manifest_invalid');
  const overrides=new Map<number,string>();
  for(const entry of page.identityOverrides??[]){if(!Array.isArray(entry)||entry.length!==2||!Number.isSafeInteger(entry[0])||entry[0]<0||entry[0]>=page.ordinals.length||typeof entry[1]!=='string'||overrides.has(entry[0]))throw new SourceError('content_manifest_invalid');overrides.set(entry[0],entry[1]);}
  const rows = page.ordinals.map((ordinal, i) => {
   const identity=page.identities?.[i]??overrides.get(i)??stored.identity_map?.[page.group]?.[ordinal];
   if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= group.rows.length || typeof identity !== 'string'||!identity) throw new SourceError('content_manifest_invalid');
   return { ...(structuredClone(group.rows[ordinal]) as object), sourceRowIdentity: identity };
  });
  return { ...structuredClone(page.metadata), rows } as AinuokeReportSnapshot;
 });
 if (hash(hydrated) !== marker.captureHash) throw new SourceError('content_capture_invalid');
 return hydrated;
}

export async function supportsSharedContent(db: Database): Promise<boolean> {
 return (await db.query("SELECT to_regclass('ainuoke_contract_contents') IS NOT NULL AS ready")).rows[0].ready;
}
