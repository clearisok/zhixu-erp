import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createDatabasePool} from '../db/pool.js';
import {verifyMigrationsCurrent} from '../db/migration-runner.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {identityUuid} from '../sales-orders/identity-model.js';
import {readPaymentPrivateJson} from './payment-private-files.js';
import {assertPrivateOutput,writePrivateReport} from './live-preflight.js';
import {SourceError,sourceKeyValid} from './contract.js';
import {previewBoundOrderRefresh,applyBoundOrderRefresh,readBoundOrderRefreshReceipt} from './bound-order-refresh.js';

const fail=(code:string):never=>{throw new SourceError(code);};
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
export function parseBoundRefreshArguments(args:string[]){
 const values=new Map<string,string>();
 for(const arg of args){const m=/^--([a-z][a-z0-9-]*)=(.+)$/u.exec(arg);if(!m||values.has(m[1]))return fail('bound_refresh_explicit_action_required');values.set(m[1],m[2]);}
 const action=values.get('action');
 const allowed=['action','job','job-sha256','private-output',...(action==='apply'?['request-id','expected-preview','execute']:action==='receipt'?['request-id']:[])];
 if(!['plan','apply','receipt'].includes(action??'')||[...values.keys()].some(key=>!allowed.includes(key))
  ||!isAbsolute(values.get('job')??'')||!sha(values.get('job-sha256'))||!isAbsolute(values.get('private-output')??'')
  ||action!=='plan'&&!identityUuid.test(values.get('request-id')??'')
  ||action==='apply'&&(!sha(values.get('expected-preview'))||values.get('execute')!=='I_CONFIRM_EXACT_SCOPE'))fail('bound_refresh_explicit_action_required');
 return {action:action as 'plan'|'apply'|'receipt',values};
}
export function parseBoundRefreshJob(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail('bound_refresh_invalid_job');
 const job=raw as Record<string,unknown>;
 if(Object.keys(job).sort().join(',')!=='accountFingerprint,databaseUrl,evidence,operatorUsername,salesOrderId,schemaVersion,sourceKey'
  ||job.schemaVersion!=='ainuoke-bound-order-refresh-job.v1'||typeof job.databaseUrl!=='string'||job.databaseUrl.length>4096
  ||typeof job.operatorUsername!=='string'||!job.operatorUsername||job.operatorUsername.length>64
  ||typeof job.sourceKey!=='string'||!sourceKeyValid(job.sourceKey)||!sha(job.accountFingerprint)
  ||typeof job.salesOrderId!=='string'||!identityUuid.test(job.salesOrderId))return fail('bound_refresh_invalid_job');
 let uri:URL;try{uri=new URL(job.databaseUrl);}catch{return fail('bound_refresh_invalid_job');}
 if(!['postgres:','postgresql:'].includes(uri.protocol)||!uri.hostname||!uri.username||uri.pathname.length<2||uri.hash
  ||/[\u0000-\u001f\u007f]/u.test(job.databaseUrl))fail('bound_refresh_invalid_job');
 const evidence=job.evidence as Record<string,unknown>;
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)||Object.keys(evidence).sort().join(',')!=='path,sha256'
  ||typeof evidence.path!=='string'||!isAbsolute(evidence.path)||!sha(evidence.sha256))return fail('bound_refresh_invalid_job');
 return {databaseUrl:job.databaseUrl,operatorUsername:job.operatorUsername,
  scope:{sourceKey:job.sourceKey,accountFingerprint:job.accountFingerprint,salesOrderId:job.salesOrderId},
  evidence:{path:evidence.path,sha256:evidence.sha256}};
}
/** Offline operator: no collector, credential loader, migration runner, scheduler
 * or HTTP writer. Exact evidence bytes are reviewed before any explicit apply. */
