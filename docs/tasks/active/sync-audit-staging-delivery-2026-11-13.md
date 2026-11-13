# 同步审计远端交付与staging发布（进行中）

用户2026-11-13明确授权：修复Git→检查Open PR→必要检查/审查→合并→0058→staging→至少两个自然目录周期验收。禁止production；不制作本机演示，不主动全量补采，不直接SQL清暂停。起点分支feat/ainuoke-sync-audit、8a2341d95394e9989f11835840fdd66b2092c8df，工作树干净；main基线c5133e9e9e7065dc4fe7672c0c88c75688e0c51f。之前本机工程见ainuoke-sync-audit-2026-11-12.md。

## Git及PR现状

Git失败已定位为用户配置中的GitHub专用代理http.https://github.com.proxy指向127.0.0.1:17989，端口无监听；默认Git约2–4秒连接失败，API正常。普通http.proxy空覆盖不能覆盖此URL作用域。仅本次进程GIT_CONFIG_COUNT覆盖该精确键为空后，标准Git直连读取main完整SHA成功；系统/用户/仓库持久网络、认证、密钥与TLS配置未改。

同一进程覆盖下仓库标准git-delivery工具实际push一次，5480ms成功，独立GitHub API精确核实8a2341d9，DELIVERED_VERIFIED、networkMode=NORMAL。这是本次传输结果，不宣称所有网络永久正常。

全部Open PR仅#136（fix/git-delivery-upload-budget→main），Draft/CONFLICTING，2026-10-30创建，三项历史CI成功；涉及Git上传预算及旧交接文档，无0058/同步审计/物料或系统设置产品修改。非本次必需依赖，保持原状，不合并/关闭/删除。新候选PR创建前再次核对唯一性。production工作流只workflow_dispatch，本次不触发。

## hsid业务复审

公司IT由用户明确确认hsid为结算单ID；“非合同身份字段”不等于没有业务意义。既有知识库D:/workspace/zhixu-ainuoke-knowledge在3ce658027e645132c8f59ac0caaa1de58d2e326f保存D1935销售合同样本hsid与6087038核算分析行id相同的历史观察；这不证明结算单再生成/删除重建的规则。本轮不扩展新财务接口，不用新查询冒充11/11遗失差异。

候选没有忽略hsid参与的内容比较：变化中的两遍仍拒绝；稳定重新采集后原始值保存在不可变catalog evidence/chunks，经新run和entries.observed_run_id可定位当前关联，原run保留。源逻辑hash和逐表审计记录更新。销售合同BillNo/id身份仍独立校验；不自动推断结算生效、付款、金额或改变订单归属。

补充实际PostgreSQL发布回归，分别覆盖hsid/hsId/HSID：稳定值A→稳定值B，正常capture→正式发布→当前目录指针→证据读回；审计updated=1/unchanged=2、旧值证据保留、订单UUID/单号不变。同时保留不稳定双遍拒绝和管理员/认证/身份保护测试。18/18通过，0跳过，outputs/sync-audit-settlement-publication-35.log。CI加入这组持久审计/恢复测试和新页面浏览器测试，未移除原检查。产品代码暂未改变。

## staging起点（只读）

现有runtime/catalog-sync-c5133e9e，supervisor enabled=true、状态DISABLED、code=preserved_source_pause，运行source owner数0。应用/库/订单实际范围、0058是否存在、队列/暂停/备份在发布前完整记录，不沿用617作为写死数量。旧main/staging c5133e9e的配对备份及回滚位置见material-staging-release-2026-11-12.md。

尚未合并、迁移、切换应用/worker、恢复来源或新增源站登录/报表。后续结果只能按真实回执更新。既有本机数据与退役采集器保留，production未操作。

## PR146复审恢复点

