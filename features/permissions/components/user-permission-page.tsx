"use client";

import { useMemo, useState } from "react";
import { AppShell, Button, Card, PageContainer, PageHeader, StatusTag } from "@/components/foundation";
import { PERMISSION_DEFINITIONS, updateRolePermissions, updateUserRole, updateUserStatus, type PermissionKey } from "../model/permissions";
import { PERMISSION_DENIED_MESSAGE, PermissionButton } from "./permission-button";
import { usePermissions } from "./permission-provider";
import { createOperationLogDraft, operationLogRepository } from "@/features/operation-logs";

export function UserPermissionPage() {
  const { state, currentUser, can, setCurrentUser, saveState, resetState } = usePermissions();
  const [selectedUserId, setSelectedUserId] = useState(state.users[0]?.id ?? "");
  const selectedUser = state.users.find((user) => user.id === selectedUserId) ?? state.users[0];
  const selectedRole = state.roles.find((role) => role.id === selectedUser?.roleId) ?? state.roles[0];
  const grouped = useMemo(() => Map.groupBy(PERMISSION_DEFINITIONS, (item) => item.module), []);
  const manageable = can("user_permissions.manage");

  const togglePermission = (permission: PermissionKey, checked: boolean) => {
    if (!manageable || !selectedRole) return;
    const next = checked ? [...selectedRole.permissions, permission] : selectedRole.permissions.filter((item) => item !== permission);
    saveState(updateRolePermissions(state, selectedRole.id, next));
    void operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "权限管理", entityType: "Role", entityId: selectedRole.id, action: "修改权限", beforeData: { values: { [permission]: checked ? "未授权" : "已授权" } }, afterData: { values: { [permission]: checked ? "已授权" : "未授权" } } }));
  };
  const changeUserRole = (roleId: string) => {
    if (!manageable || !selectedUser) return;
    const beforeRole = state.roles.find((role) => role.id === selectedUser.roleId)?.name ?? selectedUser.roleId;
    const afterRole = state.roles.find((role) => role.id === roleId)?.name ?? roleId;
    saveState(updateUserRole(state, selectedUser.id, roleId));
    void operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "权限管理", entityType: "User", entityId: selectedUser.id, action: "修改角色", beforeData: { values: { "用户": selectedUser.name, "角色": beforeRole } }, afterData: { values: { "用户": selectedUser.name, "角色": afterRole } } }));
  };
  const changeUserStatus = (status: "active" | "inactive") => {
    if (!manageable || !selectedUser || selectedUser.id === currentUser.id) return;
    saveState(updateUserStatus(state, selectedUser.id, status));
    void operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "权限管理", entityType: "User", entityId: selectedUser.id, action: "修改账号状态", beforeData: { values: { "用户": selectedUser.name, "状态": selectedUser.status === "active" ? "启用" : "停用" } }, afterData: { values: { "用户": selectedUser.name, "状态": status === "active" ? "启用" : "停用" } } }));
  };

  return <AppShell title="用户权限"><PageContainer>
    <PageHeader eyebrow="ACCESS CONTROL" title="用户权限" description="账号通过角色获得权限；业务组件只判断权限键，不直接判断角色名称。" actions={<PermissionButton permission="user_permissions.manage" variant="secondary" onClick={resetState}>恢复默认权限</PermissionButton>} />
    <div className="qc-permission-layout">
      <Card className="qc-permission-user-list">
        <header><div><h2>用户列表</h2><p>{state.users.length} 个测试账号</p></div></header>
        <div className="qc-permission-table-wrap"><table><thead><tr><th>姓名</th><th>账号</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>{state.users.map((user) => {
          const role = state.roles.find((item) => item.id === user.roleId);
          return <tr key={user.id} className={selectedUser?.id === user.id ? "selected" : ""}><td><strong>{user.name}</strong>{currentUser.id === user.id && <small>当前账号</small>}</td><td><code>{user.account}</code></td><td>{role?.name ?? "未分配"}</td><td><StatusTag tone={user.status === "active" ? "success" : "neutral"}>{user.status === "active" ? "启用" : "停用"}</StatusTag></td><td><Button variant="text" onClick={() => setSelectedUserId(user.id)}>权限详情</Button></td></tr>;
        })}</tbody></table></div>
      </Card>

      {selectedUser && selectedRole && <Card className="qc-permission-detail">
        <header><div><span className="eyebrow">ROLE PERMISSIONS</span><h2>{selectedUser.name}</h2><p>{selectedUser.account} · 权限来自“{selectedRole.name}”角色</p></div><Button variant="secondary" disabled={selectedUser.status !== "active"} onClick={() => setCurrentUser(selectedUser.id)}>切换为此账号</Button></header>
        {!manageable && <div className="qc-permission-readonly-note">{PERMISSION_DENIED_MESSAGE}。当前仅可查看角色权限。</div>}
        <div className="qc-permission-account-fields">
          <label><span>角色</span><select className="qc-control" disabled={!manageable} title={!manageable ? PERMISSION_DENIED_MESSAGE : undefined} value={selectedUser.roleId} onChange={(event) => changeUserRole(event.target.value)}>{state.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <label><span>状态</span><select className="qc-control" disabled={!manageable || selectedUser.id === currentUser.id} title={!manageable ? PERMISSION_DENIED_MESSAGE : selectedUser.id === currentUser.id ? "不能停用当前登录账号" : undefined} value={selectedUser.status} onChange={(event) => changeUserStatus(event.target.value as "active" | "inactive")}><option value="active">启用</option><option value="inactive">停用</option></select></label>
        </div>
        <div className="qc-role-summary"><strong>{selectedRole.name}</strong><span>{selectedRole.permissions.length} / {PERMISSION_DEFINITIONS.length} 项权限</span><p>{selectedRole.description}</p></div>
        <div className="qc-permission-groups">{[...grouped.entries()].map(([module, permissions]) => <section key={module}><header><strong>{module}</strong><span>{permissions.filter((permission) => selectedRole.permissions.includes(permission.key)).length} / {permissions.length}</span></header>{permissions.map((permission) => <label key={permission.key} className={selectedRole.permissions.includes(permission.key) ? "checked" : ""}><input type="checkbox" disabled={!manageable || selectedRole.id === "role-admin"} title={!manageable ? PERMISSION_DENIED_MESSAGE : selectedRole.id === "role-admin" ? "管理员固定拥有全部权限" : undefined} checked={selectedRole.permissions.includes(permission.key)} onChange={(event) => togglePermission(permission.key, event.target.checked)} /><span><strong>{permission.label}</strong><small>{permission.description}</small><code>{permission.key}</code></span></label>)}</section>)}</div>
      </Card>}
    </div>
  </PageContainer></AppShell>;
}
