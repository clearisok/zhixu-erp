# 成衣来源固定诊断

本文件说明6086979私密诊断的当前实现及恢复准备；不是正式Source catalog、收集器、
HTTP业务接口或出货事件账。Num/outdate仍按D152，正式观察边界见
[Server成衣观察](SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)。

## 既有固定动作

- `garment-shipment-probe.ts`与对应Python worker：仅insideorderno contains D1933的
  首页，最多1登录+1报表、100行/4MiB/120秒，不翻页或重试。
- `garment-contract-verification.ts`与对应worker：仅原精确冻结D1933候选导出的
  C1→虚拟空C0→C1，最多1登录+3报表、每报表4MiB/累计12MiB/180秒。
  旧FROZEN的包装/raw/tooling hash及ACL核验保持，不能换入新候选。
- 二者都不连业务数据库、不绑定或激活target、不发布业务快照。原始数值文本只作为
  私密证据保存；诊断输出只给固定状态/计数/hash，不公开账号、合同、行内容或秘密。

## 当前筛查修复（2026-10-22）

两套Node/Python诊断局部共用原合同核验的严格报告筛查。合法深配置不会再次落入通用
小深度inspect；秘密键、反射密码/会话、合法编码JSON中的隐藏键/重复键会被拒绝。
组合遍历仍限64，Node严格JSON解析本身的64层上限也保持；两条拒绝路径使用各自已知
静态错误码，不伪装成同一个成功或错误类别。原始响应字符串及hash不改写。

Node probe把共享筛查异常归为原probe固定码；Python把严格JSON解析异常归一为原
`UpstreamSchemaError`固定码，并保留原失败阶段和请求计数。没有放宽全局inspect、
付款模块或旧launcher白名单。导入模块不会启动CLI、读取凭据或执行HTTP。
实际红测、32项Node/172项Python及未完成项见
[恢复任务](../tasks/active/garment-filter-recovery-2026-10-22.md)。

## 恢复准备与授权

原私密候选原路径在已核对工作树中缺失，不根据摘要重建原字节或旧hash。
恢复原文件仍须原ACL/hash校验。若采用新采样，必须作为独立身份，不能替换旧冻结记录。

建议的后续固定恢复入口将顺序复用两个原collector/validator/private writer：
先取得并严格核对本次D1933完整首页、唯一合同、见证行和账号指纹，再核验C1/C0/C1。
拟上限2登录+4报表（6HTTP）、每报表4MiB/累计16MiB、每登录另限4MiB、共享单调180秒。
CLI不得接受候选、合同或hash覆盖参数；失败/未知计数累计，保留安全落盘的新候选，不能自动重采。

**该组合入口尚未实现，也没有新的真实读取授权。** 仅本页或工程计划不构成执行许可。
须完成组合工具、合成反例和复审后，另获一次具体范围批准才能调用。旧单次许可已消费，
0HTTP失败不等于自动重试额度；过滤观察也不证明多页、稳定事件或Source可激活。