7354d3c398968d01e098a6a4f1830c4d9375489f已精确送达，唯一PR https://github.com/clearisok/zhixu-erp/pull/146 ，无冲突。三项CI中baseline/team-access成功；source失败在material-arrivals-upgrade：旧0038 fixture使用当前写入器被sync_audit_migration_required正确拦截。改用原c5133e9e历史写入器构造旧库，并增加当前写入器0源请求拒绝断言；相同问题一并核查0039成衣升级fixture。不能放宽缺0058保护。

正式自动复审7354d3c3给出两个P2：评论4560596842（失败合同在校验时未建审计子记录导致汇总假成功）、4560596852（旧回执复用的计划表误报失败）。已实施显式失败子记录、未知数量null；未取数回执明确replayed并排除新同步统计，0058未部署前前向补状态。相关定向测试/构建/最终CI仍在收口；不提前写审查通过或部署。

staging只读起点确认620订单/620绑定/620head、28237物料快照、0缺快照、migration57/0审计表；27053complete/97历史failed/5queued。23人工表、3原账号和620订单的保全基线已私密保存。5代表订单正常身份真实HTTP及匿名401通过，业务数据没有改动。

发布前原版本配对备份20261113T071520Z-7d0120a1正在执行；旧owner配置经标准备份流程停用以避免竞争，数据库业务暂停标记未修改。尚未写0058，尚未部署新应用或启动新owner。私密配置/原业务响应仅留宁波任务目录，不入仓库。

复审修复6506ffccb8e79ddccaf2364ec65359cf2ea58d7d的完整定向回归73/73通过（0失败/跳过），包括两项旧schema真实升级、批次部分失败、真实货款及成衣并发/终态回执复用、HTTP/Excel/服务重启和结算关联证据；日志outputs/sync-audit-review-fixes-38.log。类型38通过；CI已通过的baseline/team-access属于旧7354时点，新最终HEAD仍须必要检查。0058新replayed状态尚未在真实库应用。

7742626d在本机前端构建、全量Lint/服务端构建、Chromium3/3及精确源码基线守卫通过；该HEAD的baseline/team-access CI成功，source第二轮暴露0043 garment-target升级fixture仍调用当前collectGarmentOnce。已扩展同一历史源码fixture并保留当前写入器0源请求拒绝断言，剩余升级检查8/8通过。没有降低缺迁移保护。

最新自动复审新增P2评论4560743078：成衣正常采集终态事务仍普通COMMIT，导致真实成功被记提交待确认。修复仅使用同一审计确认COMMIT helper，新增首次实际发布success/提交时间断言；成衣collection/store全量定向41/41通过，包含原提交ACK丢失、回滚及权限并发保护。类型、定向Lint和服务端构建43通过。产品源表匹配/数量/权限/认证不变。

发布前配对备份20261113T071520Z-7d0120a1于2026-11-13T07:28:33.414910Z确认BACKUP_VERIFIED、originalServicesResumed=true。新独立network=none数据库恢复校验正在运行（恢复容器/卷全新且不发布端口，不覆盖staging），尚不宣称该恢复通过。旧应用已恢复，0058尚未应用，新owner尚未启动。


427db08c第三轮source CI为prefix12旧fixture调用当前写入器；prefix21历史物料同类路径一并用c513真实历史代码构造旧记录，当前缺0058仍零源请求拒绝。复审4560851175共享6086103部分失败汇总修复保留成功提交时间、全部source/catalog publication IDs及原计数，同时失败子记录/批次partial保留。目录16/16、历史17/17、归属9/9、审计11/11通过（后两组45轮中目录测试预期修正前独立通过），types/Lint/server46通过。

预备备份20261113T071520Z-7d0120a1实际隔离恢复成功：139表+全部序列逐行sha256集合一致、11附件bytes/哈希一致，network none/0端口/0源请求/0live库写，资产保留。原比较误将备份dict与恢复list比较，标准化结构后完整逐项比较无差异；restore-result.json成功时间2026-11-13T07:49:05.294075Z。未恢复覆盖staging。
