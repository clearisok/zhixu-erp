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

新`garment-filter-recovery.ts`顺序复用两个原collector/validator/private writer：先取得并严格
核对本次D1933完整首页、唯一合同、见证行和账号指纹；按原writer精确序列化预校验，保存后
以实际返回hash受保护读回、再次核对，才核验C1/C0/C1。它不调用旧readFrozen入口、不改旧常量，
新采样始终有自己的包装/raw/tooling身份。候选为空、超过100行、不完整、多合同、重复/不合法
见证或含秘密时停止，不选择第一合同或自动改查询。同步写入/读回失败也不启动第二段。

上限2登录+4报表（6HTTP）、每报表4MiB/报表累计16MiB、每登录另限4MiB；不是把retainedBytes
当网络总字节。共享单调180秒含本地检查/写入/读回，两worker只得到剩余预算，失败不重试/翻页。
两段计数分别为not-started/exact/unknown-worker-result；未知第二段保留第一段已知下限，
不报告总0。后段失败仍保留第一份候选；安全的失败filter由原validator处理、可私密留证。

CLI只有固定`--recover-d1933-contract-filter`、凭据文件和私密输出路径；不接受候选、合同、
报表、页号或hash覆盖。精确数值runtime、干净提交及ignored私密目录检查先于一次凭据读取；
两worker用同一不可变配置。不同于旧冻结入口，它必须先读取凭据才能生产本次候选，不能把
“新候选检查在凭据前完成”作为保证。Python原队列、请求校验和失败静态码保持。

Windows launcher只传文件路径，不读取密码；创建新的owner/System私密目录，自己从启动计时
180秒并在超时终止进程树。最多3个安全阶段JSON帧加1终态；只有完整换行帧可用于收尾。
外层终止时按最后安全帧保留已知计数与文件，尚未取得终态的not-started降为unknown，避免
从旧帧断言后续从未请求。收尾只核对本机回执/阶段计数、文件范围、ACL和实际hash，不继续
Source操作；stderr不公开。已有11项合成测试覆盖实际私密writer、Windows凭据/dirty检查；
独立审查要求新增的真实180秒合成进程树超时用例及最终结果见任务，不将准备代码冒称PASS。

**工程入口已实现，但没有新的真实读取授权。** 只有具体范围批准后才能调用；旧单次许可
已消费，0HTTP失败不等于自动重试额度。该工具不访问业务库/target，不绑定、激活、调度或
生成业务快照；过滤观察也不证明多页、稳定事件、取消语义或全合同Source可激活。
