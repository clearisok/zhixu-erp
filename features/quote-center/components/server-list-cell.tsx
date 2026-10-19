import type { QuoteServerListItem } from "../server/quote-server-client";
import { businessColumns, type BusinessColumn } from "../model/quote-business-view";
import { ServerListThumbnail } from "./server-list-thumbnail";
import type { ListImageLoader } from "../server/list-image-loader";

const labels = (fields: BusinessColumn[]) => fields.map(key => businessColumns.find(item => item.key === key)!.label).join(" / ");
export function serverListHeader(fields: BusinessColumn[]) {
  if (fields.length === 1) return fields[0] === "styleIdentity" ? "款号 / 款式名称" : labels(fields);
  if (fields.every(key => ["fabricCost", "trimCost", "labor"].includes(key))) return "成本摘要";
  if (fields.every(key => ["revision", "versions"].includes(key))) return "报价历史 / 价格方案";
  if (fields.every(key => ["garmentPrice", "confirmationStatus"].includes(key))) return "成衣价 / 客户确认";
  if (fields.every(key => ["brand", "salesperson"].includes(key))) return "品牌 / 业务员";
  if (fields.every(key => ["type", "status"].includes(key))) return "类型 / 状态";
  return labels(fields);
}
export function ServerListCell({ fields:requestedFields, row, imageLoader }: { fields: BusinessColumn[]; row: QuoteServerListItem; imageLoader?: ListImageLoader }) {
  const fields=row.summary?.quoteType==='processing'?requestedFields.filter(key=>!['fabricCost','trimCost','garmentPrice','confirmedGarment'].includes(key)):requestedFields;

  if (fields.length === 1 && fields[0] === "styleImage") return <ServerListThumbnail row={row} loader={imageLoader} />;
  if (fields.length === 1 && fields[0] === "styleIdentity") return <div className="qc-primary-cell"><strong title={row.summary?.quoteStyleNo}>{row.summary?.quoteStyleNo || "—"}</strong><small title={row.summary?.styleName}>{row.summary?.styleName || "未填写款式名称"}</small></div>;
  if(!fields.length)return <span>不适用</span>;
  const sourceTitle = fields.includes("confirmationStatus") ? row.confirmationSources?.map(source => `${source.priceVersionId}: ${source.linkage}${source.termsVersion === null ? "" : ` / CCT v${source.termsVersion}`}`).join("；") : undefined;
  const prefix: Partial<Record<BusinessColumn, string>> = { fabricCost: "面 ", trimCost: "辅 ", labor: "工 " };
  if (fields.length > 1 && fields.every(key => key in prefix)) {
    const values = fields.map(key => `${prefix[key]}${row.business?.[key]?.display ?? "—"}`);
    return <div className="qc-primary-cell"><strong title={values[0]}>{values[0]}</strong><small title={values.slice(1).join(" · ")}>{values.slice(1).join(" · ")}</small></div>;
  }
  return <div className="qc-primary-cell" title={sourceTitle}>{fields.map((key, index) => {
    const value = row.business?.[key]?.display ?? "—";
    const content = <>{fields.length > 1 ? prefix[key] : ""}{value}{key === "versions" ? " 个" : ""}</>;
    return index === 0 ? <strong key={key} className={key === "revision" ? "qc-revision-chip" : undefined}>{content}</strong> : <small key={key}>{content}</small>;
  })}</div>;
}
