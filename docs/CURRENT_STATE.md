# 当前状态

核实日期：2026-10-12；GitHub main / 任务基线：5215ef75510e4b55ef69b1ae1508816b80fda110（PR97已合并）。GitHub是实时事实源，此文为快照；旧状态见[前序归档](tasks/completed/2026-10-12-ainuoke-source-predecessor-state.md)。

- 六角色可信账号管理已随PR97合并；未创建真实账号，未因此部署或激活Source。首轮来源全团队可见采购价，织序售价/工价/内部成本继续独立权限。
- 当前 [PR99](https://github.com/clearisok/zhixu-erp/pull/99) / feat/ainuoke-server-source（未合并；工程及三项CI通过，复审建议合并默认关闭的基础能力）：按已绑定正式订单保存完整Discovery/Material快照，读取采购/入库/出运/出库；默认关闭、固定catalog、原子发布、权限/版本复核、陈旧/失败关闭。新增0012只在合成disposable DB测试。见[功能](features/AINUOKE_SERVER_SOURCE.md)、[任务](tasks/active/ainuoke-server-source.md)、D-105。
- 用户更新上线条件：**艾诺科数据持续展示后再上线宁波Ubuntu**。报价暂时OK；不做独立库存台账，不把生产/关账扩成首版前置。仍未实现定时持续运行、首次正式订单绑定、生产Order/Material页面激活；本PR不代表上线条件已满足。
- UI维持D-099及D-102/P6。无页面/样式/截图改变，生产路由allowlist不变。真实Source未连接，本次无新的人工UI或业务验收。
- 宁波与18443/18444均未操作。宁波只读预检在独立PR98，未当作本分支已合并事实；旧环境镜像和日期保留在能力清单的历史记录，不伪称本次重新观察。
- 下一步：本PR门禁/CI/复审；受控首次订单绑定 + 连续采集/告警 + 既有UI多轮验收；最后独立数据库、网络/凭据、备份恢复与候选发布Gate。凭据只在未来真实激活前私下配置，现在不需要发送。
- 实现、合并、隔离测试、环境部署、人工验收和Source激活分开见[能力快照](release/baseline.json)。不自动合并，不共享Preview与业务DB，不执行真实迁移/部署。

更新时机：main/PR/权限/Source/环境/测试与验收变化。
