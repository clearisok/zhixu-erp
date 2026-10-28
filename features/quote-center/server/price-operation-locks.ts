/** Presence, not JSON parsing: a damaged original must still block a second
 * price workflow. This never reads prices or deletes recovery records. */
export function priceOperationLocks(storage: Pick<Storage, 'getItem'>, userId: string) {
  try { return { sale: storage.getItem('zhixu.server.order-price.pending.v1.' + userId) !== null,
    labor: storage.getItem('zhixu.server.usd-labor.pending.v1.' + userId) !== null, unavailable: false }; }
  catch { return { sale: true, labor: true, unavailable: true }; }
}
