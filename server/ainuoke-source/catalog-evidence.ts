import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AdditionBundle, AdditionDiscoveryBundle } from './additions.js';
import { hash, SourceError, type SourceBundle } from './contract.js';

type Database = Pick<Pool | PoolClient, 'query'>;
type PackedPage = { metadata: Record<string, unknown>; rowsHash: string };
type PackedDirectory = { schemaVersion: 'ainuoke-packed-directory.v1'; discoveryBefore: PackedPage[]; discoveryAfter: PackedPage[] };

/** Called inside the publication transaction. No old rows are rewritten. */
export async function saveCatalogEvidence(c: Database, sourceKey: string, fingerprint: string, bundle: AdditionDiscoveryBundle) {
 const pack = async (pages: AdditionDiscoveryBundle['discoveryAfter']) => {
  const result: PackedPage[] = [];
  for (const page of pages) {
   const { rows, ...metadata } = page, rowsHash = hash(rows);
   await c.query(`INSERT INTO ainuoke_catalog_evidence_chunks(source_key,content_hash,rows) VALUES($1,$2,$3::jsonb)
    ON CONFLICT DO NOTHING`, [sourceKey, rowsHash, JSON.stringify(rows)]);
   result.push({ metadata, rowsHash });
  }
  return result;
 };
 const directory: PackedDirectory = { schemaVersion: 'ainuoke-packed-directory.v1',
  discoveryBefore: await pack(bundle.discoveryBefore), discoveryAfter: await pack(bundle.discoveryAfter) };
 const digest = hash(directory), id = randomUUID();
 const row = (await c.query(`INSERT INTO ainuoke_catalog_capture_evidence(id,source_key,account_fingerprint,content_hash,directory)
  VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING RETURNING id::text`, [id,sourceKey,fingerprint,digest,JSON.stringify(directory)])).rows[0]
  ?? (await c.query('SELECT id::text,account_fingerprint FROM ainuoke_catalog_capture_evidence WHERE source_key=$1 AND content_hash=$2', [sourceKey,digest])).rows[0];
 if (!row || row.account_fingerprint && row.account_fingerprint !== fingerprint) throw new SourceError('catalog_evidence_identity_changed');
 return row.id as string;
}

export async function loadCatalogEvidence(c: Database, sourceKey: string, id: string, fingerprint: string): Promise<AdditionDiscoveryBundle> {
 const row = (await c.query('SELECT account_fingerprint,directory,content_hash FROM ainuoke_catalog_capture_evidence WHERE source_key=$1 AND id=$2', [sourceKey,id])).rows[0];
 if (!row || row.account_fingerprint !== fingerprint || hash(row.directory) !== row.content_hash) throw new SourceError('catalog_evidence_invalid');
 const packed = row.directory as PackedDirectory;
 if (packed.schemaVersion !== 'ainuoke-packed-directory.v1' || !Array.isArray(packed.discoveryBefore) || !Array.isArray(packed.discoveryAfter)) throw new SourceError('catalog_evidence_invalid');
 const hashes = [...new Set([...packed.discoveryBefore,...packed.discoveryAfter].map(p=>p.rowsHash))];
 const chunks = (await c.query('SELECT content_hash,rows FROM ainuoke_catalog_evidence_chunks WHERE source_key=$1 AND content_hash=ANY($2::text[])', [sourceKey,hashes])).rows;
 const byHash = new Map(chunks.map(r=>[r.content_hash,r.rows]));
 const unpack = (pages: PackedPage[]) => pages.map(page=>{
  const rows = byHash.get(page.rowsHash);
  if (!Array.isArray(rows) || hash(rows) !== page.rowsHash || !page.metadata || typeof page.metadata !== 'object') throw new SourceError('catalog_evidence_invalid');
  return { ...page.metadata, rows };
 });
 return { schemaVersion:'ainuoke-order-addition-discovery.v1', discoveryBefore:unpack(packed.discoveryBefore), discoveryAfter:unpack(packed.discoveryAfter) } as AdditionDiscoveryBundle;
}

/** Both representations reconstruct the same original domain evidence. */
export async function hydrateContractEvidence(c: Database, row: {
 source_key: string; account_fingerprint: string; capture_evidence_id: string | null;
 evidence: Record<string, unknown>; content_hash: string;
}) {
 if (hash(row.evidence) !== row.content_hash) throw new SourceError('catalog_evidence_invalid');
 if (!row.capture_evidence_id) return row.evidence as unknown as { addition: AdditionBundle; materials: SourceBundle['materials'][string] };
 if (row.evidence.schemaVersion !== 'ainuoke-contract-observation.v2' || row.evidence.captureId !== row.capture_evidence_id) throw new SourceError('catalog_evidence_invalid');
 const directory = await loadCatalogEvidence(c,row.source_key,row.capture_evidence_id,row.account_fingerprint);
 return { addition:{ ...directory,schemaVersion:'ainuoke-order-addition.v1',colors:row.evidence.colors } as AdditionBundle, materials:row.evidence.materials as SourceBundle['materials'][string] };
}
