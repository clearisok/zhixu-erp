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
