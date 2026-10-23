# Gate7A：成衣出货观察工程冻结证据

2026-10-21；root唯一writer，既有server_convergence_review独立只读。范围为D-147批准Goal中的观察基础，遵守D-152 Num/outdate与D-153。不是正式来源激活、出货事件账、完整ERP闭环或Server关账。

## 精确基线和源码

| 项目 | 本次事实 |
| --- | --- |
| Repository/main | clearisok/zhixu-erp / 996dfedc12da3527343cd3ff2aa5eea35497e10e，本轮独立GitHub API核实 |
| 输入 | codex/server-material-arrival-ui / e4d7a8dd6f6bd3c409747ab44b71823422cfb8d1，干净 |
| 本分支 | codex/server-garment-shipment-observations，从该main新建再仅FF到完整输入 |
| 基线checkpoint | 49bb0d75；三份原根文档逐字节归档在2026-10-21-garment-shipment-inputs/e4d7a8dd/ |
| 应用checkpoint | b6521d0d510ca0447822096e101919c97f76a980 |
| 实际构建源码 | 99c52a526f59253d9da124c3bb9b54f077b6c115；相对b652只增加决策冻结登记，应用/SQL/工具/测试字节一致 |
| Production build | 20261021-222838 / 2026-10-21T22:28:38+08:00；完整99c52a52 SHA |

构建明确server Quote/master、session、writable及orderRead=snapshot；没有打开新成衣读取开关。前端及Node构建顺序执行且exit0；compiled模块导入和精确十进制投影smoke通过。此smoke不涉及DB/真实Source，也不是实际用户浏览器验收。

## 已实现且验证的边界

1. 独立0040四张空表，默认关闭的per-order target及明确时效策略，没有seed、自动回填或激活命令。复用已有可信合同、有效归属、稳定颜色和原审计，不新建订单、事件账或价格系统。
2. 离线Python原文hash/报表/页数/重复键/精确数字提取；Node内部两遍完整checked-page契约：最多20页/2000行/100每页、16MiB输入、180秒捕获窗。该工程预算不是新增真实请求额度；固定contains首页工具不能冒充完整输入。
3. Num与outdate分别投影本笔数量及业务日期。零、负、未知、无效分别保留；不猜冲销、不以其他日期补outdate；其他累计列/单位/日期各自保存。没有数量合计或跨次累计；空观察不是取消/清零。
4. 发布重新锁定当前user/role/grant、Source profile及全部物理SO成员；冻结当时sourceOwner/link/归属/订单版本/颜色依据。sourceOwner与effectiveSO不同的并发刷新已测试。颜色数量变化不换身份，重名/改名/缺失保持歧义；复合FK阻止跨单颜色注入，旧快照不被当前镜像重映射。
5. 每目标CAS、不可变快照/颜色、head及事务审计。并发同捕获只生成一代；COMMIT回执丢失可核原结果；过180秒且head前进后仍返回原回执，不重建。全新过期捕获不能发布。
6. 发布前按紧凑JSON及实际PostgreSQL jsonb::text分别限量，input/payload16MiB、basis512KiB、scope/context8KiB。超限422且任何颜色注册/快照/head/审计不写入。大合法捕获历史查询只读标量摘要，不加载26份整包。
7. session-only、no-store的DB-only当前/历史/详情GET，独立disabled开关，没有HTTP writer、凭据或Browser回退。读需当前order.view+ainuoke.view；内部发布再需ainuoke.sync，不借物料导入权限。加工仅真实批次识别为not_applicable；伪类型标签不能代替可信业务身份。
8. 旧/部分schema fail closed；所有新增SO/来源SO/颜色子行引用进入原归一指纹，仍保留外部生产/财务coverage unavailable。0039非空合成升级逐个原public表比较to_jsonb(row)::text，所有原业务行序列化内容不变；不声称物理数据库文件字节不变。

wxprice、来源备注及联系人不进入普通DTO、历史摘要或操作日志。内部checked input是受控DB证据，不整体暴露客户端。未写生产完成、商业版本、报价CCT、关账、收入或付款。

## 本次实际检查

