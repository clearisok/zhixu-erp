declare const __ZHIXU_BUILD_INFO__: {orderRead?:string};
export function parseOrderRead(value?:string):"disabled"|"snapshot" {
  if(value===undefined||value===""||value==="disabled")return "disabled";
  if(value==="snapshot")return "snapshot";
  throw new Error("invalid_order_read_capability");
}
export function orderReadEnabled():boolean {
  return parseOrderRead(typeof __ZHIXU_BUILD_INFO__!=="undefined"?__ZHIXU_BUILD_INFO__.orderRead:process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ)==="snapshot";
}
export function isOrderReadRoute(path:string):boolean {
  return ["/order-center","/order-center/server-detail","/order-center/style-progress/detail"].includes(path);
}
