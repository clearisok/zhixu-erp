import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';

/** Called within the binding transaction. Queue fresh evidence, never relabel an
 * old observation as a fresh publication. The worker rechecks actor and scope. */
export async function requestMissingMaterialPublication(client:PoolClient, actor:TrustedIdentity,
  order:{id:string;sourceId:string;salesContractNo:string}) {
  if (!(['ainuoke.sync','style_progress.import'] as const).every(key=>actor.permissions.includes(key))) return;
  const schema=(await client.query("SELECT to_regclass('public.ainuoke_sync_jobs') IS NOT NULL AND to_regclass('public.ainuoke_material_order_heads') IS NOT NULL AS ready")).rows[0];
  if (!schema.ready) return;
  const scopes=(await client.query(`SELECT e.source_key FROM ainuoke_catalog_entries e
    JOIN ainuoke_source_profiles p ON p.source_key=e.source_key AND p.enabled=true
    WHERE e.source_id=$1 AND e.sales_contract_no=$2 AND e.visible=true`,[order.sourceId,order.salesContractNo])).rows;
  if (scopes.length>1) throw new Error('material_publication_source_ambiguous');
  if (!scopes.length) return;
  const sourceKey=scopes[0].source_key;
  const published=await client.query(`SELECT 1 FROM ainuoke_material_order_heads h
    JOIN ainuoke_material_source_snapshots s ON s.run_id=h.run_id AND s.sales_order_id=h.sales_order_id
    WHERE h.source_key=$1 AND h.sales_order_id=$2 AND s.sales_contract_no=$3`,[sourceKey,order.id,order.salesContractNo]);
  if (published.rowCount) return;
  await client.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by)
    VALUES($1,$2,$3,$4,'manual','queued',$5) ON CONFLICT DO NOTHING`,
    [randomUUID(),sourceKey,order.sourceId,order.salesContractNo,actor.internalUserId]);
  await client.query("SELECT pg_notify('ainuoke_sync_requested',$1)",[sourceKey]);
}
