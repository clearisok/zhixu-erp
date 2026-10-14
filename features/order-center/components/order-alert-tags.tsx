import { orderAlertDescription, orderAlertLabels, type OrderAlert } from "../server/order-alerts";
export function OrderAlertTags({alerts = []}: {alerts?: OrderAlert[]}) {
  if (!alerts.length) return <span className="oc-order-alert-empty">—</span>;
  return <div className="oc-order-alert-tags" aria-label="订单异常">{alerts.map(alert => <span key={alert.code} className="oc-order-alert-chip" data-code={alert.code} role="status" aria-label={orderAlertDescription(alert)} title={orderAlertDescription(alert)}>{orderAlertLabels[alert.code]}</span>)}</div>;
}
