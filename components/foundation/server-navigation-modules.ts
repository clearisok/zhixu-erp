import { createNavigationModuleLoader } from "./navigation-module-loader";

// Importing these client modules does not mount them. The route still owns
// authentication, data reads and navigation/unsaved-command protection.
export const preloadServerNavigationModule = createNavigationModuleLoader({
  ...Object.fromEntries(["brands", "customer-salespeople", "fabrics", "trims"].map(scope => [`/basic-settings/${scope}`, () => import("@/features/basic-settings/components/production-master-settings-page")])),
  "/quote-center": () => import("@/features/quote-center/components/production-quote-list-page"),
  "/order-center": () => import("@/features/order-center/components/server-order-center-page"),
  "/system-settings/progress-settings": () => import("@/features/style-progress/components/material-progress-settings-page"),
  "/system-settings/quote-settings": () => import("@/features/basic-settings/components/production-master-settings-page"),
  "/system-settings/production-infrastructure": () => import("@/features/operations-settings/components/production-resource-settings-page"),
  "/system-settings/roles": () => import("@/features/permissions/components/server-role-page"),
  "/system-settings/users": () => import("@/features/permissions/components/server-user-permission-page"),
  "/system-settings/operation-logs": () => import("@/features/operation-logs/components/global-operation-log-page"),
});
