"use client";
import {useEffect,useRef,useState} from "react";
import {useProtectedRouter as useRouter} from '@/components/foundation/server-navigation-protection';
import {AppShell,Button,Card,MasterDetail,Modal,PageContainer,PageHeader,SearchField,Toolbar,ErrorState,LoadingState} from "@/components/foundation";
import {useServerSession} from "@/features/server-auth";
import {PERMISSION_DEFINITIONS,type PermissionKey} from "../model/permissions";
import {roleRequest,RoleRequestError,type ManagedRole,type RoleCommand} from "../server/role-client";
import "../admin-settings.css";
import {useServerNavigationProtection} from '@/components/foundation/server-navigation-protection';
type Draft={name:string;description:string;permissions:PermissionKey[]};
const adminKeys=new Set(["user_permissions.view","user_permissions.manage"]);
export function ServerRolePage(){const s=useServerSession();return <RolePage key={s.user?.id+":"+s.permissions.join("|")}/>;}
function RolePage(){
 const session=useServerSession(),router=useRouter(),alive=useRef(true),lock=useRef(false);
 const [roles,setRoles]=useState<ManagedRole[]>([]),[selected,setSelected]=useState(""),[draft,setDraft]=useState<Draft|null>(null);
 const [query,setQuery]=useState(""),[permissionQuery,setPermissionQuery]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
 const [newRole,setNewRole]=useState(false),[confirm,setConfirm]=useState<"save"|"delete"|null>(null),[pending,setPending]=useState<{requestId:string}|null>(null);
 const receiptKey="zhixu-role-receipt:"+session.user?.id;
 useEffect(()=>{try{const id=sessionStorage.getItem(receiptKey);if(id)queueMicrotask(()=>{if(alive.current)setPending({requestId:id});});}catch{/* In-memory recovery remains available. */}},[receiptKey]);
 function remember(value:{requestId:string}|null){setPending(value);try{if(value)sessionStorage.setItem(receiptKey,value.requestId);else sessionStorage.removeItem(receiptKey);}catch{/* No secrets or form values are persisted. */}}
 const permitted=session.hasPermission("user_permissions.manage"),role=roles.find(r=>r.id===selected);
 const dirty=Boolean(draft&&(newRole||role&&(draft.name!==role.name||draft.description!==role.description||JSON.stringify([...draft.permissions].sort())!==JSON.stringify([...role.permissions].sort()))));
 useServerNavigationProtection({dirty,blocked:busy||Boolean(pending),message:'权限操作尚未确认，请先核对提交结果。'});
 async function refresh(){const result=await roleRequest();if(alive.current){setRoles(result.roles??[]);setLoading(false);}}
 useEffect(()=>{alive.current=true;if(permitted)void refresh().catch(()=>{if(alive.current){setFeedback("角色读取失败，请重试。");setLoading(false);}});return()=>{alive.current=false;};},[permitted]);
 useEffect(()=>{if(!dirty&&!pending)return;const fn=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener("beforeunload",fn);return()=>window.removeEventListener("beforeunload",fn);},[dirty,pending]);
 function leave(){return !pending&&(!dirty||window.confirm("有未保存的权限修改，是否放弃？"));}
 function select(next:ManagedRole){if(!leave())return;setSelected(next.id);setNewRole(false);setDraft({name:next.name,description:next.description,permissions:[...next.permissions]});setFeedback("");}
 function start(copy=false){if(!leave())return;setSelected("");setNewRole(true);setDraft({name:copy&&role?role.name+"副本":"",description:copy&&role?role.description:"",permissions:copy&&role?role.permissions.filter(p=>!adminKeys.has(p)):[]});setFeedback("");}
 function toggle(key:PermissionKey){if(!draft)return;setDraft({...draft,permissions:draft.permissions.includes(key)?draft.permissions.filter(p=>p!==key):[...draft.permissions,key]});}
 async function save(command:RoleCommand){
  if(lock.current)return;lock.current=true;setBusy(true);remember(command);setFeedback("");
  try{const result=await roleRequest(command);if(!alive.current)return;remember(null);setConfirm(null);await refresh();setNewRole(false);if(result.role){setSelected(result.role.id);setDraft({name:result.role.name,description:result.role.description,permissions:[...result.role.permissions]});}else{setSelected("");setDraft(null);}setFeedback("已保存。相关用户重新登录后使用新权限。");}
  catch(e){if(alive.current){if(e instanceof RoleRequestError&&[400,403,404,409].includes(e.status)){remember(null);setConfirm(null);}setFeedback(e instanceof Error?e.message:"结果尚未确认，请点击核对提交结果。");}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function reconcile(){
  if(!pending||lock.current)return;lock.current=true;setBusy(true);
  try{const result=await roleRequest(undefined,pending.requestId);if(!alive.current)return;
   if(result.receipt){setFeedback("已确认操作成功，请重新选择角色查看。");setDraft(null);setSelected("");setNewRole(false);}
   else setFeedback("未找到已提交结果；已保留输入，可以重新预览提交。");
   remember(null);setConfirm(null);await refresh();
  }catch{if(alive.current)setFeedback("暂时无法核对，请稍后再试。");}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const navigate=(to:string)=>{if(leave())router.push(to);};
 const groups=Map.groupBy(PERMISSION_DEFINITIONS,p=>p.module);
 const filtered=roles.filter(r=>(r.name+" "+r.description).toLowerCase().includes(query.trim().toLowerCase()));
 const added=draft?.permissions.filter(p=>!role?.permissions.includes(p)).length??0,removed=role?.permissions.filter(p=>!draft?.permissions.includes(p)).length??0;
 const master=<Card className="qc-permission-user-list"><header><div><h2>角色列表</h2><p>{roles.length} 个角色</p></div></header><Toolbar search={<SearchField value={query} onChange={setQuery} placeholder="搜索角色名称或说明"/>}/><div className="qc-permission-user-records">{filtered.map(r=><button type="button" key={r.id} className={selected===r.id?"selected":""} disabled={busy||Boolean(pending)} onClick={()=>select(r)}><span><strong>{r.name}</strong><small>{r.protected?"系统保护":r.userCount+" 位用户使用"}</small></span><span>{r.permissions.length} 项权限</span></button>)}</div></Card>;
 const detail=draft?<Card className="qc-permission-detail"><header><Button variant="text" onClick={()=>{if(leave()){setDraft(null);setSelected("");setNewRole(false);}}}>返回角色列表</Button><div><h2>{newRole?"新建角色":role?.name}</h2><p>{role?.protected?"服务器管理员始终保留管理能力。":"编辑权限后，保存才会生效。"}</p></div>{role&&!role.protected&&<Button variant="text" disabled={busy||Boolean(pending)} onClick={()=>start(true)}>复制角色</Button>}</header>
 <div className="qc-permission-account-fields"><label><span>角色名称</span><input className="qc-control" maxLength={80} value={draft.name} disabled={role?.protected||busy||Boolean(pending)} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label><span>说明</span><input className="qc-control" maxLength={500} value={draft.description} disabled={role?.protected||busy||Boolean(pending)} onChange={e=>setDraft({...draft,description:e.target.value})}/></label></div>
 <div className="qc-permission-search"><SearchField value={permissionQuery} onChange={setPermissionQuery} placeholder="搜索权限名称或说明"/></div>
 <div className="qc-permission-groups">{[...groups].map(([module,items])=>{const visible=items.filter(p=>(p.label+" "+p.description).includes(permissionQuery));return visible.length?<details key={module} open><summary><strong>{module}</strong><span>{items.filter(p=>draft.permissions.includes(p.key)).length} / {items.length}</span></summary>{visible.map(p=><label key={p.key}><input type="checkbox" checked={draft.permissions.includes(p.key)} disabled={role?.protected||adminKeys.has(p.key)||busy||Boolean(pending)} onChange={()=>toggle(p.key)}/><span><strong>{p.label}</strong><small>{adminKeys.has(p.key)?"仅服务器管理员可拥有":p.description}</small></span></label>)}</details>:null;})}</div>
 {!role?.protected&&<div className="qc-admin-actions"><Button disabled={!dirty||!draft.name.trim()||busy||Boolean(pending)} onClick={()=>setConfirm("save")}>保存权限</Button><Button variant="secondary" disabled={busy||Boolean(pending)} onClick={()=>{setDraft(null);setSelected("");setNewRole(false);}}>取消</Button>{role&&<Button variant="text" disabled={busy||Boolean(pending)} onClick={()=>setConfirm("delete")}>删除角色</Button>}</div>}</Card>:<Card className="qc-permission-detail qc-permission-detail-empty"><strong>选择一个角色</strong><p>查看或编辑它的业务权限。</p></Card>;
 return <AppShell title="角色权限" onRequestNavigation={navigate} onRequestLogout={async()=>{if(leave())await session.logout();}}><PageContainer><PageHeader title="角色权限" description="先配置角色可以做什么，再到用户管理分配角色。" actions={<Button disabled={!permitted||busy||Boolean(pending)} onClick={()=>start()}>新建角色</Button>}/>
 {feedback&&<p role="status">{feedback}</p>}{!loading&&!roles.length&&permitted&&!pending&&<Button variant="secondary" onClick={()=>void refresh().catch(()=>setFeedback("角色读取失败，请重试。"))}>重新读取</Button>}{pending&&<Button disabled={busy} onClick={()=>void reconcile()}>核对提交结果</Button>}
 {!permitted?<ErrorState title="仅服务器管理员可管理角色"/>:loading?<LoadingState/>:<MasterDetail className="qc-permission-layout" master={master} detail={detail} selected={Boolean(draft)} masterLabel="角色列表" detailLabel="角色权限"/>}
 <Modal open={Boolean(confirm)&&!pending} title={confirm==="delete"?"删除角色":"确认权限修改"} onClose={()=>setConfirm(null)} footer={<><Button variant="secondary" onClick={()=>setConfirm(null)}>取消</Button><Button disabled={busy||confirm==="delete"&&Boolean(role?.userCount)} onClick={()=>{if(confirm==="delete"&&role)void save({action:"archive",id:role.id,expectedVersion:role.version,requestId:crypto.randomUUID()});else if(draft)void save(role?{...draft,action:"update",id:role.id,expectedVersion:role.version,requestId:crypto.randomUUID()}:{...draft,action:"create",requestId:crypto.randomUUID()});}}>确认{confirm==="delete"?"删除":"保存"}</Button></>}>
 {confirm==="delete"?<p>{role?.userCount?role.userCount+" 位用户仍在使用，请先到用户管理更换角色。":"删除后不能再分配，历史记录会保留。"}</p>:<><p>新增 {added} 项权限，移除 {removed} 项权限。</p><p>影响 {role?.userCount??0} 位用户，他们需要重新登录。</p><p>修改业务功能不会自动授予成本、售价或工价权限。</p></>}
 </Modal></PageContainer></AppShell>;
}

