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
 if(['catalog_non_identity_content_changed','catalog_business_content_changed','catalog_additions_observed'].includes(code??''))return '来源内容正在变化，将重新取得稳定资料';
 return code?'来源读取未完成，请核对':'';
}
export function sourcePauseMessage(value:{configuredEnabled?:boolean;pausedReason?:string|null;automaticResumeAt?:string|null;catalogRetryAt?:string|null}){
 if(value.configuredEnabled===false)return '管理员已停用来源同步；保留上次成功资料。';
 if(['invalid_credential','auth_expired','source_account_mismatch'].includes(value.pausedReason??''))return '来源认证需要核对，自动采集已保护暂停；保留上次成功资料。';
 if(value.pausedReason&&!['catalog_retries_exhausted','catalog_changed_or_over_limit','catalog_non_identity_content_changed','catalog_business_content_changed','catalog_additions_observed'].includes(value.pausedReason))return '来源一致性保护已暂停，请管理员在艾诺科同步记录中核对具体原因；保留上次成功资料。';
 const at=value.automaticResumeAt??value.catalogRetryAt;
 if(at&&Number.isFinite(Date.parse(at))){const time=new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});return `来源读取正在退避，后台计划于${time}重新核对（北京时间）；保留上次成功资料。`;}

 if(value.pausedReason)return '来源一致性保护已暂停，请管理员在艾诺科同步记录中核对具体原因；保留上次成功资料。';
 return '';
}
