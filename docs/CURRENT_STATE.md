# 当前状态：Issue174 交付与 Staging 切换准备

2026-11-25；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**（本轮 connector 与直连 fetch 核实）；branch **feat/issue174-storage-v2**；初次组合基线 **6d7dbc9c089f9dfa6c0ac72aa3edbd37aa13da85**。用户已接受第一、二阶段，现仅交付既有工程、保全其他整改和准备第三阶段，不扩展开发。[用户决定](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7157916062)。

**候选保全**：PR172/a0a9c78c、PR173/da1c2653、原Issue174/747fda56全部是本候选祖先，分别51/3/56个非文档文件blob精确相同，PR172的AGENTS规则也原样保留。只有共享状态摘要及同一基线核实日期需要协调；旧摘要完整[归档](tasks/completed/2026-11-25-before-issue174-delivery/README.md)。没有覆盖现有Staging，也没有合并原PR。

**Git交付**：配置代理路径失败，仅本进程清空HTTP代理后两种Git读取与fetch成功；共享代理、认证、TLS校验不变，代理内部原因未确定。精确dee3已一次push并独立核验DELIVERED_VERIFIED，[文档PR175](https://github.com/clearisok/zhixu-erp/pull/175)已建。统一工程PR、最终远端HEAD及本轮CI以[Issue174最新送达回执](https://github.com/clearisok/zhixu-erp/issues/174)为准；没有精确回执不能把本地commit当远端成功。

**本轮验证**：组合发布守卫PASS（40个UI路径、main同上）；发布回归182/182、相关UI源码44/44、历史界面/内容11/11，typecheck/lint、Server前端与后端build通过。备份测试10通过/1Windows POSIX跳过，PR173原Linux完整证明保留。守卫曾拦截我对两份冻结文档的追加，已只撤回本轮追加，原blob/ID/hash均保留，复跑PASS。初次build命令路径错误已修正，失败日志保留；未修改产品代码或测试断言消除失败。[脱敏交付证据](tasks/active/evidence/issue174-storage-v2-20261125/delivery.json)。

**既有实测保持有效**：同一11/24备份635单，原样12.169GB→紧凑恢复406.18MB（减少96.66%），13附件、145旧表原列/选中闭包、5序列/FK/来源proof验证通过。无变化100次增长31.88→1.85MB、业务版本100→0；不是实时Staging容量或全年保证。没有重新调查或重做迁移演练。[前两阶段结果](tasks/active/issue174-v2-phase12-results.md)保留原日期、版本和当时远端pending事实，由本轮回执前向补充。

**待批准执行**：[第三阶段执行单](tasks/active/issue174-staging-phase3-ready.md)采用新Staging独立PG/对象卷、最新停写完整配对备份、隔离选择转换、普通非owner运行角色、完整保全门禁后切入口。预计停写约3小时，计入新source备份与缓冲预约3.5小时；不是RTO承诺。实际新旧目标指纹/端口与线上可用磁盘须在执行批准前只读填实，60GB是计划工作预算而非线上已核实余量。

**风险/边界**：未知schema/引用/提交结果必须停；开放新写前可取消回原库/镜像，开放新写后保护全部新增业务/附件并兼容恢复或前向修复，不能直接退冻库。原始配对备份从未来正式迁移验收成功起至少90天；旧库/卷/备份退役另批。Worker、自动清理继续关闭，Production和自动合并禁止。两轮自然调度/≥24h增长观察与6087051旧历史详情限制仍未解决为新验收事实；不扩大修复范围。


2026-11-25 CI收口：统一工程 [PR176](https://github.com/clearisok/zhixu-erp/pull/176) 已建立，初次HEAD04e74cfbbaf54fa29b0843bfd8525f007fc44312已精确送达且最终守卫PASS（40UI路径）。Source CI 45644446792发现完整目录不含任何绑定合同的旧路径会回滚，后续SQL证据读取测试连带404；仅修 shared-publication.ts，记录必要缺失context而不造物料快照，重复缺失复用事件，重新出现正常恢复。原断言保留并增加零快照/无重复/恢复读取断言。来源20pass/1Windows skip、存储/目录/删除恢复19pass、server build/typecheck通过；lint已通过；最终CI结果以Issue最新回执为准。PR172/173全部产品blob仍原样；仅Issue174一处publisher和原来源测试发生必要兼容修复，不扩展功能、schema或迁移工具。最终候选取PR176精确HEAD，6d和04是保留的历史检查点。文档PR175三项CI均SUCCESS。Staging、Worker、清理和Production仍未操作。
