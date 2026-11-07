/** Business labels only: raw diagnostics, report IDs and credentials stay out of UI. */
export function sourceSyncMessage(value:{status?:string|null;retryAt?:string|null;attemptNumber?:number|null}) {
 if(value.status==='queued'&&value.retryAt){
  const time=new Date(value.retryAt);
  const at=Number.isFinite(time.getTime())?time.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'稍后';
  return `等待重试（第${value.attemptNumber??2}/3次尝试），预计${at}，北京时间`;
 }
 return ({queued:'已提交，等待同步',running:'正在同步',complete:'同步成功',failed:'最近同步未成功，保留上次资料',unknown:'结果待核对，请勿重复提交',not_found:'尚未查到回执，请继续核对'} as Record<string,string>)[value.status??'']??'';
}
export function sourceFailureMessage(outcome:string|undefined,code:string|undefined) {
 if(outcome==='timeout'||code==='source_timeout'||code==='selected_source_timeout')return '来源响应超时';
 if(outcome==='auth_error'||code==='invalid_credential'||code==='auth_expired')return '来源登录未成功，请管理员核对';
 if(['dns_error','connection_refused','connection_reset','network_error','http_error'].includes(outcome??''))return '暂时无法读取来源';
 return code?'来源读取未完成，请核对':'';
}
