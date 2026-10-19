# D143 两合同固定预算采集：工程冻结证据

核实2026-10-16；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。GitHub是实时事实源，本文件只冻结当前工程证据；后续变化新建文件/ID，不覆盖旧证据。

## 源码和范围

- 同一ainuoke-live-readiness树，feat/ainuoke-selected-source-once；clean parent PR115@db4236cf63839e4f384ad042e1ac21ad42fd01f1，原ref不改。
- 核心e36972c4751d8ce728184119eaf6f9b37964a3e0；最终源码/实际父进程测试8d6725b23123f08fb85c1c888b33792366df122c。两checkpoint均一次安全push＋独立GitHub API核实；最终文档提交另核，不冒称已创建新PR。
- 新内部模式只包住原SDK/Catalog/server_source，不增加HTTP、CLI、调度或DB writer。Node验证后继续原previewSelectedBindings/validateBundle；持久化仍用原bindOrders/captureSource事务。
- 固定2合同；1登录/80report/81HTTP/180秒，0网络重试/认证续期；50行/页、20页/1000行/报告、合计4000来源行、4MiB单响应、32MiB worker序列化输出。不是最大可见业务规模或吞吐承诺。

## 实际验证

| 检查 | 已取得的结果 |
|---|---|
| 新Node/实际Python父子进程/一次性PG | 12/12；selected-source-parent-process-20261016.log |
| Python全套 | 130/130（16新增）；selected-source-python-final-20261016.log |
| 原continuous回归 | 70PASS/1既有Windows条件SKIP/0FAIL；selected-source-continuous-20261016.log；Linux场景留Hosted CI |
| 类型/Server编译/完整源码lint | PASS；type-context-fixed/server-build/lint-full日志。新一次性归档触发类型错误后已移出源码glob，未放松检查 |
| Server/session/snapshot镜像 | clean源码8d6725b2，buildId selected-source-20261016-8d6725b2；镜像 sha256:88ddc8a4aa5a847dd02cc58ab808c4b80f78a81f28a557b2e615b3a55e2f3958 |
| 镜像实际只读核验 | 无网络、read-only的一次性检查容器读build-info，精确源码/build/authority一致；新Python worker和编译Node入口存在；未启动app或DB |
| root/94基线/精确守卫/新PR CI | 本报告冻结后执行，最终结果另记活动任务/PR，当前不预报PASS |

计数测试验证整个上界80report/81HTTP/4000行；网络失败、认证失效、分页/总数、deadline、超响应、错误endpoint/query、伪计数/范围、秘密值回显等均停止。失败输出不包含部分业务bundle。子进程被杀/无JSON时不能声称已知0请求，需人工核回执，不自动重采。

6087105使用contains，逐行精确BillNo防止其他合同混入；6087050逐行ExpContractNo和Discovery InsideOrderNo验证。2次并发接纳仅两SO；错review零写入、错账号零快照；原reader能读采购/入库/物料出运/出库。理论115.50和采购118保留、单位空/数量未知不补默认，num_dyc不并入rknum；无报价或财务目标/快照写入。

失败保留：首轮错preview结构/顺序/表名和旧MAX_BYTES测试默认时机已修；首次root888PASS/10FAIL来自D143决策叶尚未绑定，必须前向补新证据而不是覆盖旧hash。工具自建archive放在outputs造成归档worker/D1类型错误；原目录完整移至已核绝对TEMP，类型重跑通过；未改变tsconfig或业务代码来掩盖。

## 事实、用户决定与未验证项

- 用户决定：既有D121订单身份、独立商业版本、加工批次及来源规则保持；本阶段没有新的业务规则决定。
- 已确认：只完成合成/一次性PG、构建和隔离镜像读元数据；本Phase真实请求0、凭据文件读取0、真实DB写入0。
- 建议：[下一次具体演示范围](../../ainuoke-selected-demo-execution-proposal.md)，只提议新实例及S1/S2。资源名与62316/62317端口本时点可用，执行前须重核；没有预留或启动。
- 待授权/未验证：真实首次接纳、Source profile/两财务目标启用、新刷新与持久化、整套人工业务验收。历史12/9行过滤证明不是新快照、整体单位/币种映射或银行实付确认。旧四单窗口不续。
- 不触现有演示、真实账号/业务库、宁波、18443/18444；不自动合并或部署。到main是累计依赖，不能据单轮CI直接合并。

更新时机：源码、权限、字段、真实范围授权、构建/CI、运行环境或人工验收变化时前向追加。
