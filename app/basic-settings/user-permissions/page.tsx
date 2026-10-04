import { UserPermissionPage } from "@/features/permissions/components/user-permission-page";
import { browserIdentityMode } from "@/features/server-auth/identity-mode";
import { AppShell, PageContainer } from "@/components/foundation";

export default function Page() {
  if (browserIdentityMode() === "local-single-user") {
    return <AppShell title="本地单用户模式"><PageContainer><p>当前开发阶段不提供账号或权限管理。Server 业务权限边界仍保留。</p></PageContainer></AppShell>;
  }
  return <UserPermissionPage />;
}
