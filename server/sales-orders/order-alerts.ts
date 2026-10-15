import type { TrustedIdentity } from "../auth/session.js";
import type { SalesOrderReadModel } from "./model.js";
import { createOrderMaterialReader, type MaterialReadPorts } from "../../features/ainuoke-material-progress/read-service.js";
import type { OrderAlert } from "../../features/order-center/server/order-alerts.js";
/** Read-only, page bounded, four workers; never performs a live upstream request or returns material/cost facts. */
export async function attachOrderAlerts(items: SalesOrderReadModel[], identity: TrustedIdentity, ports?: MaterialReadPorts): Promise<SalesOrderReadModel[]> {
  const result = items.map(item => ({...item, alerts:[...(item.alerts ?? [])]}));
  if (!identity.permissions.includes("style_progress.read") || !identity.permissions.includes("ainuoke.view")) return result;
  const candidates = result.filter(item => item.businessType === "ainuoke_contract" && !item.attribution?.historicalDuplicate);
  if (!candidates.length) return result;
  let reader: ReturnType<typeof createOrderMaterialReader> | null = null;
  try { if (ports) reader=createOrderMaterialReader(ports.prepareBatch ? await ports.prepareBatch(identity,candidates.map(item=>item.id)) : ports); } catch { /* scoped source failure remains an explicit reminder */ }
  let index=0;
  await Promise.all(Array.from({length:Math.min(4,candidates.length)},async()=>{
    while(index<candidates.length){const item=candidates[index++];const alerts: OrderAlert[]=item.alerts;
      const value=reader ? await reader(identity,{salesOrderId:item.id}) : null;
      if (!value || value.status!==200 || value.body.progress.sourceStatus!=="ready") {
        alerts.push({code:value?.status===200 && value.body.progress.sourceStatus==="stale" ? "material_source_stale" : "material_source_unavailable"}); continue;
      }
      const rows=value.body.progress.rows;
      const missing=rows.filter(row=>row.unitStatus==='missing').length, conflict=rows.filter(row=>row.unitStatus==='conflict').length;
      if(missing)alerts.push({code:'material_unit_missing',count:missing});
      if(conflict)alerts.push({code:'material_unit_conflict',count:conflict});
    }
  }));
  return result;
}
