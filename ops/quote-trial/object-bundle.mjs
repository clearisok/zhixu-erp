// Run with the reviewed app image, explicit offline maintenance, read-only secret mounts.
// No bucket listing/GC; only DB-referenced available objects. Never an HTTP endpoint.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const {default:pg}=await import('/app/node_modules/pg/lib/index.js');
const {loadServerConfig}=await import('/app/dist/server/server/config.js');
const {S3AttachmentStorage}=await import('/app/dist/server/server/attachments/s3-storage.js');
const [mode,ack]=process.argv.slice(2);
let pool,storage;
try {
  if(!['export','restore'].includes(mode)||ack!=='--execute')throw Error('explicit_operation_required');
  // Verify the kernel mount, including the default configured bundle. Restore
  // must never be able to repair or overwrite its backup input.
  const bundleReadOnly=mode==='restore'&&(await readFile('/proc/self/mountinfo','utf8')).split('\n').some(line=>{
    const fields=line.split(' ');return fields[4]==='/bundle'&&fields[5]?.split(',').includes('ro');
  });
  if(mode==='restore'&&!bundleReadOnly)throw Error('read_only_restore_bundle_required');
  const config=loadServerConfig();if(config.attachmentStorage.kind!=='s3')throw Error('s3_required');
  pool=new pg.Pool({connectionString:config.databaseUrl});storage=new S3AttachmentStorage(config.attachmentStorage);
  const db=(await pool.query('SELECT current_database() name')).rows[0].name;if(db!=='quote_trial')throw Error('trial_database_required');
  if(Number((await pool.query("SELECT count(*) n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")).rows[0].n)!==0)throw Error('maintenance_no_other_clients_required');
  if(Number((await pool.query("SELECT count(*) n FROM quote_attachments WHERE lifecycle<>'available'")).rows[0].n)!==0)throw Error('unfinished_upload_requires_review');
  // All available metadata-owned objects, including unlinked rows whose upload replay
  // remains legal. Do not scan the bucket or adopt unrelated objects.
  const rows=(await pool.query(`SELECT a.id::text,a.storage_provider provider,a.storage_container container,a.storage_key key,a.byte_size::text bytes,a.sha256
    FROM quote_attachments a WHERE a.lifecycle='available' ORDER BY a.id::text`)).rows;
  for(const row of rows)if(row.provider!=='s3'||row.container!==storage.container||row.key!==`attachments/${row.id}/original`||!/^\d+$/.test(row.bytes)||!/^[0-9a-f]{64}$/.test(row.sha256))throw Error('object_identity_invalid');
  const sha=b=>createHash('sha256').update(b).digest('hex');
  const download=async row=>{const body=await storage.get(row.key);if(!body)throw Error('missing_object');const pieces=[];for await(const chunk of body)pieces.push(Buffer.from(chunk));const b=Buffer.concat(pieces);if(String(b.length)!==row.bytes||sha(b)!==row.sha256)throw Error('object_integrity_failed');return b;};
  await mkdir('/bundle/objects',{recursive:true});
  if(mode==='export') {
    for(const row of rows)await writeFile(join('/bundle/objects',`${row.id}.bin`),await download(row),{flag:'wx',mode:0o600});
    await writeFile('/bundle/objects.json',JSON.stringify({contract:'zhixu-trial-objects.v1',database:db,objects:rows})+'\n',{flag:'wx',mode:0o600});
  } else {
    const manifest=JSON.parse(await readFile('/bundle/objects.json','utf8'));
    if(manifest.contract!=='zhixu-trial-objects.v1'||manifest.database!==db||Object.keys(manifest).sort().join(',')!=='contract,database,objects'||JSON.stringify(manifest.objects)!==JSON.stringify(rows))throw Error('manifest_database_mismatch');
    // Validate every byte before any object mutation. Existing mismatched objects are never overwritten.
    const data=[];for(const row of rows){const b=await readFile(join('/bundle/objects',`${row.id}.bin`));if(String(b.length)!==row.bytes||sha(b)!==row.sha256)throw Error('backup_integrity_failed');const stat=await storage.head(row.key);if(stat&&(String(stat.byteSize)!==row.bytes||stat.sha256!==row.sha256))throw Error('target_object_collision');data.push(b);}
    for(let i=0;i<rows.length;i++){if(!(await storage.head(rows[i].key)))await storage.put(rows[i].key,data[i],'application/octet-stream');await download(rows[i]);}
  }
  console.log(JSON.stringify({operation:mode,referencedObjects:rows.length,integrity:'PASS',...(mode==='restore'?{bundleReadOnly}:{})}));
} catch {console.error('trial_object_bundle_failed_keep_maintenance');process.exitCode=1;}
finally {storage?.destroy();await pool?.end();}
