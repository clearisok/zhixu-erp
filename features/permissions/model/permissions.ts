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
  "order.view",
  "order.create",
  "order.edit",
  "order.cancel",
  "schedule.view",
  "schedule.create",
  "schedule.edit",
  "schedule.complete",
  "closing.view",
  "closing.edit",
  "closing.confirm",
  "closing.lock",
  "closing.reopen",
  "closing.target.manage",
  "settings.global.edit",
  "settings.brand.edit",
  "settings.salesperson.edit",
  "settings.fabric.edit",
  "settings.trim.edit",
  "settings.template.edit",
  "settings.production_group.edit",
  "settings.outsource_factory.edit",
  "settings.production_infrastructure.edit",
  "settings.closing.edit",
  "user_permissions.view",
  "user_permissions.manage",
  "audit_log.view",
  "ainuoke.view",
  "ainuoke.sync",
  "ainuoke.bind",
  "ainuoke.resolve_conflict",
  "settings.brand_alias.edit",
  "settings.purchased_trim_cost.edit",
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
  define("order.view", "订单", "查看订单", "查看订单列表与订单详情"),
  define("order.create", "订单", "创建订单", "创建手工、报价来源或翻单订单"),
  define("order.edit", "订单", "编辑订单", "修改订单执行与商务资料"),
  define("order.cancel", "订单", "取消订单", "执行订单部分或全部取消"),
  define("schedule.view", "排单", "查看排单", "查看生产计划与排单执行情况"),
  define("schedule.create", "排单", "创建排单", "创建订单的内部或外发排单"),
  define("schedule.edit", "排单", "编辑排单", "修改生产组、外发厂、数量或日期"),
  define("schedule.complete", "排单", "完成生产", "更新实际完成数量并标记完成"),
  define("closing.view", "关账", "查看关账", "查看关账月份、归属和产值"),
  define("closing.edit", "关账", "编辑关账", "新增或调整未锁定关账归属"),
  define("closing.confirm", "关账", "确认关账", "确认关账月份"),
  define("closing.lock", "关账", "锁定月份", "锁定已确认关账月份"),
  define("closing.reopen", "关账", "重新打开月份", "填写原因后重新打开已锁定月份"),
  define("closing.target.manage", "关账", "管理月度目标", "维护月度总加工与内部加工产值目标"),
  define("settings.global.edit", "基础设置", "修改全局报价设置", "修改系统默认报价参数和全局费用"),
  define("settings.brand.edit", "基础设置", "修改品牌", "新增、编辑或删除品牌资料"),
  define("settings.salesperson.edit", "基础设置", "修改客户业务员", "新增、编辑、复制或删除客户业务员"),
  define("settings.fabric.edit", "基础设置", "修改面料库", "新增、编辑或删除面料库资料"),
  define("settings.trim.edit", "基础设置", "修改辅料库", "新增、编辑或删除辅料库资料"),
  define("settings.template.edit", "基础设置", "修改模板", "创建、复制、启停或设为默认模板"),
  define("settings.production_group.edit", "生产基础资料", "编辑生产组", "新增、编辑、排序或启停生产组"),
  define("settings.outsource_factory.edit", "生产基础资料", "编辑外发厂", "新增、编辑或启停外发厂"),
  define("settings.production_infrastructure.edit", "生产基础资料", "编辑生产与运输设置", "维护生产地点、日历、供应枢纽、路线与运输方式"),
  define("settings.closing.edit", "生产基础资料", "编辑关账设置", "维护默认税率等关账基础规则"),
  define("user_permissions.view", "权限管理", "查看用户权限", "查看用户、角色和权限明细"),
  define("user_permissions.manage", "权限管理", "修改用户权限", "分配角色并维护角色权限"),
  define("audit_log.view", "系统审计", "查看操作日志", "查看全局追加式操作日志及修改前后内容"),
  define("ainuoke.view", "艾诺科同步", "查看艾诺科同步", "查看销售合同镜像、同步状态和异常"),
  define("ainuoke.sync", "艾诺科同步", "执行艾诺科同步", "上传并同步销售合同与成衣分色文件"),
  define("ainuoke.bind", "艾诺科同步", "绑定销售合同", "将艾诺科销售合同绑定到织序订单"),
  define("ainuoke.resolve_conflict", "艾诺科同步", "处理同步冲突", "处理重复候选、分色差异与同步变更"),
  define("settings.brand_alias.edit", "基础设置", "管理品牌别名", "维护艾诺科品牌名称到织序品牌的映射"),
  define("settings.purchased_trim_cost.edit", "基础设置", "管理代购辅料成本", "维护带生效日期的品牌代购辅料成本规则"),
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
