# 本机最终检查与复审

日期：2026-10-13；main anchor：`064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。
Branch：`feat/ainuoke-live-demo-readiness`；初始干净；G1 checkpoint：`87b97d73f5dd77ea8e23543b2524fb22dc5836cb`。
GitHub/代码为实时事实源；本文件按最终本机Gate记录，精确PR CI/真实执行另记，不能推定成功。更新时机：交付/复审/CI/真实回执变化时。

## 已执行检查

| 检查 | 本机结果 | 限制 |
| --- | --- | --- |
| 新预检/目标计划 | 22/22 PASS | 合成来源；实际Windows NTFS ACL/ignored/symlink保护验证；无真实源读取 |
| npm test | 817/817 PASS | 源码/领域回归，含基线负向；不是所有历史扩展UI测试 |
| test:release-baseline | 71/71 PASS | 独立源码/冻结证据保护，不做像素/真实DB/业务验收 |
| Python全套 | 69/69 PASS | 固定只读Catalog及合成网络边界 |
| test:ainuoke-server-source | 20 PASS / 1 SKIP | 一次性合成PG/session/真实Python；Linux CLI本机Windows跳过 |
| test:ainuoke-continuous | 43 PASS / 1 SKIP | 一次性合成首次绑定/新增/调度；Linux CLI需远端CI |
| typecheck / lint / server build | PASS | 最后两个TS增量另复验 |
| 默认Browser UI build | PASS | 来源/生产路由默认值不改，不部署 |
| check:release-baseline显式main | PASS，UI changed paths=0 | 新证据按旧ID保留、已存在checkpoint前向绑定 |

第一次完整回归在冻结清单尚未更新时因D113文档及新main摘要与旧证据不一致失败；完成前向证据绑定后817/817与71/71通过。未降低/删除门禁，旧SHA/PNG没有覆盖。
新增356回归的首版合成行身份未使用6087050前缀，被既有Adapter拒绝；修正测试身份后22/22通过，没有改业务算法来让测试通过。

## 合并前本机复审

当前无阻断代码发现，建议在精确远端提交三项CI成功后合并本工程PR；当前不自动合并。

- CLI必须显式source-only参数、匿名stdin配置、committed clean工作树；同一固定collector/preview/projection，不调用DB Pool/迁移/绑定/调度写命令。配置UTF8严格解码，错误输出封闭，不反射秘密或业务字段。
- 完整当前账号全集，不依赖历史558/80/62常数；全部BillNo/当前InsideOrderNo可信查询。前后及跨阶段Discovery完整事实比较，丢失/身份变化/漏页/未来/陈旧/预算/非法字段拒绝；仅当完整两阶段成功才collectionValidation=complete。
- 每worker沿用600秒/100000行/32MiB、200页/50行，包数据与阶段耗时双检查。时效是在每阶段结束核实，首绑必须重新读取；Discovery一致不是跨报告事务一致性。
- 采购/理论需求/四流保持独立事实；356重复来源仍一事件；单位未知与冲突、未知数量保留，缺颜色作为enrichment不删主订单。公开只有计数/哈希，不泄漏单号/物料/价格。
- 本机报告只能到新owner-only且ignored路径，Node重新检查Windows ACL，写入前检查文件；拒绝junction/symlink/宽权限/输出根或仓库其他目录，凭据字段不能写入报告。报告SHA256匹配字节。
- `demo-plan`仅纯计划输出，阻止旧环境名称/端口/非精确SHA/digest格式；不验证真实资源归属、image元数据或空闲端口，也没有启动器。这些是后续执行前待工程化的运行时阻断，不能把plan PASS当成隔离已完成。
- 无app/components/features/SQL/生产配置/默认flags变化；完整旧状态原文按原main归档。新capabilities区分merged、humanAcceptance、sourceActivation和历史环境。

## 交付与未执行事项

G1安全交付返回`LOCAL_PASS_REMOTE_UNVERIFIED`、pushes=1、pushCategory=timeout、NETWORK_DEGRADED、remoteStatus=REMOTE_UNVERIFIED；没有重复推送，未关闭TLS或更改共享代理/认证。最终精确SHA交付及唯一PR/CI待核实；本机PASS不等于REMOTE DELIVERY PASS。
没有读取真实凭据文件、没有执行全量真实预检、没有初始化/绑定/持续写入新演示库、没有修改真实账号/业务DB，也未部署宁波/18443/18444。本机Docker测试只操作各测试创建的一次性合成容器。
下一最少动作：交付恢复后核实唯一PR与CI；用户私密运行完整无DB预检，助手核对脱敏JSON/受保护私有报告；再准备具体新隔离目标并获得首次真实持久展示的执行授权。
