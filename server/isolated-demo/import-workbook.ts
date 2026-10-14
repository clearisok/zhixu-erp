import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {TrustedIdentity} from "../auth/session.js";
import {createQuoteMasterService} from "../quote-masters/service.js";
import {createQuoteService} from "../quotes/service.js";
import {quoteSnapshotFromBrowser} from "../quotes/model.js";
import {createQuoteDraft,type PriceVersion} from "../../features/quote-center/model/quote-view-model.js";
import type {WorkbookRows} from "./fixtures.js";
const text=(v:unknown)=>v===null||v===undefined?'':String(v);
const number=(v:unknown)=>v===null||v===undefined||v===''?null:Number(v);
const decimal=(v:unknown)=>{const n=number(v);if(n===null)return null;if(!Number.isFinite(n)||n<0)throw Error('workbook_decimal_invalid');return String(n);};
const active=(v:unknown)=>/停用|禁用|inactive/.test(text(v))?'inactive' as const:'active' as const;
export async function importWorkbook(pool:Pool,actor:TrustedIdentity,w:WorkbookRows){
 const svc=createQuoteMasterService(pool),maps:Record<string,Map<string,{id:string;name:string}>>={};const gaps:string[]=[];
 for(const kind of ['品牌','客户业务员','面料库','辅料库','制作方案'])maps[kind]=new Map();
 const rows=(key:string)=>(w[key]??[]).filter(r=>r[0]);
 for(const r of rows('辅料库')){const dto=await svc.createTrim(actor,{name:text(r[1]),specification:text(r[2]),supplier:text(r[3]),unit:text(r[4]),defaultLossRate:decimal(r[5]),unitPrice:decimal(r[6])});maps['辅料库'].set(text(r[0]),dto);}
 for(const r of rows('面料库')){const dto=await svc.createFabric(actor,{name:text(r[1]),composition:text(r[2]),netWidthCm:decimal(r[3]),gsm:decimal(r[4]),defaultLossRate:decimal(r[5]),supplier:text(r[6]),unitPrice:decimal(r[7]),purchaseUnit:text(r[8])==='千克'?'kg':'meter'});maps['面料库'].set(text(r[0]),dto);}
 const defaults=(r:unknown[],fx:number,fee:number,amount:number,scope:string)=>({defaultUsdCnyRate:decimal(r[fx]),defaultOtherCost:text(r[fee])?{name:text(r[fee]),amount:decimal(r[amount])}:null,defaultTrims:rows('默认辅料').filter(d=>text(d[0]).includes(scope)&&text(d[1])===text(r[0])).map(d=>{const trim=maps['辅料库'].get(text(d[2]));if(!trim)throw Error('workbook_trim_reference_missing');return {trimLibraryItemId:trim.id,overrideLossRate:decimal(d[3]),overrideUnitPrice:decimal(d[4])};})});
 for(const r of rows('品牌')){const dto=await svc.createBrand(actor,{name:text(r[1]),status:active(r[2]),defaults:defaults(r,3,4,5,'品牌')});maps['品牌'].set(text(r[0]),dto);}
 for(const r of rows('客户业务员')){const brand=maps['品牌'].get(text(r[1]));if(!brand)throw Error('workbook_brand_reference_missing');const dto=await svc.createSalesperson(actor,{brandId:brand.id,name:text(r[2]),status:active(r[3]),defaults:defaults(r,4,5,6,'客户')});maps['客户业务员'].set(text(r[0]),dto);}
 const presets=new Map<string,Awaited<ReturnType<typeof svc.createPreset>>>();
 for(const r of rows('制作方案')){const dto=await svc.createPreset(actor,{name:text(r[1]),country:text(r[2]),laborCurrency:text(r[3])==='USD'?'USD':'CNY',markupRate:decimal(r[4]),includeFreight:/是|true|1/i.test(text(r[5])),freightName:text(r[6]),freightAmount:decimal(r[7]),status:active(r[8])});presets.set(text(r[0]),dto);}
 const settings=rows('报价系统设置')[0];if(settings){const preset=presets.get(text(settings[2]));const old=await svc.getGlobalSettings();await svc.updateGlobalSettings(actor,old?.version??0,{defaultQuoteType:text(settings[1]).includes('加工')?'processing':'distribution',defaultManufacturingCountry:preset?.country??null,defaultManufacturingPresetId:preset?.id??null,defaultUsdCnyRate:decimal(settings[3]),defaultMarkupRate:decimal(settings[4]),defaultLaborCurrency:text(settings[5])==='USD'?'USD':'CNY',defaultLaborDescription:'Excel演示配置',defaultOtherCost:text(settings[6])?{name:text(settings[6]),amount:decimal(settings[7])}:null});}
 let quotes=0,versions=0,lines=0;
 for(const r of rows('报价主表')){
  const q=createQuoteDraft(randomUUID(),'DEMO-'+text(r[0]),text(r[6])||'2026-10-13');const rev=q.revisions[0];const brand=maps['品牌'].get(text(r[1])),person=maps['客户业务员'].get(text(r[2]));
  Object.assign(rev.baseInfo,{brandId:brand?.id??'',brandName:brand?.name??'',salespersonId:person?.id??'',salespersonName:person?.name??'',quoteType:text(r[3]).includes('加工')?'processing':'distribution',quoteStyleNo:text(r[4]),styleName:text(r[5]),fabricLeadDate:text(r[7])||null,garmentLeadDate:text(r[8])||null,note:'Excel演示输入（不代表真实Source） · '+text(r[9])});
  const template=structuredClone(rev.priceVersions[0]);rev.priceVersions=[];
  for(const v of rows('报价版本').filter(v=>text(v[0])===text(r[0]))){const pv:PriceVersion=structuredClone(template);pv.id=randomUUID();pv.name=text(v[2]);pv.quantity=number(v[3]);const preset=presets.get(text(v[4]));Object.assign(pv.pricingParameters,{manufacturingCountry:preset?.country??'',manufacturingPresetId:preset?.id??null,manufacturingPresetName:preset?.name??'',laborCurrency:text(v[5])==='USD'?'USD':'CNY',usdCnyRate:number(v[6]),markupRate:number(v[7]),includeFreight:preset?.includeFreight??false,freightName:preset?.freightName??'',freightAmount:preset?.freightAmount===null?null:Number(preset?.freightAmount),configuration:{schemaVersion:1,status:'configured',sources:[{field:'manufacturingPresetId',source:'explicit'}]}});
   if(number(v[8])!==null||number(v[10])!==null)pv.confirmation={quotedGarmentPrice:number(v[8])??0,confirmedGarmentPrice:number(v[9]),quotedLaborPrice:number(v[10])??0,confirmedLaborPrice:number(v[11]),confirmedAt:text(v[12])||null,note:'Excel演示确认输入'};
   for(const d of rows('报价明细').filter(d=>text(d[0])===text(r[0])&&text(d[1])===text(v[1]))){const kind=text(d[3]);const id=randomUUID();
    if(kind==='辅料')pv.trims.push({id,lineGroupId:text(d[2]),sourceLibraryItemId:maps['辅料库'].get(text(d[4]))?.id??null,name:text(d[5]),specification:text(d[6]),unit:text(d[7]),usage:number(d[8]),lossRate:number(d[9]),unitPrice:number(d[10]),supplier:text(d[11])});
    else if(kind==='工价')pv.labor={value:number(d[10]),description:text(d[5])};
    else if(kind==='面料'){const library=await svc.getFabric(maps['面料库'].get(text(d[4]))?.id??'');pv.fabrics.push({id,lineGroupId:text(d[2]),sourceLibraryItemId:library?.id??null,name:text(d[5]),composition:text(d[6]),segmentLengthCm:null,netWidthCm:library?.netWidthCm===null?null:Number(library?.netWidthCm??0),gsm:library?.gsm===null?null:Number(library?.gsm??0),lossRate:number(d[9]),supplier:text(d[11]),unitPrice:number(d[10]),purchaseUnit:library?.purchaseUnit??'meter'});gaps.push('fabric_usage_semantics_unconfirmed');}
    else if(kind==='其他费用')pv.otherCosts.push({id,lineGroupId:text(d[2]),name:text(d[5]),specification:text(d[6]),unit:text(d[7]),usage:number(d[8]),lossRate:number(d[9]),unitPrice:number(d[10]),amount:number(d[12]),source:'manual'});
    else {gaps.push('unsupported_quote_line_type');rev.baseInfo.note+=' · 未映射行类别保留于私有输入';}lines++;
   }rev.priceVersions.push(pv);versions++;
  }if(!rev.priceVersions.length)rev.priceVersions.push(template);
  rev.confirmationSummary={confirmedCount:rev.priceVersions.filter(p=>p.confirmation?.confirmedAt).length,totalCount:rev.priceVersions.length};await createQuoteService(pool).createAggregate(quoteSnapshotFromBrowser(q));quotes++;
 }
 return {quotes,versions,inputLines:lines,masters:Object.fromEntries(Object.entries(maps).map(([k,v])=>[k,v.size])),presets:presets.size,gaps:gaps.reduce<Record<string,number>>((a,k)=>(a[k]=(a[k]??0)+1,a),{}),deferredSheets:['生产资源','排单计划','物流设置','用户角色计划','物料流水核对','订单颜色核对']};
}