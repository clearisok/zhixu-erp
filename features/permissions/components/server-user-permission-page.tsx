"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {AppShell,Button,Card,DataTable,ErrorState,LoadingState,Modal,PageContainer,PageHeader,SearchField,type DataColumn} from "@/components/foundation";
import {useServerSession} from "@/features/server-auth";
import {ServerAuthError} from "@/features/server-auth/server-auth-client";
import {createTeamAccessClient,type TeamCommand,type TeamDirectory,type TeamUser} from "../server/team-access-client";
import {PasswordField} from "./password-field";
import {passwordValidationMessage} from "../model/password-policy";
import "../admin-settings.css";
const client=createTeamAccessClient();
const statusLabel={active:"启用",inactive:"停用",archived:"已删除"};
type Dialog={kind:"create";requestId:string}|{kind:"edit"|"reset"|"archive"|"restore"|"revoke-sessions";user:TeamUser;requestId:string};
export function ServerUserPermissionPage(){const s=useServerSession();return <UserManagement key={s.user?.id+":"+s.permissions.join("|")}/>;}
function UserManagement(){
 const session=useServerSession(),router=useRouter(),alive=useRef(true),serial=useRef(0),lock=useRef(false);
 const [directory,setDirectory]=useState<TeamDirectory|null>(null),[query,setQuery]=useState({q:"",roleId:"",status:"",offset:0}),[search,setSearch]=useState("");
 const [error,setError]=useState(""),[feedback,setFeedback]=useState(""),[busy,setBusy]=useState(false),[refreshId,setRefreshId]=useState(0);
 const [dialog,setDialog]=useState<Dialog|null>(null),[name,setName]=useState(""),[account,setAccount]=useState(""),[roleId,setRoleId]=useState(""),[status,setStatus]=useState<"active"|"inactive">("active"),[password,setPassword]=useState("");
 const [pending,setPending]=useState<string|null>(null),key="zhixu-user-receipt:"+session.user?.id;
 const permitted=session.status==="authenticated"&&session.hasPermission("user_permissions.manage");
 useEffect(()=>{alive.current=true;try{const id=sessionStorage.getItem(key);if(id)queueMicrotask(()=>{if(alive.current)setPending(id);});}catch{}return()=>{alive.current=false;};},[key]);
 function remember(id:string|null){setPending(id);try{if(id)sessionStorage.setItem(key,id);else sessionStorage.removeItem(key);}catch{}}
 useEffect(()=>{
  if(!permitted)return;const ticket=++serial.current;
  const p=new URLSearchParams({limit:"25",offset:String(query.offset)});for(const k of ["q","roleId","status"] as const)if(query[k])p.set(k,query[k]);
  void client.read(p).then(d=>{if(alive.current&&ticket===serial.current){setDirectory(d);setError("");}},()=>{if(alive.current&&ticket===serial.current)setError("用户列表暂时不可用，请重新读取。");});
 },[permitted,query,refreshId]);
 const dirty=Boolean(dialog&&(dialog.kind==="create"&&(name||account||password)||dialog.kind==="edit"&&(name!==dialog.user.name||roleId!==(dialog.user.roleIds.length===1?dialog.user.roleIds[0]:"")||status!==dialog.user.status)||dialog.kind==="reset"&&password));
 useEffect(()=>{if(!dirty&&!pending)return;const f=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener("beforeunload",f);return()=>window.removeEventListener("beforeunload",f);},[dirty,pending]);
 function leave(){return !pending&&(!dirty||window.confirm("有未保存的用户资料，是否放弃？"));}
 function close(){if(!busy&&leave()){setDialog(null);setPassword("");setFeedback("");}}
 function open(kind:Dialog["kind"],user?:TeamUser){
  if(!leave())return;setName(user?.name??"");setAccount(user?.account??"");setPassword("");setRoleId(user?.roleIds.length===1?user.roleIds[0]:user?"":directory?.assignableRoleIds.find(id=>id==="role-team-quote-manager")??directory?.assignableRoleIds[0]??"");setStatus(user?.status==="active"?"active":"inactive");setFeedback("");
  setDialog(kind==="create"?{kind,requestId:crypto.randomUUID()}:{kind,user:user!,requestId:crypto.randomUUID()});
 }
 async function execute(command:TeamCommand){
  if(lock.current)return;lock.current=true;setBusy(true);setFeedback("");remember(command.requestId!);setPassword("");
  try{const user=await client.execute(command);if(!alive.current)return;++serial.current;setDirectory(d=>d?{...d,users:d.users.map(u=>u.id===user.id?user:u)}:d);remember(null);setDialog(null);setFeedback("已保存");setRefreshId(n=>n+1);
   if(command.action!=="create"&&command.id===session.user?.id)session.invalidate();
  }catch(e){if(!alive.current)return;
   if(e instanceof ServerAuthError&&[400,403,404,409].includes(e.status))remember(null);
   setFeedback(e instanceof Error?e.message:"结果尚未确认，请核对提交结果。");
   if(e instanceof ServerAuthError&&e.status===401)session.invalidate();
  }finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function reconcile(){if(!pending||lock.current)return;lock.current=true;setBusy(true);try{
  const d=await client.read(new URLSearchParams({requestId:pending,limit:"1"}));if(!alive.current)return;
  setFeedback(d.receipt?"已确认操作成功，请查看最新用户资料。":"未找到已提交结果。请重新填写密码并明确提交。");remember(null);setDialog(null);setPassword("");setRefreshId(n=>n+1);
 }catch{if(alive.current)setFeedback("暂时无法核对，请稍后再试。");}finally{lock.current=false;if(alive.current)setBusy(false);}}
 const roleNames=(u:TeamUser)=>u.roleIds.map(id=>directory?.roles.find(r=>r.id===id)?.name??"历史角色").join("、");
 const lastLogin=(u:TeamUser)=>u.lastLoginAt?new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",dateStyle:"short",timeStyle:"short"}).format(new Date(u.lastLoginAt)):"暂无记录";
 const manage=(u:TeamUser)=><Button variant="text" disabled={busy||Boolean(pending)} aria-label={"管理 "+u.account} onClick={()=>open(u.status==="archived"?"restore":"edit",u)}>{u.status==="archived"?"恢复":"管理"}</Button>;
 const columns:DataColumn<TeamUser>[]=[{key:"name",header:"姓名",render:u=><strong>{u.name}</strong>},{key:"account",header:"登录账号",render:u=>u.account},{key:"role",header:"角色",render:u=><>{roleNames(u)}{u.roleIds.length>1&&<small>历史多角色，尚未调整</small>}</>},{key:"status",header:"状态",render:u=><span className={"qc-user-status "+u.status}>{statusLabel[u.status]}{u.passwordResetRequired?" · 待重置密码":""}</span>},{key:"lastLogin",header:"最近登录（北京时间）",render:lastLogin},{key:"actions",header:"操作",render:manage}];
 const target=dialog&&dialog.kind!=="create"?dialog.user:null,isSelf=target?.id===session.user?.id;
 const needsPassword=dialog?.kind==="create"||dialog?.kind==="reset";
 const invalid=busy||Boolean(pending)||Boolean(needsPassword&&passwordValidationMessage(password))||Boolean(dialog?.kind==="create"&&(!name.trim()||! /^[a-z0-9][a-z0-9._-]{2,63}$/iu.test(account.trim())||!roleId))||Boolean(dialog?.kind==="edit"&&!name.trim())||Boolean(dialog?.kind==="restore"&&!directory?.assignableRoleIds.includes(roleId));
 function submit(){
  if(!dialog||invalid)return;
  if(dialog.kind==="create"){void execute({action:"create",requestId:dialog.requestId,account,name,password,roleIds:[roleId]});return;}
  const t={id:dialog.user.id,expectedVersion:dialog.user.version,requestId:dialog.requestId};
  if(dialog.kind==="edit")void execute({...t,action:"update",name,status,roleIds:roleId?[roleId]:dialog.user.roleIds});
  else if(dialog.kind==="reset")void execute({...t,action:"reset-password",password});
  else if(dialog.kind==="restore")void execute({...t,action:"restore",roleIds:[roleId]});
  else void execute({...t,action:dialog.kind});
 }
 return <AppShell title="用户管理" onRequestNavigation={to=>{if(leave())router.push(to);}} onRequestLogout={async()=>{if(leave())await session.logout();}}><PageContainer>
 <PageHeader title="用户管理" description="管理登录账号、角色和启用状态。" actions={permitted?<Button disabled={busy||Boolean(pending)} onClick={()=>open("create")}>新建用户</Button>:undefined}/>
 {!permitted?<ErrorState title="暂无权限" description="仅服务器管理员可管理用户。"/>:<>
 <Card className="qc-admin-filters"><SearchField value={search} onChange={setSearch} placeholder="搜索姓名、账号或角色"/><label>角色<select aria-label="筛选角色" className="qc-control" value={query.roleId} onChange={e=>setQuery({...query,roleId:e.target.value,offset:0})}><option value="">全部角色</option>{directory?.roles.map(r=><option key={r.id} value={r.id}>{r.name}{r.archived?"（已删除）":""}</option>)}</select></label><label>状态<select aria-label="筛选状态" className="qc-control" value={query.status} onChange={e=>setQuery({...query,status:e.target.value,offset:0})}><option value="">正常用户</option><option value="active">启用</option><option value="inactive">停用</option><option value="archived">已删除用户</option></select></label><Button variant="secondary" onClick={()=>setQuery({...query,q:search,offset:0})}>查询</Button><Button variant="text" onClick={()=>setRefreshId(n=>n+1)}>重新读取</Button></Card>
 {feedback&&<p role="status">{feedback}</p>}{pending&&<Button disabled={busy} onClick={()=>void reconcile()}>核对提交结果</Button>}
 {error?<ErrorState title={error} onRetry={()=>setRefreshId(n=>n+1)}/>:!directory?<LoadingState/>:<><DataTable columns={columns} rows={directory.users} rowKey={u=>u.id} ariaLabel="用户列表" renderRecord={u=><div className="qc-user-mobile"><strong>{u.name}</strong><span>{u.account}</span><span>{roleNames(u)}</span><span>{statusLabel[u.status]}{u.passwordResetRequired?" · 待重置密码":""} · 最近登录 {lastLogin(u)}</span>{manage(u)}</div>} emptyTitle="暂无匹配用户"/><div className="qc-admin-pagination"><Button variant="secondary" disabled={!query.offset} onClick={()=>setQuery({...query,offset:Math.max(0,query.offset-25)})}>上一页</Button><span>共 {directory.total} 位用户</span><Button variant="secondary" disabled={query.offset+directory.users.length>=directory.total} onClick={()=>setQuery({...query,offset:query.offset+25})}>下一页</Button></div></>}
 </>}
 <Modal open={Boolean(dialog)} title={dialog?.kind==="create"?"新建用户":dialog?.kind==="edit"?"管理用户":dialog?.kind==="reset"?"重置密码":dialog?.kind==="restore"?"恢复用户":dialog?.kind==="archive"?"删除用户":"退出全部会话"} onClose={close} footer={<><Button variant="secondary" disabled={busy||Boolean(pending)} onClick={close}>取消</Button><Button disabled={invalid} onClick={submit}>{busy?"保存中…":dialog?.kind==="archive"?"确认删除":dialog?.kind==="restore"?"确认恢复":dialog?.kind==="revoke-sessions"?"确认退出":"保存"}</Button></>}>
 {(dialog?.kind==="create"||dialog?.kind==="edit")&&<div className="qc-admin-account-form"><label>姓名<input className="qc-control" value={name} maxLength={80} disabled={busy||Boolean(pending)} onChange={e=>setName(e.target.value)}/></label><label>登录账号<input className="qc-control" autoComplete="off" value={account} maxLength={64} disabled={dialog.kind==="edit"||busy||Boolean(pending)} onChange={e=>setAccount(e.target.value)}/><small>{dialog.kind==="create"?"3–64位字母、数字、点、下划线或连字符；建立后不可修改。":"账号建立后不可修改。"}</small></label></div>}
 {(dialog?.kind==="create"||dialog?.kind==="edit"||dialog?.kind==="restore")&&<label className="qc-admin-form-field">角色<select className="qc-control" value={roleId} disabled={Boolean(isSelf)||busy||Boolean(pending)} onChange={e=>setRoleId(e.target.value)}>{!roleId&&<option value="">{target?.roleIds.length?"保留历史角色："+roleNames(target):"请选择角色"}</option>}{directory?.roles.filter(r=>directory.assignableRoleIds.includes(r.id)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
 {dialog?.kind==="edit"&&<label className="qc-admin-form-field">启用状态<select aria-label="启用状态" className="qc-control" value={status} disabled={Boolean(isSelf)||busy||Boolean(pending)} onChange={e=>setStatus(e.target.value as "active"|"inactive")}><option value="active">启用</option><option value="inactive">停用</option></select></label>}
 {needsPassword&&<PasswordField value={password} onChange={setPassword} disabled={busy||Boolean(pending)}/>}
 {target&&dialog?.kind!=="edit"&&<p>{target.name} · {target.account}</p>}
 {dialog?.kind==="archive"&&<p>删除后禁止登录并移出正常列表；历史记录完整保留，可从“已删除用户”恢复。</p>}
 {dialog?.kind==="restore"&&<p>恢复后为停用状态。请选择有效角色，再重置密码后启用。</p>}
 {dialog?.kind==="revoke-sessions"&&<p>该用户在所有设备上的登录将失效；下次使用需要重新登录。</p>}
 {dialog?.kind==="reset"&&<p>保存后原有会话立即失效；密码不会出现在列表或操作记录中。</p>}
 {target?.passwordResetRequired&&<p>该用户已恢复，请先重置密码后启用。</p>}
 {dialog?.kind==="edit"&&target&&<div className="qc-admin-actions"><Button variant="secondary" disabled={busy||Boolean(pending)} onClick={()=>open("reset",target)}>重置密码</Button><Button variant="secondary" disabled={busy||Boolean(pending)} onClick={()=>open("revoke-sessions",target)}>退出全部会话</Button><Button variant="text" disabled={Boolean(isSelf)||busy||Boolean(pending)} onClick={()=>open("archive",target)}>删除用户</Button></div>}
 {feedback&&<p role="status">{feedback}</p>}{pending&&<Button disabled={busy} onClick={()=>void reconcile()}>核对提交结果</Button>}
 </Modal></PageContainer></AppShell>;
}