export async function runBoundRefreshOperator(parsed:ReturnType<typeof parseBoundRefreshArguments>,toolingCommit:string,reportWriter=writePrivateReport){
 if(!/^[a-f0-9]{40}$/u.test(toolingCommit))fail('bound_refresh_clean_checkout_required');
 const {action,values}=parsed;assertPrivateOutput(values.get('private-output')!);
 const job=parseBoundRefreshJob(readPaymentPrivateJson(values.get('job')!,values.get('job-sha256')!,65536));
 const pool=createDatabasePool({connectionString:job.databaseUrl,max:2,applicationName:'zhixu-bound-order-refresh'});
 pool.options.statement_timeout=30000;pool.options.query_timeout=35000;
 let result:unknown;
 try{
  await verifyMigrationsCurrent(pool,resolve('database/migrations'));
  const actor=await loadExistingBootstrapActor(pool,job.operatorUsername);
  if(action==='receipt')result=await readBoundOrderRefreshReceipt(pool,actor,values.get('request-id')!);
  else{
   const evidence=readPaymentPrivateJson(job.evidence.path,job.evidence.sha256,32*1024*1024);
   result=action==='plan'?await previewBoundOrderRefresh(pool,actor,job.scope,evidence)
    :await applyBoundOrderRefresh(pool,actor,job.scope,evidence,{requestId:values.get('request-id')!,expectedPreview:values.get('expected-preview')!});
  }
 }finally{await pool.end().catch(()=>undefined);}
 try{
  const report=reportWriter(values.get('private-output')!,{schemaVersion:'ainuoke-bound-order-refresh-private.v1',toolingCommit,action,result},'bound-order-refresh');
  return {result:action==='plan'?'READ_ONLY_PREVIEW_RECORDED':action==='apply'?'REFRESH_RECEIPT_RECORDED':'RECEIPT_READ_RECORDED',
   action,sourceReadThisInvocation:'none',automaticRetry:false,databaseWrites:action==='apply'?'explicit_apply_only':'none',...report};
 }catch{return {result:'PRIVATE_REPORT_UNAVAILABLE',sourceReadThisInvocation:'none',automaticRetry:false,inspectOriginalReceiptBeforeRetry:true};}
}
export async function main(args=process.argv.slice(2)){
 if(args.length===1&&args[0]==='--help'){
  process.stdout.write('Offline bound-order refresh: --action=plan|apply|receipt --job=<absolute private JSON> --job-sha256=<SHA256> --private-output=<protected ignored directory>.\nApply requires --request-id=<UUID> --expected-preview=<reviewed hash> --execute=I_CONFIRM_EXACT_SCOPE; receipt uses the original --request-id.\nNo source HTTP, credential loading, migration, activation, scheduler, automatic retries or deployment. A preview is not execution authorization.\n');return;
 }
 try{
  const parsed=parseBoundRefreshArguments(args),entry=fileURLToPath(import.meta.url),expected=resolve('server/ainuoke-source/bound-order-refresh-cli.ts');
  if((process.platform==='win32'?entry.toLowerCase():entry)!==(process.platform==='win32'?expected.toLowerCase():expected))fail('bound_refresh_clean_checkout_required');
  const git=(values:string[])=>execFileSync('git',values,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],maxBuffer:262144}).trim();
  const head=git(['rev-parse','--verify','HEAD']);
  if(git(['status','--porcelain','--untracked-files=normal'])
   ||readFileSync(entry,'utf8').replace(/\r\n/g,'\n').trim()!==git(['show',head+':server/ainuoke-source/bound-order-refresh-cli.ts']).replace(/\r\n/g,'\n'))
   fail('bound_refresh_clean_checkout_required');
  const result=await runBoundRefreshOperator(parsed,head);process.stdout.write(JSON.stringify(result)+'\n');
  if(result.result==='PRIVATE_REPORT_UNAVAILABLE')process.exitCode=2;
 }catch(error){
  const code=error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'&&/^(bound_refresh_|invalid_bound_refresh_|authentication_required$|permission_denied$|pending_migrations$)/u.test(error.code)?error.code:'bound_refresh_unavailable';
  process.stdout.write(JSON.stringify({result:'FAIL',code,automaticRetry:false,sourceReadThisInvocation:'none'})+'\n');process.exitCode=1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main();
