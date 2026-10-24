import { PERMISSION_DEFINITIONS } from "../../permissions/model/permissions";
import type { ServerOperationLog } from "../../../server/operation-logs/repository";
const labels:Record<string,string>={name:"姓名／名称",account:"登录账号",roles:"角色",status:"状态",description:"说明",permissions:"权限",customerConfirmedPrice:"客户确认售价",customerConfirmedPriceCurrency:"售价币种",confirmedLaborPrice:"确认工价",laborCurrency:"工价币种",quantity:"数量",deliveryDate:"交期",styleNo:"款号",styleName:"款式名称",active:"启用状态",version:"版本"};
const statuses:Record<string,string>={active:"启用",inactive:"停用",archived:"已删除",draft:"草稿",confirmed:"已确认",cancelled:"已取消"};
const workflow:Record<string,string>={"confirmation.save":"确认报价","revision.create":"创建报价版本","price.create":"创建价格版本","price.update":"修改价格版本","price.delete":"删除价格版本","estimate.generate":"生成估算成本","estimate.regenerate":"生成估算成本","estimate.restore":"恢复历史估算成本","estimate.update":"保存当前估算","estimate.ignore":"保留当前估算"};
export const logAction=(log:ServerOperationLog)=>workflow[String(log.metadata.workflowAction)]??({"创建账号":"创建用户","修改账号":"修改用户"}[log.action]??log.action);
export function logTarget(log:ServerOperationLog):string{
 for(const d of [log.afterData,log.beforeData]){if(!d)continue;
  for(const v of [d.objectName,d.orderNo,d.orderStyleNo,d.quoteStyleNo,d.quoteCode,d.rowName,d.styleName,d.presetName,d.values?.name,d.values?.account,d.values?.["名称"],d.values?.["款号"]])if(typeof v==="string"&&v.trim())return v;
 }
 const fixed:Record<string,string>={QuoteSettings:"报价设置",MaterialProgressSettings:"进度设置",ClosingSettings:"关账设置"};
 return fixed[log.entityType]??"当时未记录";
}
export function logTime(value:string,full=false):string{
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return "当时未记录";
 return new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",...(full?{year:"numeric" as const,second:"2-digit" as const}:{}),month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(date);
}
export function logField(field:string):string{return labels[field]??(/[\u3400-\u9fff]/u.test(field)?field:"其他记录项目");}
export function logValue(field:string,value:unknown):string{
 if(value===null||value===undefined)return "—";
 if(typeof value==="boolean")return field==="active"?(value?"启用":"停用"):(value?"是":"否");
 if(typeof value==="string"){
  if(field==="status")return statuses[value]??value;
  if(field==="permissions"||field==="权限")return value.split(/[,、]/u).map(k=>PERMISSION_DEFINITIONS.find(p=>p.key===k.trim())?.label??k).join("、");
  if(field==="roles")return value.startsWith("role-")?"历史角色（当时未记录名称）":value;
 }
 return String(value);
}
export function logChanges(log:ServerOperationLog){
 if(log.action==="重置密码")return [];
 return log.changes.filter(c=>c.beforeValue!==c.afterValue&&!/(?:^|[._])(id|hash|token|password|secret)(?:$|[._])/iu.test(c.field)&&!/(?:Id|Ids)$/u.test(c.field)).map(c=>({field:logField(c.field),before:logValue(c.field,c.beforeValue),after:logValue(c.field,c.afterValue)}));
}
