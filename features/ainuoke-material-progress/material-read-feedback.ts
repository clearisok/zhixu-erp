// Display only: classify the existing read client's bounded errors; never expose raw errors.
export function materialReadFeedback(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const status = /^物料来源未接通或没有权限（HTTP (\d{3})）$/u.exec(message)?.[1];
  if (status === '401') return '登录已过期，请重新登录后读取物料。';
  if (status === '403') return '没有物料查看权限，请联系管理员。';
  if (status === '503') return '物料读取服务暂不可用；来源是否就绪尚未核实。';
  if (status) return '物料来源读取失败（HTTP ' + status + '），请重新读取或联系管理员核对。';
  if (message === 'invalid_order_uuid') return '订单标识无效，请返回订单列表重新打开。';
  if (message === '物料响应关联无效') return '物料响应与当前订单不符，已停止展示；请联系管理员核对。';
  if (error instanceof TypeError && ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'].includes(message)) return '网络连接失败，未取得物料来源；请检查网络后重新读取。';
  return '物料读取失败，原因尚未核实；请重新读取或联系管理员。';
}
export function materialReadTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '来源时间无效，待核实';
  return date.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false});
}
