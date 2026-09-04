import type { ReactNode } from "react";
import { FloatingMenu } from "./floating-menu";

export function MasterDataActions({ primary, children, label = "更多操作" }: {
  primary: ReactNode;
  children?: ReactNode;
  label?: string;
}) {
  return <div className="qc-master-actions">
    {primary}
    {children && <FloatingMenu className="qc-master-more" menuClassName="qc-master-more-menu" label={label}>{children}</FloatingMenu>}
  </div>;
}
