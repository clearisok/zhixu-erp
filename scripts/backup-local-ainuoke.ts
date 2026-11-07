import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from '../server/integration/postgres-container.js';

const arg=process.argv[2];if(!arg?.startsWith('--root='))throw Error('explicit_local_root_required');
const root=arg.slice(7),runtime=JSON.parse((await readFile(root+'/runtime.private.json','utf8')).replace(/^\uFEFF/,''));
if(runtime.containerName!=='weaveops-local-postgres'||!['127.0.0.1','localhost'].includes(new URL(runtime.databaseUrl).hostname))throw Error('local_target_mismatch');
const out=root+'/backups/pair-'+Date.now();await mkdir(out,{recursive:true});
const pool=new pg.Pool({connectionString:runtime.databaseUrl}),client=await pool.connect();
const counts=`SELECT (SELECT count(*)::int FROM sales_orders) orders,
 (SELECT count(*)::int FROM ainuoke_material_order_heads WHERE run_id IS NOT NULL) heads,
 (SELECT count(*)::int FROM ainuoke_material_source_snapshots) snapshots,
 (SELECT count(*)::int FROM ainuoke_sync_jobs WHERE status='queued') queued,
 (SELECT count(*)::int FROM ainuoke_sync_jobs WHERE status='running') running,
 (SELECT count(*)::int FROM quote_attachments) attachments`;
let expected;
try{
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
 expected=(await client.query(counts)).rows[0];
 await new Promise<void>((ok,fail)=>{const dest=createWriteStream(out+'/database.dump',{flags:'wx'}),p=spawn('docker',['exec',runtime.containerName,'pg_dump','-Fc','--snapshot='+snapshot,'-U','postgres','-d',new URL(runtime.databaseUrl).pathname.slice(1)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  p.stderr.resume();p.stdout.pipe(dest);p.on('error',()=>fail(Error('backup_spawn_failed')));p.on('close',code=>code===0?(dest.writableFinished?ok():dest.on('finish',ok)):fail(Error('backup_failed')));});
 await client.query('COMMIT');
}finally{await client.query('ROLLBACK').catch(()=>undefined);client.release();await pool.end();}
await cp(root+'/object-bundle',out+'/object-bundle',{recursive:true,errorOnExist:true,force:false});
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),objects=JSON.parse(await readFile(out+'/object-bundle/objects.json','utf8')).objects;
for(const object of objects){const bytes=await readFile(out+'/object-bundle/objects/'+object.id+'.bin');if(object.sha256&&sha(bytes)!==object.sha256)throw Error('attachment_hash_mismatch');}
const isolated=await startDisposablePostgres();let restored;
try{if(isolated.containerName===runtime.containerName)throw Error('restore_target_mismatch');const url=await isolated.createDatabase('local_background_restore');
 await new Promise<void>((ok,fail)=>{const p=spawn('docker',['exec','-i',isolated.containerName,'pg_restore','--exit-on-error','--no-owner','--no-privileges','-U','postgres','-d',new URL(url).pathname.slice(1)],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  p.stderr.resume();p.on('error',()=>fail(Error('restore_spawn_failed')));p.on('close',code=>code===0?ok():fail(Error('restore_failed')));createReadStream(out+'/database.dump').pipe(p.stdin);});
 const check=new pg.Pool({connectionString:url});try{restored=(await check.query(counts)).rows[0];if(JSON.stringify(restored)!==JSON.stringify(expected))throw Error('restore_count_mismatch');}finally{await check.end();}
}finally{await isolated.stop();}
const dump=await readFile(out+'/database.dump'),result={at:new Date().toISOString(),out,codeVersion:runtime.codeVersion,databaseBytes:dump.length,databaseSha256:sha(dump),objects:objects.length,expected,restored,state:'PAIR_RESTORE_VERIFIED',consistentSnapshot:true,sourceRequests:0};
await writeFile(out+'/manifest.json',JSON.stringify(result,null,2));await writeFile(root+'/latest-backup.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
