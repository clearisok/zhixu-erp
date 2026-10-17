import { PERMISSION_KEYS, type PermissionKey } from "../../features/permissions/model/permissions.js";

const shared: PermissionKey[] = ["quote.view", "quote.revision.view", "order.view", "ainuoke.view", "style_progress.read", "style_progress.view_history"];
const moneyRead: PermissionKey[] = ["quote.cost.view", "estimate.view", "commercial.sale.view", "commercial.labor.view"];
export const TEAM_ROLES = [
  { id: "role-server-admin", name: "系统管理员", description: "账号、权限、运维及全部现有权限", permissions: [...PERMISSION_KEYS] },
  { id: "role-team-manager", name: "管理者", description: "业务及金额只读、导出与审计", permissions: [...shared, ...moneyRead, "quote.export", "audit_log.view"] },
  { id: "role-team-quote-manager", name: "报价经理", description: "报价、成本、参数、确认、附件与导出", permissions: [...shared, ...moneyRead, "quote.create", "quote.edit", "quote.export", "quote.confirm", "quote.order_price.adjust", "quote.revision.update", "quote.price_version.create", "quote.price_version.delete", "quote.cost.edit", "quote.settings.edit", "commercial.sale.edit", "commercial.labor.edit", "estimate.edit", "settings.global.edit", "settings.brand.edit", "settings.salesperson.edit", "settings.fabric.edit", "settings.trim.edit"] },
  { id: "role-team-material-manager", name: "物控经理", description: "订单、物料与来源采购只读；维护团队辅料排列", permissions: [...shared, "style_progress.settings.edit"] },
  { id: "role-team-production-manager", name: "生产经理", description: "订单、物料与确认工价只读；排产写入另行开放", permissions: [...shared, "commercial.labor.view"] },
  { id: "role-team-finance-manager", name: "财务经理", description: "业务与金额只读、导出；关账写入另行开放", permissions: [...shared, ...moneyRead, "quote.export", "audit_log.view"] },
  { id: "role-team-merchandising-manager", name: "跟单经理", description: "维护订单业务来源及采用确认条件；不修改报价确认金额", permissions: [...shared, "order.claim", "order.lineage.edit", "order.preparation.create", "order.commercial.adopt", "commercial.sale.view", "commercial.labor.view"] },
] satisfies { id: string; name: string; description: string; permissions: PermissionKey[] }[];

export const TEAM_ROLE_IDS = TEAM_ROLES.map(role => role.id);
