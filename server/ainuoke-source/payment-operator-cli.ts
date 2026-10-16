import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createDatabasePool } from '../db/pool.js';
import { verifyMigrationsCurrent } from '../db/migration-runner.js';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.js';
import { UUID_PATTERN } from '../sales-orders/delivery-plan-model.js';
import { SourceError } from './contract.js';
import { assertPrivateOutput, writePrivateReport } from './live-preflight.js';
import { parsePaymentCollectionRequest, type PaymentCollectionRequest } from './payment-request-collection.js';
import { planPaymentTargets, applyPaymentTargets } from './payment-targets.js';
import { verifyPaymentTargetEvidence } from './payment-target-verification.js';
import { planPaymentOperatorCollection, collectPaymentOnce } from './payment-operator-collection.js';
import { readPaymentOperatorCommand, parsePaymentOperatorPermit } from './payment-operator-command-store.js';
import { readPaymentCredential, readPaymentPrivateJson } from './payment-private-files.js';

const fail = (code: string): never => { throw new SourceError(code); };
const sha = (s: unknown): s is string => typeof s==='string' && /^[a-f0-9]{64}$/u.test(s);
const actions=['plan-targets','apply-targets','plan-collection','collect-once','receipt'] as const;
export function paymentOperatorArguments(args: string[]) {
  const values=new Map<string,string>();
  for(const arg of args){const match=/^--([a-z-]+)=(.+)$/u.exec(arg);
    if(!match||values.has(match[1]))return fail('payment_operator_explicit_action_required');values.set(match[1],match[2]);}
  const selected=actions.filter(action=>values.has(action));
  if(selected.length!==1)fail('payment_operator_explicit_action_required');
  const action=selected[0], targetAction=values.get(action)!;
  const allowed=[action,'job','expected-job','private-output','request-id',...(action!=='receipt'?['expires-at']:[]),
    ...(['apply-targets','collect-once'].includes(action)?['scope-hash','execute']:[]),...(action==='collect-once'?['credential-file']:[])];
  if([...values.keys()].some(key=>!allowed.includes(key)) || !isAbsolute(values.get('job')??'') || !sha(values.get('expected-job'))
    ||!isAbsolute(values.get('private-output')??'')||!UUID_PATTERN.test(values.get('request-id')??'')
    ||(['plan-targets','apply-targets'].includes(action)?!['enable','disable'].includes(targetAction):targetAction!=='6086941')
    || action!=='receipt'&&!values.get('expires-at')
    || ['apply-targets','collect-once'].includes(action)&&(!sha(values.get('scope-hash'))||values.get('execute')!=='I_CONFIRM_EXACT_SCOPE')
    || action==='collect-once'&&!isAbsolute(values.get('credential-file')??''))fail('payment_operator_explicit_action_required');
  if(action!=='receipt')parsePaymentOperatorPermit({requestId:values.get('request-id'),expiresAt:values.get('expires-at'),scopeHash:values.get('scope-hash')??'0'.repeat(64)});
  return {action,targetAction,values};
}

export function parsePaymentOperatorJob(input: unknown) {
  if(!input||typeof input!=='object'||Array.isArray(input))return fail('payment_operator_invalid_job');
  const job=input as Record<string,unknown>;
  if(Object.keys(job).sort().join(',')!=='databaseUrl,operatorUsername,schemaVersion,selection,source,targets,verification'
    ||job.schemaVersion!=='ainuoke-payment-operator-job.v1'||typeof job.databaseUrl!=='string'||typeof job.operatorUsername!=='string'
    || !job.source||typeof job.source!=='object'||Array.isArray(job.source))return fail('payment_operator_invalid_job');
  const source=job.source as Record<string,unknown>;
  if(Object.keys(source).sort().join(',')!=='baseUrl,sourceKey,transportPolicy,username')return fail('payment_operator_invalid_job');
  let uri: URL;try{uri=new URL(job.databaseUrl);}catch{return fail('payment_operator_invalid_job');}
  if(!['postgres:','postgresql:'].includes(uri.protocol)||!uri.hostname||!uri.username||uri.pathname.length<2||uri.hash
    ||job.databaseUrl.length>4096||/[\u0000-\u001f\u007f]/u.test(job.databaseUrl))return fail('payment_operator_invalid_job');
  const request=parsePaymentCollectionRequest({config:{...source,operatorUsername:job.operatorUsername,password:'NOT-LOADED-FOR-PLAN'},
    selection:job.selection,targets:job.targets} as PaymentCollectionRequest);
  let verification:{path:string;sha256:string}|null=null;
  if(job.verification!==null){
    const v=job.verification as Record<string,unknown>;
    if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='path,sha256'
      ||typeof v.path!=='string'||!isAbsolute(v.path)||!sha(v.sha256))return fail('payment_operator_invalid_job');
    verification={path:v.path,sha256:v.sha256};
  }
  return {databaseUrl:job.databaseUrl,request,verification};
}

