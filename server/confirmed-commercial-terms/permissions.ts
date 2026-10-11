import type { TrustedIdentity } from "../auth/session.js";
import { requirePermission } from "../auth/permissions.js";

export function requireCommercialEdit(actor: TrustedIdentity, field: "sale" | "labor"): void {
  requirePermission(actor.permissions, `commercial.${field}.view`);
  requirePermission(actor.permissions, `commercial.${field}.edit`);
}
