# 前序状态归档
归档日期2026-10-12；本次基线 db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e。以下来自该main的原文，作为历史恢复点保留；不表示重新观察或当前部署。

## docs/CURRENT_STATE.md

# 当前状态

核实日期：2026-10-12；GitHub main / 任务基线：5215ef75510e4b55ef69b1ae1508816b80fda110（PR97已合并）。GitHub是实时事实源，此文为快照；旧状态见[前序归档](tasks/completed/2026-10-12-ainuoke-source-predecessor-state.md)。

- 六角色可信账号管理已随PR97合并；未创建真实账号，未因此部署或激活Source。首轮来源全团队可见采购价，织序售价/工价/内部成本继续独立权限。
- 当前 [PR99](https://github.com/clearisok/zhixu-erp/pull/99) / feat/ainuoke-server-source（未合并；默认关闭的基础能力已实现，最终head CI及复审结论见PR正文）：按已绑定正式订单保存完整Discovery/Material快照，读取采购/入库/出运/出库；默认关闭、固定catalog、原子发布、权限/版本复核、陈旧/失败关闭。新增0012只在合成disposable DB测试。见[功能](features/AINUOKE_SERVER_SOURCE.md)、[任务](tasks/active/ainuoke-server-source.md)、D-105。
- 用户更新上线条件：**艾诺科数据持续展示后再上线宁波Ubuntu**。报价暂时OK；不做独立库存台账，不把生产/关账扩成首版前置。仍未实现定时持续运行、首次正式订单绑定、生产Order/Material页面激活；本PR不代表上线条件已满足。
- UI维持D-099及D-102/P6。无页面/样式/截图改变，生产路由allowlist不变。真实Source未连接，本次无新的人工UI或业务验收。
- 宁波与18443/18444均未操作。宁波只读预检在独立PR98，未当作本分支已合并事实；旧环境镜像和日期保留在能力清单的历史记录，不伪称本次重新观察。
- 下一步：本PR门禁/CI/复审；受控首次订单绑定 + 连续采集/告警 + 既有UI多轮验收；最后独立数据库、网络/凭据、备份恢复与候选发布Gate。凭据只在未来真实激活前私下配置，现在不需要发送。
- 实现、合并、隔离测试、环境部署、人工验收和Source激活分开见[能力快照](release/baseline.json)。不自动合并，不共享Preview与业务DB，不执行真实迁移/部署。

更新时机：main/PR/权限/Source/环境/测试与验收变化。

## docs/AI_HANDOFF.md

# AI handoff

核实日期2026-10-12；main基线5215ef75510e4b55ef69b1ae1508816b80fda110。任务feat/ainuoke-server-source，独立worktree起始clean，PR99：https://github.com/clearisok/zhixu-erp/pull/99，OPEN、不自动合并。
用户授权保持UI、按订单展示采购/入库/出运/出库、合成测试/PR/复审；禁止真实账号/DB/部署。Ubuntu须待艾诺科持续展示后上线（D-105）。
实现和边界见[功能](features/AINUOKE_SERVER_SOURCE.md)、[任务及复审](tasks/active/ainuoke-server-source.md)、[冻结证据](tasks/active/evidence/ainuoke-server-source/engineering.md)。
代码/证据G1=458c8f3b9b1bbb026644070bb47cc5cc290d5ed7，G2=fa84da0148de131edd8e7c65ae5e605f050f98b0；交付/受审head6395aa9ec261364fb220467404fff8bfac2e4630远端精确确认，三项CI全SUCCESS，建议合并默认关闭的基础能力。后续纯文档head e850c0b 的team-access暴露旧Excel测试Buffer范围问题，本次只修两处测试helper并加确定性回归（先RED后GREEN）；生产代码不变。最终精确head及三项CI以PR正文/实时checks为准，不沿用旧head PASS。
本地最新root808/808、baseline69、PG261、FreshStart7、Python52、typecheck/serverbuild/lint/Browserbuild PASS；Ubuntu来源21/21且Linux CLI实际执行，六角色/既有UI Chromium与双authority构建CI PASS。G1候选镜像仅包装验证，不是最终发布镜像。
真实Source未激活，无scheduler、首次正式订单绑定或生产路由开放。下个PR建议feat/ainuoke-continuous-material-display；真实凭据到激活前再私下配置。
LOCAL ENGINEERING与REMOTE DELIVERY已分别核实；起始fetch/诊断网络失败，后单次安全push成功，不代表网络永久恢复。旧状态见tasks/completed/2026-10-12-ainuoke-source-predecessor-state.md。
更新时机：checkpoint/main/PR/测试/来源或部署事实改变。
