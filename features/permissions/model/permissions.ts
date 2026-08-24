export const PERMISSION_KEYS = [
  "quote.view",
  "quote.create",
  "quote.edit",
  "quote.delete",
  "quote.export",
  "quote.confirm",
  "quote.revision.view",
  "quote.revision.update",
  "quote.revision.delete",
  "quote.price_version.create",
  "quote.price_version.delete",
  "quote.cost.view",
  "quote.cost.edit",
  "quote.settings.edit",
  "estimate.view",
  "estimate.edit",
  "settings.global.edit",
  "settings.brand.edit",
  "settings.salesperson.edit",
  "settings.fabric.edit",
  "settings.trim.edit",
  "settings.template.edit",
  "user_permissions.view",
  "user_permissions.manage",
  "audit_log.view",
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];
export type UserStatus = "active" | "inactive";

export type PermissionDefinition = {
  key: PermissionKey;
  module: string;
  label: string;
  description: string;
};

export type Role = {
  id: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
};

export type User = {
  id: string;
  name: string;
  account: string;
  roleId: string;
  status: UserStatus;
};

export type PermissionState = {
  schemaVersion: 1;
  currentUserId: string;
  users: User[];
  roles: Role[];
};

const define = (key: PermissionKey, module: string, label: string, description: string): PermissionDefinition => ({ key, module, label, description });

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  define("quote.view", "报价", "查看报价", "打开报价列表与报价详情"),
  define("quote.create", "报价", "创建报价", "新建一张报价"),
  define("quote.edit", "报价", "编辑报价", "修改报价基础信息与保存草稿"),
  define("quote.delete", "报价", "删除报价", "删除草稿报价"),
  define("quote.export", "报价", "导出报价", "导出单张或批量报价"),
  define("quote.confirm", "报价", "客户确认", "填写并保存客户确认结果"),
  define("quote.revision.view", "报价版本", "查看报价版本", "查看完整历史报价快照"),
  define("quote.revision.update", "报价版本", "更新报价版本", "从当前或历史快照创建新报价版本"),
  define("quote.revision.delete", "报价版本", "删除报价版本", "预留报价版本删除能力"),
  define("quote.price_version.create", "价格版本", "创建价格版本", "创建或复制并列价格版本"),
  define("quote.price_version.delete", "价格版本", "删除价格版本", "删除当前报价中的价格版本"),
  define("quote.cost.view", "报价成本", "查看报价成本", "查看面料、辅料、工价和其他费用"),
  define("quote.cost.edit", "报价成本", "编辑报价成本", "修改面料、辅料、工价和其他费用"),
  define("quote.settings.edit", "报价成本", "修改报价设置", "修改单张报价的汇率、币种和加成率"),
  define("estimate.view", "估算成本", "查看估算成本", "查看独立估算成本及历史"),
  define("estimate.edit", "估算成本", "编辑估算成本", "生成、修改或恢复估算成本"),
  define("settings.global.edit", "基础设置", "修改全局报价设置", "修改系统默认报价参数和全局费用"),
  define("settings.brand.edit", "基础设置", "修改品牌", "新增、编辑或删除品牌资料"),
  define("settings.salesperson.edit", "基础设置", "修改客户业务员", "新增、编辑、复制或删除客户业务员"),
  define("settings.fabric.edit", "基础设置", "修改面料库", "新增、编辑或删除面料库资料"),
  define("settings.trim.edit", "基础设置", "修改辅料库", "新增、编辑或删除辅料库资料"),
  define("settings.template.edit", "基础设置", "修改模板", "创建、复制、启停或设为默认模板"),
  define("user_permissions.view", "权限管理", "查看用户权限", "查看用户、角色和权限明细"),
  define("user_permissions.manage", "权限管理", "修改用户权限", "分配角色并维护角色权限"),
  define("audit_log.view", "系统审计", "查看操作日志", "查看全局追加式操作日志及修改前后内容"),
];

const operatorPermissions: PermissionKey[] = [
  "quote.view", "quote.create", "quote.edit", "quote.export", "quote.confirm",
  "quote.revision.view", "quote.revision.update", "quote.price_version.create",
  "quote.cost.view", "quote.cost.edit", "quote.settings.edit", "estimate.view",
  "user_permissions.view",
];

const viewerPermissions: PermissionKey[] = [
  "quote.view", "quote.export", "quote.revision.view", "quote.cost.view", "user_permissions.view",
];

export const DEFAULT_PERMISSION_STATE: PermissionState = {
  schemaVersion: 1,
  currentUserId: "user-admin",
  users: [
    { id: "user-admin", name: "系统管理员", account: "admin", roleId: "role-admin", status: "active" },
    { id: "user-quote-operator", name: "林青禾", account: "quote.operator", roleId: "role-quote-operator", status: "active" },
    { id: "user-viewer", name: "陈阅", account: "viewer", roleId: "role-viewer", status: "active" },
  ],
  roles: [
    { id: "role-admin", name: "管理员", description: "拥有当前权限目录中的全部权限", permissions: [...PERMISSION_KEYS] },
    { id: "role-quote-operator", name: "报价员", description: "负责报价创建、成本编辑、版本更新、确认与导出", permissions: operatorPermissions },
    { id: "role-viewer", name: "查看员", description: "只读查看报价、历史版本并导出", permissions: viewerPermissions },
  ],
};

export function permissionsForUser(state: PermissionState, userId: string): PermissionKey[] {
  const user = state.users.find((item) => item.id === userId);
  if (!user || user.status !== "active") return [];
  return state.roles.find((role) => role.id === user.roleId)?.permissions ?? [];
}

export function userHasPermission(state: PermissionState, userId: string, permission: PermissionKey): boolean {
  return permissionsForUser(state, userId).includes(permission);
}

export function updateUserRole(state: PermissionState, userId: string, roleId: string): PermissionState {
  if (!state.roles.some((role) => role.id === roleId)) return state;
  return { ...state, users: state.users.map((user) => user.id === userId ? { ...user, roleId } : user) };
}

export function updateUserStatus(state: PermissionState, userId: string, status: UserStatus): PermissionState {
  return { ...state, users: state.users.map((user) => user.id === userId ? { ...user, status } : user) };
}

export function updateRolePermissions(state: PermissionState, roleId: string, permissions: PermissionKey[]): PermissionState {
  const allowed = new Set(PERMISSION_KEYS);
  const normalized = [...new Set(permissions)].filter((permission): permission is PermissionKey => allowed.has(permission));
  return { ...state, roles: state.roles.map((role) => role.id === roleId ? { ...role, permissions: normalized } : role) };
}
