/** Bounded read-only evidence analysis. No Pool, scheduler, migrations or business writes. */
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, lstatSync, openSync, closeSync, fstatSync, constants } from "node:fs";
import { createHash } from "node:crypto";
import { readinessFingerprint } from "./readiness.js";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { adaptAinuokeOrderDiscoverySnapshots } from "../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js";
import { adaptAinuokeGarmentColorSizeSnapshots } from "../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js";
import { buildAinuokeMaterialApiPreview } from "../../features/style-progress/service/ainuoke-material-api-preview.js";
import { projectMaterialProgress } from "../../features/ainuoke-material-progress/projection.js";
import type { AinuokeOrderDiscoveryQuery, AinuokeSalesContractQuery, AinuokeReportSnapshot } from "../../features/ainuoke-api/model/ainuoke-api.js";
import { parseCollectorConfig, type CollectorConfig } from "./collector.js";
import { assertPrivateOutput, writePrivateReport } from "./live-preflight.js";
import { SourceError, inspect, pagesValid, discoveryContentHash } from "./contract.js";

export type QualityTarget = { label: string; salesContractNo: string; insideOrderNo: string; colors: boolean; materials: boolean; reason: string };
export type QualityRequest = { schemaVersion: "ainuoke-quality-request.v1"; preflightSha256: string; targets: QualityTarget[] };
type QualityBundle = { schemaVersion: "ainuoke-quality-diagnostic.v1"; discoveryBefore: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
  discoveryAfter: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[]; colors: Record<string,AinuokeReportSnapshot<AinuokeSalesContractQuery>[]>;
  materials: Record<string,AinuokeReportSnapshot[]>; reportRequests: number; authRenewals: number };
const identity = (x: unknown) => String(x ?? "").normalize("NFKC").trim().toUpperCase().replace(/\s+/gu, "");
export function validateQualityRequest(value: unknown): QualityRequest {
  inspect(value);
  const r = value as QualityRequest;
  if (!r || Object.keys(r).sort().join(",") !== "preflightSha256,schemaVersion,targets" || r.schemaVersion !== "ainuoke-quality-request.v1"
    || !/^[a-f0-9]{64}$/u.test(r.preflightSha256) || !Array.isArray(r.targets) || r.targets.length < 1 || r.targets.length > 25)
    throw new SourceError("quality_scope_invalid");
  for (const t of r.targets) if (!t || Object.keys(t).sort().join(",") !== "colors,insideOrderNo,label,materials,reason,salesContractNo"
    || !/^R[0-9]{4}$/u.test(t.label) || typeof t.salesContractNo !== "string" || !identity(t.salesContractNo) || t.salesContractNo.length > 80
    || typeof t.insideOrderNo !== "string" || !identity(t.insideOrderNo) || t.insideOrderNo.length > 80
    || typeof t.colors !== "boolean" || typeof t.materials !== "boolean" || !(t.colors || t.materials)
    || !/^(color-invalid|unit-conflict|empty-material|quantity-sample|cross-unit-missing|cross-purchase-unknown)$/u.test(t.reason))
    throw new SourceError("quality_scope_invalid");
  if (new Set(r.targets.map(t=>identity(t.salesContractNo))).size !== r.targets.length || new Set(r.targets.map(t=>t.label)).size !== r.targets.length
    || r.targets.filter(t=>t.colors).length > 6 || r.targets.filter(t=>t.materials).length > 18) throw new SourceError("quality_scope_invalid");
  return r;
}
type PreflightEvidence = {schemaVersion:string;result:string;collectionValidation:string;sourceFingerprint:string;
 databaseAccess:string;sourceActivation:string;visibilityScope:string;stages:Array<{stage:string;status:string}>;
 discovery:{complete:boolean;stableAcrossStages:boolean;contracts:number};materials:{allVisibleContracts:boolean;contracts:number};
 orders:Array<{label:string;salesContractNo:string;insideOrderNo:string}>};
