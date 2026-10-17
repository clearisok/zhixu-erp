import JSZip from "jszip";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import type { AttachmentStorage } from "../attachments/storage.js";
import { requirePermission } from "../auth/permissions.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import { HttpError } from "../http/errors.js";
import { createQuoteRepository } from "./repository.js";
import { createCustomerExportService } from "./customer-export.js";

export type BatchSelection = Array<{quoteId:string;expectedVersion:number}>;
export const MAX_CUSTOMER_BATCH = 25;
const MAX_BYTES=100*1024*1024;
export function parseCustomerBatch(body:Record<string,unknown>):BatchSelection{
  const bad=()=>new HttpError(400,"invalid_customer_batch","Select 1–25 unique saved Quotes");
  if(Object.keys(body).some(k=>k!=="items")||!Array.isArray(body.items)||!body.items.length||body.items.length>MAX_CUSTOMER_BATCH)throw bad();
  for(const item of body.items){if(!item||typeof item!=="object"||Object.keys(item).some(k=>!["quoteId","expectedVersion"].includes(k))
    ||typeof item.quoteId!=="string"||!item.quoteId||item.quoteId.length>200||!Number.isSafeInteger(item.expectedVersion)||item.expectedVersion<1)throw bad();}
  if(new Set(body.items.map(i=>i.quoteId)).size!==body.items.length)throw bad();return body.items;
}
export async function generateCustomerBatch(pool:Pool,storage:AttachmentStorage|undefined,actor:TrustedIdentity,items:BatchSelection){
  for(const permission of ["quote.view","quote.export","quote.cost.view","commercial.labor.view"] as const)requirePermission(actor.permissions,permission);
  const repository=createQuoteRepository(pool), exporter=createCustomerExportService(pool,storage);
  // Bind each item once at the start; these independent reads are explicitly NOT
  // a global simultaneous multi-Quote snapshot. CAS is rechecked at generation.
  const jobs=await Promise.all(items.map(async(item,index)=>({item,index,record:await repository.getById(item.quoteId)})));
  const zip=new JSZip(), names=new Set<string>();let size=0, success=0;
  const manifest:Array<{index:number;quoteId:string;sourceVersion:number;quoteCode?:string;quoteStyleNo?:string;styleName?:string;revisionId?:string;revisionLabel?:string;priceVersionIds?:string[];priceVersions?:Array<{id:string;name:string;manufacturingCountry:string|null}>;warnings?:string[];fileName?:string;sha256?:string;status:"success"|"failed";code?:string}>=[];
  for(const {item,index,record}of jobs){
    try{
      if(!record)throw new HttpError(404,"quote_not_found","Quote not found");
      if(record.version!==item.expectedVersion)throw new HttpError(409,"quote_version_conflict","Selected version changed");
      const revision=record.quote.revisions.find(r=>r.revisionId===record.quote.defaultRevisionId)!;
      const file=await exporter.generate(actor,item.quoteId,{expectedVersion:item.expectedVersion,revisionId:revision.revisionId,priceVersionIds:revision.priceVersions.map(p=>p.id)});
      if(size+file.bytes.length>MAX_BYTES)throw new HttpError(413,"customer_batch_size_limit","Batch size limit");
      let fileName=file.fileName, suffix=2;
      while(names.has(fileName.toLowerCase()))fileName=file.fileName.replace(/\.xlsx$/u,`_${suffix++}.xlsx`);
      names.add(fileName.toLowerCase());size+=file.bytes.length;zip.file(fileName,file.bytes);success++;
      manifest.push({index,quoteId:item.quoteId,sourceVersion:file.sourceVersion,quoteCode:record.quote.quoteCode,
        quoteStyleNo:revision.baseInfo.quoteStyleNo,styleName:revision.baseInfo.styleName,revisionLabel:revision.revisionLabel,
        revisionId:file.revisionId,priceVersionIds:file.priceVersionIds,
        priceVersions:revision.priceVersions.map(p=>({id:p.id,name:p.name,manufacturingCountry:p.pricingParameters.manufacturingCountry})),
        warnings:file.warnings,fileName,sha256:file.sha256,status:"success"});
    }catch(error){manifest.push({index,quoteId:item.quoteId,sourceVersion:item.expectedVersion,status:"failed",code:error instanceof HttpError?error.code:"customer_export_failed"});}
  }
  const failed=manifest.filter(i=>i.status==="failed").map(i=>({index:i.index,code:i.code}));
  const warnings=manifest.filter(i=>i.warnings?.length).map(i=>({index:i.index,count:i.warnings!.length}));
  const report={selected:items.length,success,failed,warnings};
  if(!success)return {report,bytes:null,fileName:null,sha256:null};
  zip.file("export-results.json",JSON.stringify({snapshot:"independent saved per-Quote versions; not a global snapshot",...report,items:manifest},null,2));
  const bytes=await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
  if(bytes.length>MAX_BYTES)throw new HttpError(413,"customer_batch_size_limit","Batch ZIP size limit");
  const sha256=createHash("sha256").update(bytes).digest("hex"), fileName="客户报价.zip";
  await appendOperationLog(pool,actor,{module:"报价中心",action:"批量导出",entityType:"Export",entityId:sha256,
    afterData:{values:{selected:items.length,success,failed:failed.length,byteSize:bytes.length,sha256}},
    metadata:{workflowAction:"customer.batch.generated",items:manifest}});
  return{report,bytes,fileName,sha256};
}
