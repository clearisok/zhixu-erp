"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell, Button, ErrorState, LoadingState, Modal, PageContainer } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { ServerAuthError } from "@/features/server-auth/server-auth-client";
import { createTeamAccessClient, type TeamCommand, type TeamDirectory, type TeamUser } from "../server/team-access-client";
import { UserPermissionView } from "./user-permission-page";
import type { PermissionState, Role, User } from "../model/permissions";

const client = createTeamAccessClient();
export function ServerUserPermissionPage() {
  const session=useServerSession();
  return <SessionTeamPage key={`${session.user?.id??"anonymous"}:${[...session.permissions].sort().join(",")}`} />;
}
function SessionTeamPage() {
  const session = useServerSession();
  const [directory,setDirectory]=useState<TeamDirectory|null>(null);
  const [feedback,setFeedback]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [dialog,setDialog]=useState<{kind:"create";requestId:string}|{kind:"reset";user:TeamUser}|null>(null);
  const [name,setName]=useState("");
  const [account,setAccount]=useState("");
  const [roleId,setRoleId]=useState("role-team-quote-manager");
  const [password,setPassword]=useState("");
  const serial=useRef(0);
  const lock=useRef(false);
  const permitted=session.status==="authenticated"&&session.hasPermission("user_permissions.view");
  const identityKey=session.user?.id;
  useEffect(()=>{
    const generation=serial;
    const ticket=++serial.current;
    if(permitted) void client.read().then(data=>{if(ticket===serial.current){setDirectory(data);setError("");}},failure=>{
      if(ticket===serial.current){setDirectory(null);setError(failure instanceof Error?failure.message:"读取失败");}
    });
    return()=>{generation.current++;};
  },[permitted,identityKey]);
  async function refresh() {
    const ticket=++serial.current;
    try { const data=await client.read(); if(ticket===serial.current){setDirectory(data);setError("");} }
    catch(failure){if(ticket===serial.current){setDirectory(null);setError(failure instanceof Error?failure.message:"读取失败");if(failure instanceof ServerAuthError&&failure.status===401)session.invalidate();}}
  }
  async function execute(command:TeamCommand) {
    if(lock.current)return;
    const ticket=serial.current;
    lock.current=true;setBusy(true);setFeedback("");
    try {
      await client.execute(command);
      if(ticket!==serial.current)return;
      setFeedback("已保存");setDialog(null);setPassword("");
      if(command.action!=="create"&&command.id===session.user?.id) { setDirectory(null);session.invalidate(); }
      else await refresh();
    } catch(failure) {
      if(ticket!==serial.current)return;
      setFeedback(failure instanceof Error?failure.message:"保存失败");
      if(failure instanceof ServerAuthError&&[401,403].includes(failure.status)){setDirectory(null);if(failure.status===401)session.invalidate();else setError(failure.message);}
      setPassword("");
    } finally {lock.current=false;setBusy(false);}
  }
  function closeDialog(){if(!busy){setDialog(null);setPassword("");}}
  if(!permitted)return <AppShell title="用户权限"><PageContainer><ErrorState title="暂无权限" description="需要当前 Server 账号的用户权限查看授权。" /></PageContainer></AppShell>;
  if(error)return <AppShell title="用户权限"><PageContainer><ErrorState title="账号目录不可用" description={error} onRetry={()=>void refresh()} /></PageContainer></AppShell>;
  if(!directory)return <LoadingState label="读取账号与角色" />;
  const roles:Role[]=[...directory.roles];
  const users:User[]=directory.users.map(user=>{
    let id=user.roleIds[0]??"unassigned";
    if(user.roleIds.length!==1){
      id="effective-"+user.id;
      const matches=roles.filter(role=>user.roleIds.includes(role.id));
      roles.push({id,name:matches.map(role=>role.name).join("、")||"未分配",description:"当前账号的角色权限并集；选择预设会替换当前全部角色",permissions:[...new Set(matches.flatMap(role=>role.permissions))]});
    }
    return {id:user.id,name:user.name,account:user.account,roleId:id,status:user.status};
  });
  const currentUser=users.find(user=>user.id===session.user?.id)??{id:session.user!.id,name:session.user!.name,account:session.user!.username,roleId:"",status:"active" as const};
  const state:PermissionState={schemaVersion:1,currentUserId:currentUser.id,users,roles};
  const deny=()=>{throw new Error("Browser权限写入不可用");};
  return <>
    <UserPermissionView controller={{state,currentUser,currentRole:roles.find(r=>r.id===currentUser.roleId)??roles[0],can:session.hasPermission,setCurrentUser:deny,saveState:deny,resetState:deny}}
      management={{busy,feedback,assignableRoleIds:directory.assignableRoleIds,
        create:()=>{setName("");setAccount("");setPassword("");setRoleId("role-team-quote-manager");setDialog({kind:"create",requestId:crypto.randomUUID()});},
        reset:id=>{const user=directory.users.find(u=>u.id===id);if(user){setPassword("");setDialog({kind:"reset",user});}},
        update:(id,patch)=>{const user=directory.users.find(u=>u.id===id);if(user)void execute({action:"update",id,expectedVersion:user.version,name:user.name,status:patch.status??user.status,roleIds:patch.roleId?[patch.roleId]:user.roleIds});}}} />
    <Modal open={Boolean(dialog)} title={dialog?.kind==="create"?"新建账号":"重置密码"} description="仅更新所选账号；密码不显示在列表或日志中。" onClose={closeDialog}
      footer={<><Button variant="secondary" disabled={busy} onClick={closeDialog}>取消</Button><Button disabled={busy||!password||(dialog?.kind==="create"&&(!account.trim()||!name.trim()))} onClick={()=>{if(dialog)void execute(dialog.kind==="create"?{action:"create",requestId:dialog.requestId,name,account,password,roleIds:[roleId]}:{action:"reset-password",id:dialog.user.id,expectedVersion:dialog.user.version,password});}}>{busy?"保存中…":"保存"}</Button></>}>
      {dialog?.kind==="create"&&<div className="qc-permission-account-fields">
        <label><span>姓名或代号</span><input className="qc-control" value={name} maxLength={80} disabled={busy} onChange={e=>setName(e.target.value)} /></label>
        <label><span>登录账号</span><input className="qc-control" value={account} maxLength={64} autoComplete="off" disabled={busy} onChange={e=>setAccount(e.target.value)} /></label>
        <label><span>角色</span><select className="qc-control" value={roleId} disabled={busy} onChange={e=>setRoleId(e.target.value)}>{roles.filter(r=>directory.assignableRoleIds.includes(r.id)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      </div>}
      {dialog?.kind==="reset"&&<p>{dialog.user.name} · {dialog.user.account}；保存后该账号原有登录会话失效。</p>}
      <label><span>新密码（至少12字符）</span><input className="qc-control" type="password" autoComplete="new-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} /></label>
      {feedback&&<p role="status">{feedback}</p>}
    </Modal>
  </>;
}