/** Internal testable orchestrator. The executable below separately requires a
 * clean committed checkout; no CLI option can bypass it or inject a worker. */
export async function runPaymentOperator(parsed:ReturnType<typeof paymentOperatorArguments>,toolingCommit:string,
  options:Parameters<typeof collectPaymentOnce>[4]={}) {
  if(!/^[a-f0-9]{40}$/u.test(toolingCommit))fail('payment_operator_committed_clean_worktree_required');
  const {values,action,targetAction}=parsed,now=options.now??Date.now;
  assertPrivateOutput(values.get('private-output')!);
  const job=parsePaymentOperatorJob(readPaymentPrivateJson(values.get('job')!,values.get('expected-job')!,65536));
  const {request}=job, requestId=values.get('request-id')!, expiresAt=values.get('expires-at')!;
  const permit={requestId,expiresAt,scopeHash:values.get('scope-hash')!};
  const pool=createDatabasePool({connectionString:job.databaseUrl,max:2,applicationName:'zhixu-payment-operator'});
  pool.options.statement_timeout=15000;pool.options.query_timeout=20000;
  let result:Record<string,unknown>;
  try {
    // Inspection only. This executable never applies migrations or creates users.
    await verifyMigrationsCurrent(pool,resolve('database/migrations'));
    const actor=await loadExistingBootstrapActor(pool,request.config.operatorUsername);
    if(action==='receipt'){
      const stored=await readPaymentOperatorCommand(pool,actor,request.config.sourceKey,requestId);
      result={requestId,receiptState:stored?.state??'not_found',historicalReceipt:stored,sourceReadThisInvocation:'none',
        absenceProvesNoPriorWork:false};
    } else if(action==='plan-targets'||action==='apply-targets'){
      const proof=targetAction==='enable'?(()=>{
        if(!job.verification)return fail('payment_operator_verification_required');
        return verifyPaymentTargetEvidence(readPaymentPrivateJson(job.verification.path,job.verification.sha256,128*1024*1024),
          job.verification.sha256,request,now());
      })():null;
      result=action==='plan-targets'?await planPaymentTargets(pool,actor,request,targetAction as 'enable'|'disable',proof,{requestId,expiresAt},now())
        :await applyPaymentTargets(pool,actor,request,targetAction as 'enable'|'disable',proof,permit,now());
    } else if(action==='plan-collection') {
      result=await planPaymentOperatorCollection(pool,actor,request,{requestId,expiresAt},now);
    } else {
      // Validate the scope before opening the source secret. A replay can be
      // queried through --receipt without any credential file at all.
      const existing=await readPaymentOperatorCommand(pool,actor,request.config.sourceKey,requestId);
      if(!existing){
        const plan=await planPaymentOperatorCollection(pool,actor,request,{requestId,expiresAt},now);
        if(plan.scopeHash!==permit.scopeHash)fail('payment_operator_scope_changed');
        request.config.password=readPaymentCredential(values.get('credential-file')!,request.config.username);
      }
      result=await collectPaymentOnce(pool,actor,request,permit,options);
    }
  } finally { request.config.password='CLEARED';await pool.end().catch(()=>undefined); }
  // The literal plan disclaimer is re-keyed; never weaken the shared secret
  // inspector just to allow an arbitrary Authorization-like field in a report.
  if(result.authorization==='not_granted_by_plan'){
    const {authorization,...facts}=result;void authorization;result={...facts,humanApproval:'still_required'};
  }
  let report:ReturnType<typeof writePrivateReport>;
  try { report=writePrivateReport(values.get('private-output')!,{schemaVersion:'ainuoke-payment-operator-private.v1',
    toolingCommit,action,targetAction,requestId,jobSha256:values.get('expected-job'),result},'payment-request'); }
  catch { return {schemaVersion:'ainuoke-payment-operator.v1',result:'PRIVATE_REPORT_UNAVAILABLE',requestId,
    receiptState:'inspect_durable_receipt_before_any_retry',automaticRetry:false}; }
  const historical=result.historicalReceipt&&typeof result.historicalReceipt==='object'?result.historicalReceipt as Record<string,unknown>:null;
  const candidate=action==='receipt'?historical?.result:result.result;
  const current=candidate&&typeof candidate==='object'?candidate as Record<string,unknown>:{};
  const number=(name:string)=>Number.isSafeInteger(current[name])&&Number(current[name])>=0?current[name]:undefined;
  const allowedResults=['PAYMENT_COLLECTION_PUBLISHED','PAYMENT_COLLECTION_PARTIAL','PAYMENT_COLLECTION_NOT_PUBLISHED','PAYMENT_COLLECTION_UNVERIFIED','UNVERIFIED'];
  const operationResult=typeof current.result==='string'&&allowedResults.includes(current.result)?current.result
    :current.schemaVersion==='ainuoke-payment-target-result.v1'?'TARGET_CHANGE_COMPLETED':undefined;
  return {schemaVersion:'ainuoke-payment-operator.v1',result:action.startsWith('plan-')?'READ_ONLY_PLAN_RECORDED':'OPERATOR_RECEIPT_RECORDED',
    action,requestId,scopeHash:typeof result.scopeHash==='string'?result.scopeHash:undefined,
    expiresAt:typeof result.expiresAt==='string'?result.expiresAt:undefined,
    receiptState:typeof result.receiptState==='string'?result.receiptState:undefined,replayed:result.replayed===true,
    receiptIsHistorical:action==='receipt'||result.receiptIsHistorical===true,operationResult,
    changedTargets:number('changedTargets'),published:number('published'),unresolved:number('unresolved'),
    sourceReadThisInvocation:result.sourceReadThisInvocation??'none',automaticRetry:false,
    databaseWrites:action==='plan-targets'||action==='plan-collection'||action==='receipt'?'none':'explicit_action_only',
    ...report};
}