| 检查 | 本次结果 |
| --- | --- |
| 新观察纯契约+实际PG/HTTP+0039升级 | 41/41，21972.6498ms；directed-fourth.log |
| 相关Source/绑定/归属/归一/财务/到仓回归 | 124通过、0失败、1跳过，107182.3115ms；related-regressions.log |
| 项目测试 | 927/927，205543.7044ms；project.log |
| Python完整套件 | 146/146，2.048s |
| TypeScript / 全源码lint | exit0；typecheck-final.log / lint-final.log |
| Production frontend / Node build | 顺序exit0；build-client.log / build-node.log |
| 编译模块导入与精确投影 | PASS，source99c52；compiled-smoke.json |
| 前置精确main守卫 | b652时PASS，11页/52能力/76累计UI路径/errors空；pre-guard.log |

唯一跳过为既有Windows不执行的“Linux CLI check”；Python实际合成loopback子进程仍通过。没有把跳过项写为PASS。全部日志位于ignored outputs/garment-shipment-gate7a/，不上传原始业务或私密材料。

最终新增能力冻结登记后的发布套件、精确HEAD守卫和远端交付在后续回执/当前接力单列；本报告不提前声称它们通过。此时本领域LOCAL DOMAIN ENGINEERING PASS，正式发布门禁尚待收口。

## 失败与复审纠正

- 首次纯契约19/21：两处错误优先级的测试期望不符；同时unknown数组收窄导致types失败。修正测试期望/类型后21/21，未放宽验证。
- 首轮PG2/12：合成启用UPDATE漏WHERE，unused参数触发42P18，目标未启用导致后续依赖失败。仅修测试fixture；后续12/12，再扩16、40、41项，旧日志保留。
- reviewer发现捕获180秒检查抢先拒绝已成功原回执：分离restore/原上下文核对和新发布时效，新增丢回执、晚核对、head前进、上下文篡改及过期新捕获测试。
- reviewer发现历史摘要一次取26份整包及紧凑JSON/JSONB实际容量不一致：改不可变row_count及标量查询，写前双层容量校验；1000行约8MiB合法输入与2000行输入合规但投影超限负测通过。
- exact b652独立只读复审无剩余阻断；reviewer核到实际41项日志，没有代跑测试、DB、网络或阅读私密原文。

## 真实来源、运行与界面边界

D1933/D1935两次单次真实许可均已用完；本阶段0新增真实艾诺科请求、凭据读取、真实Source绑定/激活/调度、真实账号或业务库操作。仅使用新随机一次性合成PG，正常测试结束移除自己容器；原10月19日旧容器不清理。

保护3001/50426/59069/62426、18443/18444、旧卷/Browser与其他工作树。没有启动、停止或升级这些环境；62426保留上轮连接未成功的未验证状态，不冒称当前READY。

本阶段无新UI路径/像素变更、截图或浏览器验收；76路径是此前main之后累计变更，本轮不重写其原影响记录或截图。尚无成衣页面或正式收集器，不能让用户把接口基础误当作可完整体验的出货模块。

## Git与后续

本轮readonly诊断default/HTTP1.1/OpenSSL-HTTP1.1均exit0，分别4998/3094/3886ms；main均996，未改任何配置。当前仍Schannel/HTTP1.1，已有Git代理仅记存在，不读取输出配置值或凭据。

一次不上传的push dry-run对干净99c52/本分支返回exit0，2667ms，远端此前无此分支；actualPushes=0、configurationChanged=false、rawOutputPersisted=false。这是当前认证/创建ref预演证据，不是已送达或永久网络修复。旧664f非零authentication_or_divergence具体原因仍unresolved，没有普通PowerShell差异对照，不改旧记录；新证据仅支持最终验收后按既有工具有界尝试一次本分支交付。

本冻结时没有新push/PR/Hosted CI/合并/关闭/部署。后续交付须精确核远端SHA，草稿PR明确本分支继承此前未合并收敛工程，不当作独立小差异直接合并。

剩余：正式精确合同过滤核验、受控收集器/失败与回执、页面、跨次事件ID/取消冲销；Server关账的三项重大选择仍待用户回复；环境收敛、main整合和用户验收继续各自Gate。完整Goal active，不能以本切片完成而标complete。
