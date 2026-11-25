# 当前状态：Issue174 切换准备，等待最终门禁和执行批准

2026-11-26；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619** 本轮再次核实；branch **feat/issue174-storage-v2**。最终交付HEAD和本HEAD CI以 [PR176](https://github.com/clearisok/zhixu-erp/pull/176) / [Issue174最新回执](https://github.com/clearisok/zhixu-erp/issues/174)为准，本检查点不预写尚未完成的CI成功。

用户已[接受第一、二阶段](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7157916062)，本轮仅既有工程交付、保全PR172/173和[第三阶段执行单](tasks/active/issue174-staging-phase3-ready.md)，不增加功能。原文档dee3已送达[PR175](https://github.com/clearisok/zhixu-erp/pull/175)，三项CI成功；原文档工作树保持冻结。

**保护其他整改**：再次核实PR172/a0a9c78c6cccbadf5e635dbb60169f7f87944644、PR173/da1c2653ae6c53a1527bcee60dbdec734cc36553仍是最新未合并head，均作为本分支祖先；52/3个非文档路径全blob一致。未覆盖现有Staging或合并原PR。

**必要门禁收口**：仅一个既有publisher补全“完整目录里绑定合同全部缺失”上下文，重复缺失不新增事件/物料快照，重现可读；来源20pass/1Windows skip、存储/目录19pass、类型/lint/build通过。旧升级夹具按全部旧列比较并额外验证新列NULL/legacy，旧重复版本预期改为验证共享一个版本/正文，物料确认先用现有hydrator还原原页；原权限/串单/损坏/只读/陈旧确认断言保留，没有改SQL或关账逻辑。后续本地数据库270、归属45、目录106、删除恢复10、来源专项49、连续同步80pass/1Windows skip均通过，其他后续工作流测试也全部通过。[分项日志hash](tasks/active/evidence/issue174-storage-v2-20261125/delivery.json)保留不同运行版本和失败，不相加冒充一次独立全套。

**原演练不重做**：11/24备份635单/13附件，原样12.169GB→紧凑406.18MB；145原表原列/选中引用闭包、5序列/FK/来源/附件证明及另一新PG恢复通过。100次无变化增长31.88→1.85MB，业务版本100→0。是已接受旧样本，不是实时Staging缩容/全年保证。两原演练容器仍停着。[结果](tasks/active/issue174-v2-phase12-results.md)。

**交付事实**：Schannel/配置代理间歇失败；仅子进程OpenSSL+HTTP1.1直连已多次安全送达并独立核实，未改共享配置/认证/TLS验证，不宣称网络永久恢复。343f6ef3时PR索引曾停cfe，后已同步并自动触发CI；该轮Release/Team成功、Source发现上述旧夹具问题。当前再补必要测试后只更新同一PR；最新成功必须绑定最新精确HEAD。[历史原件](tasks/completed/2026-11-26-issue174-delivery-checkpoints/README.md)。

**下一步/风险**：预计停写约3小时、预约3.5小时；最新停写完整配对备份→隔离选择/转换→独立新Staging PG/对象卷→普通非owner运行角色→全业务/附件门禁→切入口。新旧目标指纹、端口和实际磁盘/60GB计划工作预算须执行批准前只读填实。开放新写前可取消回旧版本，开放后保全新增业务/附件并v2兼容恢复或前向修复，不能退冻库丢业务。原始备份90天从未来正式迁移验收成功起算。

**仍未执行/未授权**：真实切换、历史删除、清理启用、Worker恢复、旧库/备份退役、自动合并及Production。两轮自然调度/≥24h增长观察与7051旧历史详情限制没有被本轮冒称解决。完成最终CI后只等用户批准第三阶段。


2026-11-26 01:04 最后计数夹具：600c4d02的Release/Team成功，Source通过先前门禁后发现selected-source-once仍假设两个合同共享一个run。仅两行断言改为验证两个合同各有一个版本、拒绝范围时精确保留这两个；17/17通过，fresh-start/隔离边界/质量事实及定向lint也通过。无生产/SQL/工作流变化；原失败保留在Source45657556080。最终候选/CI仍以PR176及Issue最新回执为准。