/** Hash the actual protected bytes, then validate successful coverage and exact historical identities. */
export function verifyQualityPreflight(bytes:Buffer,request:QualityRequest,sourceFingerprint:string) {
 validateQualityRequest(request);
 if(bytes.length>64*1024*1024||createHash("sha256").update(bytes).digest("hex")!==request.preflightSha256)throw new SourceError("quality_preflight_hash_mismatch");
 let p:PreflightEvidence;try{p=JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(bytes));}catch{throw new SourceError("quality_preflight_invalid");}
 if(!p||p.schemaVersion!=="ainuoke-live-preflight.v1"||p.result!=="READ_ONLY_FULL_PREFLIGHT_RECORDED"||p.collectionValidation!=="complete"
  ||p.databaseAccess!=="none"||p.sourceActivation!=="not-activated"||p.visibilityScope!=="current_account_visible"
  ||p.sourceFingerprint!==sourceFingerprint||p.discovery?.complete!==true||p.discovery.stableAcrossStages!==true||!Number.isSafeInteger(p.discovery.contracts)||p.discovery.contracts<1
  ||p.materials?.allVisibleContracts!==true||p.materials.contracts!==p.discovery.contracts||!Array.isArray(p.orders)||p.orders.length!==p.discovery.contracts
  ||!Array.isArray(p.stages)||p.stages.length!==2||p.stages[0]?.stage!=="bindings"||p.stages[1]?.stage!=="materials"||p.stages.some(s=>s.status!=="validated"))throw new SourceError("quality_preflight_invalid");
 const labels=new Set<string>(),contracts=new Set<string>();
 for(const o of p.orders){
  if(!o||!/^R[0-9]{4}$/.test(o.label)||typeof o.salesContractNo!=="string"||!identity(o.salesContractNo)||typeof o.insideOrderNo!=="string"||!identity(o.insideOrderNo)||labels.has(o.label)||contracts.has(identity(o.salesContractNo)))throw new SourceError("quality_preflight_invalid");
  labels.add(o.label);contracts.add(identity(o.salesContractNo));
 }
 for(const t of request.targets){const o=p.orders.find(o=>o.label===t.label);
  if(!o||identity(o.salesContractNo)!==identity(t.salesContractNo)||identity(o.insideOrderNo)!==identity(t.insideOrderNo))throw new SourceError("quality_preflight_scope_mismatch");
 }
 return {preflightSha256:request.preflightSha256,preflightLineageVerified:true as const};
}
function readProtectedPreflight(path:string) {
 assertPrivateOutput(dirname(path));
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024)throw new SourceError("quality_preflight_invalid");
 if(process.platform==="win32")execFileSync("pwsh",["-NoProfile","-NonInteractive","-File","scripts/ainuoke-live-preflight.ps1","-ValidateOnly","-PrivateDirectory",dirname(path),"-PrivateFile",path],{stdio:"ignore",windowsHide:true,timeout:15000});
 else if((stat.mode&0o077)!==0||stat.uid!==process.getuid?.())throw new SourceError("quality_preflight_invalid");
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const current=fstatSync(fd);if(!current.isFile()||current.dev!==stat.dev||current.ino!==stat.ino||current.size>64*1024*1024)throw new SourceError("quality_preflight_invalid");return readFileSync(fd);}finally{closeSync(fd);}
}
export async function collectVerifiedQuality(config:CollectorConfig,request:QualityRequest,bytes:Buffer,collect=collectQuality){
 verifyQualityPreflight(bytes,request,readinessFingerprint(config));
 return collect(config,request);
}
export function classifyQuantity(value: unknown, document: unknown) {
  if (value === null || value === undefined || typeof value === "string" && !value.trim())
    return String(document ?? "").trim() ? "blank-with-document" : "blank-no-event-unverified";
  if (typeof value !== "number" && typeof value !== "string") return "invalid";
  const number = Number(typeof value === "string" ? value.replaceAll(",", "") : value);
  if (!Number.isFinite(number)) return "invalid";
  if (number < 0) return "negative";
  if (number === 0) return "literal-zero";
  return String(document ?? "").trim() ? "positive-with-document" : "positive-without-document";
}
export function purchaseUnitCrossStats(rows: Array<{unitStatus:string; issues:string[]}>) {
  const result = {knownUnitKnownPurchase:0,missingUnitKnownPurchase:0,knownUnitUnknownPurchase:0,missingUnitUnknownPurchase:0,conflictUnitUnknownPurchase:0};
  for (const row of rows) {
    const unknown = row.unitStatus === "conflict" || row.issues.includes("采购来源数量缺失或无效，不能按零采购判定");
    if (row.unitStatus === "conflict") result.conflictUnitUnknownPurchase++;
    else if (row.unitStatus === "known") result[unknown ? "knownUnitUnknownPurchase" : "knownUnitKnownPurchase"]++;
    else if (row.unitStatus === "missing") result[unknown ? "missingUnitUnknownPurchase" : "missingUnitKnownPurchase"]++;
    else throw new SourceError("quality_unit_status_invalid");
  }
  return result;
}
const streams = [["purchaseQuantity","purchaseOrderNo"],["inboundQuantity","inboundDocumentNo"],["shipmentQuantity","shipmentDocumentNo"],["outboundQuantity","outboundDocumentNo"]] as const;
export async function analyzeQuality(input: unknown, request: QualityRequest, now=Date.now()) {
  validateQualityRequest(request); inspect(input);
  const b = input as QualityBundle;
  if (!b || Buffer.byteLength(JSON.stringify(b)) > 32*1024*1024 || b.schemaVersion !== "ainuoke-quality-diagnostic.v1"
    || Object.keys(b).sort().join(",") !== "authRenewals,colors,discoveryAfter,discoveryBefore,materials,reportRequests,schemaVersion"
    || !Number.isSafeInteger(b.reportRequests) || b.reportRequests < 2 || b.reportRequests > 160 || ![0,1].includes(b.authRenewals)) throw new SourceError("quality_bundle_invalid");
  pagesValid(b.discoveryBefore,now,600000); pagesValid(b.discoveryAfter,now,600000);
  const before=await adaptAinuokeOrderDiscoverySnapshots(b.discoveryBefore), after=await adaptAinuokeOrderDiscoverySnapshots(b.discoveryAfter);
  if (before.snapshotHash!==after.snapshotHash || discoveryContentHash(b.discoveryBefore)!==discoveryContentHash(b.discoveryAfter)) throw new SourceError("discovery_changed");
  for (const [field,flag] of [["colors","colors"],["materials","materials"]] as const) {
    if (!b[field] || Array.isArray(b[field]) || Object.keys(b[field]).sort().join(",") !== request.targets.filter(t=>t[flag]).map(t=>identity(t.salesContractNo)).sort().join(",")) throw new SourceError("quality_scope_mismatch");
  }
  const privateOrders=[];
  for (const target of request.targets) {
    const contract=identity(target.salesContractNo), discovered=after.rows.find(r=>r.salesContractNo===contract);
    if (!discovered) throw new SourceError("quality_target_not_visible");
    const current = {salesContractNo:contract,styleNo:discovered.styleNo,insideOrderNo:discovered.insideOrderNo};
    const colorPages=b.colors[contract], materialPages=b.materials[contract];
    let color: Awaited<ReturnType<typeof adaptAinuokeGarmentColorSizeSnapshots>>|null=null;
    let colorParserError=false;
    if (colorPages) { pagesValid(colorPages,now,600000); try { color=await adaptAinuokeGarmentColorSizeSnapshots({snapshots:colorPages, requestedSalesContractNo:contract, discoveryInsideOrderNo:discovered.insideOrderNo,expectedStyleNo:discovered.styleNo}); } catch { colorParserError=true; } }
    let material: ReturnType<typeof projectMaterialProgress>|null=null;
    let pipeline: ReturnType<typeof buildAinuokeMaterialApiPreview>["pipeline"]|null=null;
    if (materialPages) {
      pagesValid(materialPages,now,600000);
      if (materialPages.some(p=>identity(p.queryContext.insideOrderNo)!==identity(discovered.insideOrderNo))) throw new SourceError("quality_scope_mismatch");
      material=projectMaterialProgress(current,materialPages);
      if (material.sourceStatus==="ready") pipeline=buildAinuokeMaterialApiPreview({snapshots:materialPages}).pipeline;
    }
    const conflictDemands=material?.rows.filter(r=>r.unitStatus==="conflict").map(r=>({demand:r.demand,
      sourceRows:pipeline?.rawRows.filter(raw=>raw.normalizedDemandId===r.demand.id).map(raw=>({sourceRowIdentity:raw.trace.sourceKind==="api"?raw.trace.sourceRowIdentity:null,
        QtyUnit:raw.values.quantityUnit, normalizedIdentity:raw.normalizedDemandId, values:raw.values})), quantitiesBlocked:r.purchased===null&&r.inbound===null&&r.shipped===null&&r.outbound===null})) ?? [];
    const observations=Object.fromEntries(streams.map(([quantity,document])=>[quantity,Object.fromEntries([...new Set(pipeline?.rawRows.map(r=>classifyQuantity(r.values[quantity],r.values[document])) ?? [])].map(code=>[code,pipeline!.rawRows.filter(r=>classifyQuantity(r.values[quantity],r.values[document])===code).length]))]));
    // Tokens here are size labels, never credentials. Use an explicit evidence
    // name rather than weakening the shared secret-key inspector.
    const colorRowEvidence = (row: NonNullable<typeof color>["rows"][number]) => {
      const {sizeRuleTokens, ...facts} = row; return {...facts, sizeRuleLabels:sizeRuleTokens};
    };
    const colorEvidence = color ? {...color, rows:color.rows.map(colorRowEvidence), usableRows:color.usableRows.map(colorRowEvidence)} : null;
    privateOrders.push({label:target.label,reason:target.reason,requested:target,current,insideIdentityChanged:identity(target.insideOrderNo)!==identity(discovered.insideOrderNo),color:colorEvidence,colorParserError,
      colorRawPages:colorPages ?? null,materialRawPages:materialPages ?? null,material,conflictDemands,observations});
  }
  const summary={schemaVersion:"ainuoke-quality-diagnostic.v1",result:"READ_ONLY_QUALITY_DIAGNOSTIC_RECORDED",databaseAccess:"none",sourceActivation:"not-activated",preflightSha256:request.preflightSha256,
    scope:"bounded-problem-contracts-not-full-recollection",reportRequests:b.reportRequests,contracts:privateOrders.length,
    problems:privateOrders.map(o=>({label:o.label,reason:o.reason,insideIdentityChanged:o.insideIdentityChanged,
      colors:o.color?{status:o.color.colorDetailStatus,upstreamRows:o.color.upstreamRows,exactRows:o.color.exactRows,falsePositiveRows:o.color.containsFalsePositiveRows,issueCodes:[...new Set(o.color.issues.map(i=>i.code))]}:null,colorParserError:o.colorParserError,
      materials:o.material?{status:o.material.sourceStatus,demands:o.material.rows.length,conflicts:o.conflictDemands.length,empty:o.materialRawPages?.every(p=>p.total===0),duplicateEvents:o.material.duplicateEvents,observations:o.observations}:null}))};
  return {summary,privateReport:{...summary,orders:privateOrders,discoveryBefore:b.discoveryBefore,discoveryAfter:b.discoveryAfter}};
}
function collectQuality(config: CollectorConfig, request: QualityRequest):Promise<unknown> {
  return new Promise((done,reject)=>{
    const child=spawn(process.platform==="win32"?"python":"python3",["-m","ainuoke_bridge.server_source"],{cwd:resolve("tools/ainuoke-bridge"),windowsHide:true,stdio:["pipe","pipe","pipe"],env:{...process.env,PYTHONUTF8:"1",PYTHONDONTWRITEBYTECODE:"1"}});
    let bytes=0,finished=false;const chunks:Buffer[]=[];
    const fail=(code:string)=>{if(finished)return;finished=true;clearTimeout(timer);child.kill();reject(new SourceError(code));};
    const timer=setTimeout(()=>fail("source_timeout"),600000);
    child.stdout.on("data",(c:Buffer)=>{bytes+=c.length;if(bytes>32*1024*1024)fail("source_limit");else chunks.push(c);});child.stderr.resume();
    child.on("error",()=>fail("source_collector_unavailable"));child.stdin.on("error",()=>fail("source_collector_unavailable"));
    child.on("close",code=>{if(finished)return;clearTimeout(timer);try {const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(code!==0){fail(["invalid_credential","auth_expired","source_unavailable"].includes(value.error)?value.error:"source_invalid");return;}finished=true;done(value);}catch{fail("source_invalid");}});
    child.stdin.end(JSON.stringify({baseUrl:config.baseUrl,username:config.username,password:config.password,transportPolicy:config.transportPolicy,contracts:[],mode:"quality",qualityTargets:request.targets.map(t=>({salesContractNo:t.salesContractNo,colors:t.colors,materials:t.materials}))}));
  });
}
export async function main(args=process.argv.slice(2)) {
  try {
    if(args.length!==5 || !args.includes("--run-read-only") || !args.includes("--stdin-config")) throw new SourceError("quality_explicit_action_required");
    const output=args.find(a=>a.startsWith("--private-output="))?.slice(17), path=args.find(a=>a.startsWith("--private-request="))?.slice(18);
    const preflightPath=args.find(a=>a.startsWith("--private-preflight="))?.slice("--private-preflight=".length);
    if(!output||!path||!preflightPath)throw new SourceError("quality_explicit_action_required");
    assertPrivateOutput(output);assertPrivateOutput(dirname(path));
    execFileSync("pwsh",["-NoProfile","-NonInteractive","-File","scripts/ainuoke-live-preflight.ps1","-ValidateOnly","-PrivateDirectory",dirname(path),"-PrivateFile",path],{stdio:"ignore",windowsHide:true});
    const requestBytes=readFileSync(path);if(requestBytes.length>16384)throw new SourceError("quality_scope_invalid");
    const request=validateQualityRequest(JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(requestBytes)));
    const preflightBytes=readProtectedPreflight(preflightPath);
    const toolingCommit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",windowsHide:true}).trim();
    if(execFileSync("git",["status","--porcelain","--untracked-files=normal"],{encoding:"utf8",windowsHide:true}).trim())throw new SourceError("quality_clean_worktree_required");
    const parts:Buffer[]=[];let bytes=0;for await(const part of process.stdin){bytes+=part.length;if(bytes>16384)throw new SourceError("invalid_collector_configuration");parts.push(Buffer.from(part));}
    const config=parseCollectorConfig(JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(Buffer.concat(parts))));
    const raw=await collectVerifiedQuality(config,request,preflightBytes);
    // Persist the bounded source once, before derived analysis, so a report-only
    // repair can be replayed offline instead of repeating live collection.
    const rawReceipt=writePrivateReport(output,{schemaVersion:"ainuoke-quality-raw-evidence.v1",preflightSha256:request.preflightSha256,preflightLineageVerified:true,toolingCommit,rawBundle:raw});
    const report=await analyzeQuality(raw,request);
    const receipt=writePrivateReport(output,{...report.privateReport,preflightLineageVerified:true,toolingCommit});process.stdout.write(JSON.stringify({...report.summary,preflightLineageVerified:true,toolingCommit,rawEvidence:rawReceipt,...receipt})+"\n");
  } catch(error) {
    const code=error instanceof SourceError?error.code:"quality_invalid_or_unavailable";
    process.stdout.write(JSON.stringify({schemaVersion:"ainuoke-quality-diagnostic.v1",result:"FAIL",code,databaseAccess:"none",sourceActivation:"not-activated"})+"\n");process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main();
