import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { Pool, PoolClient } from "pg";
import { isDeepStrictEqual } from "node:util";
import { buildQuoteExcel, type QuoteExcelImage } from "../../features/quote-center/export/quote-excel-core.js";
import { projectForBrowser, browserNumberFromExactDecimal } from "../../features/quote-center/model/exact-decimal-view.js";
import { mapPriceVersionForExport } from "../../features/quote-center/export/quote-export-mappers.js";
import { findSalesOrderIdsByQuoteProvenance, findTermsByQuoteProvenance, lockQuoteTermsContext } from "../confirmed-commercial-terms/repository.js";
import type { QuoteRevision } from "../../features/quote-center/model/quote-view-model.js";
import { requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import type { AttachmentStorage } from "../attachments/storage.js";
import { createAttachmentService } from "../attachments/service.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import { HttpError } from "../http/errors.js";
import { createQuoteRepository } from "./repository.js";
import {resolveConfirmationSource} from '../confirmed-commercial-terms/confirmation-source.js';

export type CustomerExportSelection = { expectedVersion: number; revisionId: string; priceVersionIds: string[] };
export const CUSTOMER_EXPORT_MAX_BYTES = 20 * 1024 * 1024;
const invalid = () => new HttpError(400, "invalid_customer_export", "Invalid customer export selection");
export function parseCustomerExport(body: Record<string, unknown>): CustomerExportSelection {
  if (Object.keys(body).some(k => !["expectedVersion", "revisionId", "priceVersionIds"].includes(k))
    || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1
    || typeof body.revisionId !== "string" || !body.revisionId || body.revisionId.length > 200
    || !Array.isArray(body.priceVersionIds) || !body.priceVersionIds.length || body.priceVersionIds.length > 20
    || body.priceVersionIds.some(id => typeof id !== "string" || !id || id.length > 200)
    || new Set(body.priceVersionIds).size !== body.priceVersionIds.length) throw invalid();
  return body as CustomerExportSelection;
}
function image(bytes: Buffer): QuoteExcelImage {
  let width = 0, height = 0;
  let extension: "png" | "jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    extension = "png";
    if (bytes.length < 45 || bytes.toString("ascii",12,16) !== "IHDR") throw new Error("Invalid PNG");
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
    const data: Buffer[] = []; let end = false;
    for (let at=8;at+12<=bytes.length;) {
      const length=bytes.readUInt32BE(at), kind=bytes.toString("ascii",at+4,at+8);
      if(length>bytes.length-at-12)throw new Error("Truncated PNG");
      let crc=0xffffffff;
      for(const byte of bytes.subarray(at+4,at+8+length)){
        crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
      }
      if(((crc^0xffffffff)>>>0)!==bytes.readUInt32BE(at+8+length))throw new Error("Corrupt PNG checksum");
      if(kind==="IDAT")data.push(bytes.subarray(at+8,at+8+length));
      if(kind==="IEND"){end=true;break;} at+=length+12;
    }
    if(!end || !data.length)throw new Error("Invalid PNG");
    inflateSync(Buffer.concat(data), { maxOutputLength: CUSTOMER_EXPORT_MAX_BYTES });
  } else if(bytes[0]===255 && bytes[1]===216 && bytes.at(-2)===255 && bytes.at(-1)===217) {
    extension="jpeg";
    for(let at=2;at+8<bytes.length;){
      if(bytes[at++]!==255)throw new Error("Invalid JPEG");
      while(bytes[at]===255)at++;
      const marker=bytes[at++];if(marker===0xda)break;
      if(marker===0xd8 || marker===0x01 || marker>=0xd0&&marker<=0xd7)continue;
      const length=bytes.readUInt16BE(at);if(length<2||at+length>bytes.length)throw new Error("Invalid JPEG");
      if([0xc0,0xc1,0xc2].includes(marker)){height=bytes.readUInt16BE(at+3);width=bytes.readUInt16BE(at+5);break;}at+=length;
    }
  } else throw new Error("Unsupported style image");
  if(!width||!height||width*height>25_000_000)throw new Error("Invalid image dimensions");
  return {base64:bytes.toString("base64"),extension,width,height};
}
export function createCustomerExportService(pool: Pool, storage?: AttachmentStorage) {
  const repository = createQuoteRepository(pool);
  return {
    async generate(actor: TrustedIdentity, quoteId: string, selection: CustomerExportSelection) {
      for(const permission of ["quote.view","quote.export","quote.cost.view","commercial.sale.view","commercial.labor.view"] as const)requirePermission(actor.permissions,permission);
      const record=await repository.getById(quoteId);
      if(!record)throw new HttpError(404,"quote_not_found","Quote not found");
      if(record.version!==selection.expectedVersion)throw new HttpError(409,"quote_version_conflict","Saved source changed");
      const source=record.quote.revisions.find(r=>r.revisionId===selection.revisionId);
      if(!source)throw new HttpError(404,"quote_revision_not_found","Selected Revision not found");
      if(source.readOnly)requirePermission(actor.permissions,"quote.revision.view");
      const selected=selection.priceVersionIds.map(id=>source.priceVersions.find(p=>p.id===id));
      if(selected.some(p=>!p))throw new HttpError(404,"quote_price_version_not_found","Selected PriceVersion not found");
      const readBinding=async(client:Pool|PoolClient,pvId:string)=>{
        const partial=await client.query("SELECT 1 FROM sales_orders WHERE source_quote_id=$1 AND (source_revision_id IS NULL OR source_price_version_id IS NULL) LIMIT 1",[quoteId]);
        if(partial.rowCount)throw new HttpError(409,"incomplete_quote_provenance","Current confirmation source cannot be resolved exactly");
        const provenance={quoteId,revisionId:source.revisionId,priceVersionId:pvId};
        const ids=await findSalesOrderIdsByQuoteProvenance(client,provenance);
        const terms=await findTermsByQuoteProvenance(client,provenance);
        return{ids,terms};
      };
      const bindings=new Map<string,Awaited<ReturnType<typeof readBinding>>>();
      if(!source.readOnly)for(const id of selection.priceVersionIds)bindings.set(id,await readBinding(pool,id));
      // Explicit customer-only root projection. Neither Estimate slice is ever
      // passed to the workbook builder, image loader or generation evidence.
      const revision=projectForBrowser({revisionId:source.revisionId,revisionLabel:source.revisionLabel,baseInfo:source.baseInfo,
        priceVersions:selected,createdAt:source.createdAt}) as QuoteRevision;
      const warnings:string[]=[];let styleImage:QuoteExcelImage|null=null;
      if(source.styleImageAttachmentId){
        if(!source.imageAttachmentIds.includes(source.styleImageAttachmentId))throw new HttpError(409,"invalid_style_image_relation","Invalid style image relation");
        try{
          if(!storage)throw new HttpError(503,"attachment_storage_unavailable","Storage unavailable");
          const loaded=await createAttachmentService(pool,storage).download(actor,quoteId,source.revisionId,source.styleImageAttachmentId);
          const chunks:Buffer[]=[];let size=0;
          for await(const chunk of loaded.stream){const part=Buffer.from(chunk);size+=part.length;if(size>CUSTOMER_EXPORT_MAX_BYTES)throw new Error("Image too large");chunks.push(part);}
          const bytes=Buffer.concat(chunks);
          if(bytes.length!==loaded.attachment.size || createHash("sha256").update(bytes).digest("hex")!==loaded.attachment.sha256)throw new Error("Image integrity mismatch");
          styleImage=image(bytes);
        }catch(error){
          if(error instanceof HttpError && [401,403].includes(error.status))throw error;
          warnings.push("款式图缺失、损坏或格式暂不支持；文件不含该图。");
        }
      }
      const template=await readFile(resolve("templates/quote-export-template-v1.xlsx"));
      const result=await buildQuoteExcel({template:Uint8Array.from(template).buffer,quote:{quoteCode:record.quote.quoteCode},revision,priceVersions:revision.priceVersions,styleImage,
        mapPriceVersion:(pv,rev)=>{
          const mapped=mapPriceVersionForExport(pv,rev),binding=bindings.get(pv.id);
          if(binding&&source.baseInfo.quoteType==="distribution"){
            const t=binding.terms,confirmation=pv.confirmation;
            const resolved=resolveConfirmationSource({terms:t?{id:t.id,version:t.version,labor:t.confirmed_labor_price,sale:t.customer_confirmed_price,currency:t.labor_currency,confirmedAt:t.updated_at.toISOString()}:null,
              snapshot:confirmation?{labor:confirmation.confirmedLaborPrice===null?null:String(confirmation.confirmedLaborPrice),sale:confirmation.confirmedGarmentPrice===null?null:String(confirmation.confirmedGarmentPrice),currency:pv.pricingParameters.laborCurrency,confirmedAt:confirmation.confirmedAt}:null});
            mapped.summary.customerConfirmedPrice=resolved.sale===null?null:browserNumberFromExactDecimal(resolved.sale,"resolved customer price");
          }
          return mapped;
        }});
      const bytes=Buffer.from(result.buffer);
      if(!bytes.length||bytes.length>CUSTOMER_EXPORT_MAX_BYTES)throw new HttpError(413,"customer_export_size_limit","Export exceeds technical size limit");
      const sha256=createHash("sha256").update(bytes).digest("hex");
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        for(const [id,binding]of [...bindings].sort(([a],[b])=>a.localeCompare(b))){
          await lockQuoteTermsContext(client,{quoteId,revisionId:source.revisionId,priceVersionId:id});
          if(!isDeepStrictEqual(binding,await readBinding(client,id)))throw new HttpError(409,"commercial_terms_version_conflict","Current confirmation source changed during generation");
        }
        const locked=await client.query("SELECT version FROM quote_center_quotes WHERE id=$1 FOR UPDATE",[quoteId]);
        if(locked.rows[0]?.version!==record.version)throw new HttpError(409,"quote_version_conflict","Source changed while generating file");
        await appendOperationLog(client,actor,{module:"报价中心",action:"导出报价单",entityType:"Export",entityId:quoteId,quoteId,
          context:{revisionId:source.revisionId,priceVersionIds:selection.priceVersionIds},
          afterData:{quoteCode:record.quote.quoteCode,revisionLabel:source.revisionLabel,values:{sourceVersion:record.version,fileName:result.fileName,byteSize:bytes.length,sha256}},
          metadata:{workflowAction:"customer.export.generated",sourceVersion:record.version,revisionId:source.revisionId,priceVersionIds:selection.priceVersionIds}});
        await client.query("COMMIT");
      }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
      return {bytes,fileName:result.fileName,sha256,warnings:[...warnings,...result.warnings],revisionId:source.revisionId,priceVersionIds:selection.priceVersionIds,sourceVersion:record.version};
    },
  };
}
