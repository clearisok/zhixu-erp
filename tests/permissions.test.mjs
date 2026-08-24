import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PERMISSION_STATE,
  PERMISSION_KEYS,
  permissionsForUser,
  updateRolePermissions,
  updateUserRole,
  userHasPermission,
} from "../features/permissions/model/permissions.ts";

const cloneState = () => structuredClone(DEFAULT_PERMISSION_STATE);

test("默认创建管理员、报价员和查看员三个测试账号", () => {
  const state = cloneState();
  assert.deepEqual(state.users.map((user) => user.account), ["admin", "quote.operator", "viewer"]);
  assert.deepEqual(state.roles.map((role) => role.name), ["管理员", "报价员", "查看员"]);
});

test("管理员拥有完整权限目录", () => {
  const state = cloneState();
  assert.deepEqual(new Set(permissionsForUser(state, "user-admin")), new Set(PERMISSION_KEYS));
});

test("报价员可创建和编辑报价，但不能删除或修改基础设置及用户权限", () => {
  const state = cloneState();
  for (const permission of ["quote.create", "quote.edit", "quote.revision.update", "quote.price_version.create", "quote.confirm", "quote.export", "quote.cost.view", "quote.cost.edit"]) {
    assert.equal(userHasPermission(state, "user-quote-operator", permission), true, permission);
  }
  for (const permission of ["quote.delete", "settings.brand.edit", "settings.fabric.edit", "settings.trim.edit", "settings.template.edit", "user_permissions.manage"]) {
    assert.equal(userHasPermission(state, "user-quote-operator", permission), false, permission);
  }
});

test("查看员只能查看报价、历史版本和导出，不能编辑成本", () => {
  const state = cloneState();
  for (const permission of ["quote.view", "quote.revision.view", "quote.export", "quote.cost.view"]) {
    assert.equal(userHasPermission(state, "user-viewer", permission), true, permission);
  }
  for (const permission of ["quote.create", "quote.edit", "quote.delete", "quote.confirm", "quote.cost.edit", "estimate.edit"]) {
    assert.equal(userHasPermission(state, "user-viewer", permission), false, permission);
  }
});

test("用户通过 roleId 获得权限，角色权限可集中维护", () => {
  const state = cloneState();
  const reassigned = updateUserRole(state, "user-viewer", "role-quote-operator");
  assert.equal(userHasPermission(reassigned, "user-viewer", "quote.create"), true);
  const restricted = updateRolePermissions(reassigned, "role-quote-operator", ["quote.view"]);
  assert.equal(userHasPermission(restricted, "user-viewer", "quote.view"), true);
  assert.equal(userHasPermission(restricted, "user-viewer", "quote.create"), false);
});

test("停用用户不获得任何角色权限", () => {
  const state = cloneState();
  state.users = state.users.map((user) => user.id === "user-viewer" ? { ...user, status: "inactive" } : user);
  assert.deepEqual(permissionsForUser(state, "user-viewer"), []);
});
