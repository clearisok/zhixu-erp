# 当前状态：晚间目录暂停已恢复；合同日期排序为本地候选

2026-11-10。核实main和staging实际版本仍为 **dbc61af9be80d0a72e8226afa2cefad6e240ef09**（PR143）。本轮独立分支fix/ainuoke-directory-recovery-sort，工作树ainuoke-directory-recovery；代码候选尚未交付/部署，不将本地排序写成公网已上线。

晚间用户发现今日新单未更新。实际目录最后成功09:57:59、619合同；10:16:09–22明细capture拒绝catalog_changed_or_over_limit，随后全源持久暂停、监管器STOPPED_FAULT。旧失败仅保留请求成功轨迹和复合码，没有前后目录差异；不能认定具体是新增、超限、网络或认证，更不能用00:42正常状态覆盖此故障。

21:48一次受控只读目录双遍成功（1登录/26报表），620合同，新增PI2611-091/source7196/款MS2161C、工厂款2161C，合同日期2026-11-10。原619身份和固定字段全部保留；只另有PI2610-170品牌字段变化。21:57:56通过原preview/hash恢复服务和监管器activate，未SQL改指针、未清队列/重置任务、未手动导入刷新。正常cron21:58:06.760自动建单SO-00000620，21:59:46.173发布成功，sourceAt21:59:42.901。22:08真实HTTP200，身份/合同/快照一致，2自购/0厂供，匿名401；两个品牌图片服务器HTTP200。浏览器控制工具timeoutMs内部错误，截图身份卡住与图片破损的客户端原因尚未查证。

[订单中心](https://staging.weaveops.top/order-center)；[新单物料](https://staging.weaveops.top/order-center/style-progress/detail?orderId=03d73e50-9c44-4805-9ae2-9bc8c620310d)。22:06控制enabled、无暂停、心跳正常，114queued/5running为自然补处理，不代表失败或全部完成。本机源采集仍关闭，宁波唯一owner保持不变，生产未操作。

候选最小修复：既有订单中心默认合同日期降序、缺失最后、同日稳定分页；正常目录新增且固定身份/范围完全保留时有限1/5分钟重采，总3次，永不发布不稳定对；失败回执保留封闭差异摘要。删除、身份/未知字段变化或不完整传输仍停止，不自动清除安全暂停。详情与检查结果见[当前任务](tasks/active/ainuoke-directory-recovery-sort-2026-11-10.md)。

[更新前完整状态](tasks/completed/2026-11-10-before-evening-recovery/CURRENT_STATE.md)保留原00:42验收、原617、备份139表/9附件及完整CI事实。新候选不能继承这些结果冒称已部署。原备份、卷、人工数据、账号权限和历史证据全部保留。

22:13:59最终只读补充：620订单/620正式物料head，queued/running/unknown及重复在途均0，源无暂停、心跳正常。恢复后新请求232 complete；原27 queued保留原任务身份正常补处理，不把任务次数当不同订单数。下一目录计划22:28:07.126183。实际运行仍M，未部署本地候选。
