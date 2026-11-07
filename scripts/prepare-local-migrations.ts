import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';
import {verifyMigrationsCurrent} from '../server/db/migration-runner.js';
const arg=process.argv[2];if(!arg?.startsWith('--root='))throw Error('explicit_local_root_required');
const root=resolve(arg.slice(7)),read=async(name:string)=>JSON.parse((await readFile(root+'/'+name,'utf8')).replace(/^\uFEFF/,''));
const runtime=await read('runtime.private.json'),service=await read('service.private.json'),url=new URL(runtime.databaseUrl);
if(!['127.0.0.1','localhost'].includes(url.hostname)||runtime.containerName!=='weaveops-local-postgres')throw Error('local_target_mismatch');
const pool=new pg.Pool({connectionString:runtime.databaseUrl});
try{
 const ledger=(await pool.query('SELECT filename,checksum FROM schema_migrations')).rows;
 const directory=root+'/verified-migrations/'+service.codeVersion;await mkdir(directory,{recursive:true});
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex');let normalized=0;
 for(const file of await readdir(resolve('database/migrations'))){if(!file.endsWith('.sql'))continue;
  const text=await readFile(resolve('database/migrations',file),'utf8'),lf=text.replace(/\r\n/g,'\n'),saved=ledger.find(x=>x.filename===file);
  const exact=saved?(hash(text)===saved.checksum?text:hash(lf)===saved.checksum?lf:null):text;
  if(exact===null)throw Error('migration_content_mismatch');if(exact!==text)normalized++;
  await writeFile(directory+'/'+file,exact);
 }
 // Preserve the ledger and require its original exact checksums; no schema runs.
 await verifyMigrationsCurrent(pool,directory);
 await writeFile(root+'/service.private.json',JSON.stringify({...service,migrationsDirectory:directory},null,2));
 const proof={at:new Date().toISOString(),state:'EXACT_EXISTING_MIGRATIONS_VERIFIED',ledger:ledger.length,normalizedLineEndings:normalized,directory,schemaChanges:0};
 await writeFile(root+'/migration-integrity-verified.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await pool.end();}
