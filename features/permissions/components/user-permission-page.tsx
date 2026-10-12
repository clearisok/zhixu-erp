"use client";

import { useMemo, useState } from "react";
import { AppShell, Button, Card, MasterDetail, Modal, PageContainer, PageHeader, SearchField, StatusTag, Toolbar, useResponsiveMode } from "@/components/foundation";
import { PERMISSION_DEFINITIONS, updateRolePermissions, updateUserRole, updateUserStatus, type PermissionKey } from "../model/permissions";
import { PERMISSION_DENIED_MESSAGE, PermissionButton } from "./permission-button";
import { usePermissions } from "./permission-provider";
import { createOperationLogDraft, operationLogRepository } from "@/features/operation-logs";

export function UserPermissionPage() {
  return <UserPermissionView controller={usePermissions()} />;
}

type Management = { busy: boolean; feedback: string; assignableRoleIds: string[]; create(): void; reset(id: string): void; update(id: string, patch: { roleId?: string; status?: "active" | "inactive" }): void };
export function UserPermissionView({ controller, management }: { controller: ReturnType<typeof usePermissions>; management?: Management }) {
  const { state, currentUser, can, setCurrentUser, saveState, resetState } = controller;
  const mode = useResponsiveMode();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [permissionQuery, setPermissionQuery] = useState("");
  const [saveFeedback, setSaveFeedback] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const selectedUser = state.users.find((user) => user.id === selectedUserId) ?? state.users[0];
  const selectedRole = state.roles.find((role) => role.id === selectedUser?.roleId) ?? state.roles[0];
  const grouped = useMemo(() => Map.groupBy(PERMISSION_DEFINITIONS, (item) => item.module), []);
  const manageable = can("user_permissions.manage") && !management?.busy;
  const mobile = mode === "mobile" || mode === "tablet";
  const filteredUsers = useMemo(() => {
    const needle = userQuery.trim().toLocaleLowerCase();
    return state.users.filter((user) => {
      const role = state.roles.find((item) => item.id === user.roleId);
      return !needle || [user.name, user.account, role?.name ?? ""].some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [state.roles, state.users, userQuery]);

  const persist = (next: Parameters<typeof saveState>[0], log: ReturnType<typeof createOperationLogDraft>) => {
    setSaveFeedback("正在保存…");
    try {
      saveState(next);
      setSaveFeedback("已保存");
      void operationLogRepository.append(log).catch(() => setSaveFeedback("保存成功，操作日志写入失败"));
      window.setTimeout(() => setSaveFeedback(""), 2200);
    } catch (error) {
      setSaveFeedback(error instanceof Error ? error.message : "保存失败");
    }
  };
  const togglePermission = (permission: PermissionKey, checked: boolean) => {
    if (!manageable || !selectedRole) return;
    const next = checked ? [...selectedRole.permissions, permission] : selectedRole.permissions.filter((item) => item !== permission);
    persist(updateRolePermissions(state, selectedRole.id, next), createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "权限管理", entityType: "Role", entityId: selectedRole.id, action: "修改权限", beforeData: { values: { [permission]: checked ? "未授权" : "已授权" } }, afterData: { values: { [permission]: checked ? "已授权" : "未授权" } } }));
  };
  const changeUserRole = (roleId: string) => {
    if (!manageable || !selectedUser) return;
    if (management) { management.update(selectedUser.id, { roleId }); return; }
    const beforeRole = state.roles.find((role) => role.id === selectedUser.roleId)?.name ?? selectedUser.roleId;
    const afterRole = state.roles.find((role) => role.id === roleId)?.name ?? roleId;
    persist(updateUserRole(state, selectedUser.id, roleId), createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "权限管理", entityType: "User", entityId: selectedUser.id, action: "修改角色", beforeData: { values: { "用户": selectedUser.name, "角色": beforeRole } }, afterData: { values: { "用户": selectedUser.name, "角色": afterRole } } }));
  };
  const changeUserStatus = (status: "active" | "inactive") => {
    if (!manageable || !selectedUser || selectedUser.id === currentUser.id) return;
    if (management) { management.update(selectedUser.id, { status }); return; }
    persist(updateUserStatus(state, selectedUser.id, status), createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "权限管理", entityType: "User", entityId: selectedUser.id, action: "修改账号状态", beforeData: { values: { "用户": selectedUser.name, "状态": selectedUser.status === "active" ? "启用" : "停用" } }, afterData: { values: { "用户": selectedUser.name, "状态": status === "active" ? "启用" : "停用" } } }));
  };

  const master = <Card className="qc-permission-user-list">
    <header><div><h2>用户与角色</h2><p>{filteredUsers.length} / {state.users.length} 个账号</p></div></header>
    <Toolbar search={<SearchField value={userQuery} onChange={setUserQuery} placeholder="搜索姓名、账号或角色" />} resultSummary={`${PERMISSION_DEFINITIONS.length} 项动态权限`} />
    <div className="qc-permission-user-records">{filteredUsers.map((user) => {
      const role = state.roles.find((item) => item.id === user.roleId);
      const granted = role?.permissions.length ?? 0;
      return <button type="button" key={user.id} className={selectedUser?.id === user.id ? "selected" : ""} onClick={() => setSelectedUserId(user.id)}><span><strong>{user.name}</strong>{currentUser.id === user.id && <small>当前账号</small>}</span><span><b>{role?.name ?? "未分配"}</b><small>{granted} / {PERMISSION_DEFINITIONS.length} 项</small></span><StatusTag tone={user.status === "active" ? "success" : "neutral"}>{user.status === "active" ? "启用" : "停用"}</StatusTag></button>;
    })}</div>
  </Card>;

  const detail = selectedUser && selectedRole ? <Card className="qc-permission-detail">
    <header><div><span className="eyebrow">USER · ROLE · PERMISSION</span><h2>{selectedUser.name}</h2><p>{selectedUser.account} · 权限来自“{selectedRole.name}”角色</p></div><div className="qc-permission-detail-actions">{mobile && <Button variant="secondary" onClick={() => setSelectedUserId("")}>返回用户</Button>}{management ? <Button variant="secondary" disabled={!manageable} onClick={() => management.reset(selectedUser.id)}>重置密码</Button> : <Button variant="secondary" disabled={selectedUser.status !== "active"} onClick={() => setCurrentUser(selectedUser.id)}>切换账号</Button>}</div></header>
    {!manageable && <div className="qc-permission-readonly-note">{PERMISSION_DENIED_MESSAGE}。当前仅可查看角色权限。</div>}
    <div className="qc-permission-account-fields"><label><span>角色</span><select className="qc-control" disabled={!manageable || Boolean(management && selectedUser.id === currentUser.id)} value={selectedUser.roleId} onChange={(event) => changeUserRole(event.target.value)}>{state.roles.filter((role) => !management || management.assignableRoleIds.includes(role.id) || role.id === selectedUser.roleId).map((role) => <option key={role.id} value={role.id} disabled={Boolean(management && !management.assignableRoleIds.includes(role.id))}>{role.name}</option>)}</select></label><label><span>状态</span><select className="qc-control" disabled={!manageable || selectedUser.id === currentUser.id} value={selectedUser.status} onChange={(event) => changeUserStatus(event.target.value as "active" | "inactive")}><option value="active">启用</option><option value="inactive">停用</option></select></label></div>
    <div className="qc-role-summary"><strong>{selectedRole.name}</strong><span>{selectedRole.permissions.length} / {PERMISSION_DEFINITIONS.length} 项权限</span><p>{selectedRole.description}</p>{(management?.feedback || saveFeedback) && <small role="status">{management?.feedback || saveFeedback}</small>}</div>
    <div className="qc-permission-search"><SearchField value={permissionQuery} onChange={setPermissionQuery} placeholder="搜索权限名称、说明或 PermissionKey" /></div>
    <div className="qc-permission-groups">{[...grouped.entries()].map(([module, permissions]) => {
      const visible = permissions.filter((permission) => !permissionQuery.trim() || `${permission.label} ${permission.description} ${permission.key}`.toLocaleLowerCase().includes(permissionQuery.trim().toLocaleLowerCase()));
      if (!visible.length) return null;
      return <details key={module} open><summary><strong>{module}</strong><span>{permissions.filter((permission) => selectedRole.permissions.includes(permission.key)).length} / {permissions.length}</span></summary>{visible.map((permission) => <label key={permission.key} className={selectedRole.permissions.includes(permission.key) ? "checked" : ""}><input type="checkbox" disabled={Boolean(management) || !manageable || selectedRole.id === "role-admin"} checked={selectedRole.permissions.includes(permission.key)} onChange={(event) => togglePermission(permission.key, event.target.checked)} /><span><strong>{permission.label}</strong><small>{permission.description}</small><code>{permission.key}</code></span></label>)}</details>;
    })}</div>
  </Card> : <Card className="qc-permission-detail qc-permission-detail-empty"><strong>选择一个用户</strong><p>查看角色与权限分组。</p></Card>;

  return <AppShell title="用户权限"><PageContainer>
    <PageHeader eyebrow="ACCESS CONTROL" title="用户权限" description="以用户、角色和 PermissionKey 管理访问范围；权限数量由当前目录动态计算。" actions={management ? <Button variant="secondary" disabled={!manageable} onClick={management.create}>新建账号</Button> : <PermissionButton permission="user_permissions.manage" variant="secondary" onClick={() => setResetOpen(true)}>恢复默认权限</PermissionButton>} />
    <MasterDetail className="qc-permission-layout" master={master} detail={detail} selected={Boolean(selectedUserId)} masterLabel="用户与角色" detailLabel="权限详情" />
    <Modal open={resetOpen} title="确认恢复默认权限" description="该操作会覆盖当前用户与角色权限配置，但不会删除报价或附件。" onClose={() => setResetOpen(false)} footer={<><Button variant="secondary" onClick={() => setResetOpen(false)}>取消</Button><Button variant="danger" onClick={() => { resetState(); setResetOpen(false); }}>确认恢复</Button></>}><p>这是显式数据写入操作。请确认当前权限调整不再需要后再继续。</p></Modal>
  </PageContainer></AppShell>;
}
