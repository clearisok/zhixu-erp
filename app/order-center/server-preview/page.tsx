import { ServerSalesOrderPreviewPage } from "@/features/order-center/components/server-sales-order-preview-page";

export default function Page() {
  if (process.env.NODE_ENV !== "development") return null;
  return <ServerSalesOrderPreviewPage />;
}