const safeCodes=new Set(['payment_operator_explicit_action_required','payment_operator_private_file_invalid','payment_operator_invalid_job',
  'payment_operator_committed_clean_worktree_required','payment_operator_verification_required','payment_operator_verification_invalid',
  'payment_operator_scope_changed','payment_operator_request_conflict','payment_operator_permit_expired','payment_operator_invalid_permit',
  'permission_denied','source_actor_unavailable','bootstrap_actor_unavailable','pending_migrations','payment_source_not_connected',
  'payment_collection_binding_mismatch','payment_collection_operator_mismatch','payment_operator_profile_missing','payment_operator_profile_mismatch',
  'payment_operator_target_account_mismatch','preflight_private_output_required']);
export async function main(args=process.argv.slice(2)) {
  if(args.length===1&&args[0]==='--help'){
    process.stdout.write('6086941 operator: --plan-targets=enable|disable, --apply-targets=enable|disable, --plan-collection=6086941, --collect-once=6086941 or --receipt=6086941.\nAll require --job=<absolute private JSON> --expected-job=<SHA256> --private-output=<protected ignored directory> --request-id=<UUID>.\nPlans/actions require --expires-at=<UTC ISO>; writes also --scope-hash=<exact plan> --execute=I_CONFIRM_EXACT_SCOPE. Only collect-once requires --credential-file=<private local file>.\nNo migrations, bootstrap, HTTP writer, scheduler, automatic retries or deployments. A plan/hash does not grant human authorization.\n');return;
  }
  try {
    const parsed=paymentOperatorArguments(args);
    // This operator is deliberately a source-checkout tool, not a stale copied
    // build. The Git commit must describe the very entry being executed.
    const expectedEntry=resolve('server/ainuoke-source/payment-operator-cli.ts');
    const actualEntry=fileURLToPath(import.meta.url);
    if((process.platform==='win32'?actualEntry.toLowerCase():actualEntry)!==(process.platform==='win32'?expectedEntry.toLowerCase():expectedEntry))
      fail('payment_operator_committed_clean_worktree_required');
    const toolingCommit=execFileSync('git',['rev-parse','--verify','HEAD'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
    const committedEntry=execFileSync('git',['show',toolingCommit+':server/ainuoke-source/payment-operator-cli.ts'],
      {encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],maxBuffer:262144});
    if(readFileSync(actualEntry,'utf8').replace(/\r\n/g,'\n')!==committedEntry.replace(/\r\n/g,'\n'))
      fail('payment_operator_committed_clean_worktree_required');
    const dirty=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
    if(dirty)fail('payment_operator_committed_clean_worktree_required');
    const output=await runPaymentOperator(parsed,toolingCommit);
    process.stdout.write(JSON.stringify(output)+'\n');
    if(output.result==='PRIVATE_REPORT_UNAVAILABLE'||'receiptState'in output&&output.receiptState!==undefined&&output.receiptState!=='completed'
      ||'operationResult'in output&&output.operationResult!==undefined&&!['PAYMENT_COLLECTION_PUBLISHED','TARGET_CHANGE_COMPLETED'].includes(output.operationResult))process.exitCode=2;
  } catch(error) {
    const code=error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'&&safeCodes.has(error.code)?error.code:'payment_operator_unavailable';
    process.stdout.write(JSON.stringify({schemaVersion:'ainuoke-payment-operator.v1',result:'FAIL',code,automaticRetry:false})+'\n');process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main();
