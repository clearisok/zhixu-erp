# AI handoff

核实日期2026-10-12；main基线5215ef75510e4b55ef69b1ae1508816b80fda110。任务feat/ainuoke-server-source，独立worktree起始clean，PR99：https://github.com/clearisok/zhixu-erp/pull/99，OPEN、不自动合并。
用户授权保持UI、按订单展示采购/入库/出运/出库、合成测试/PR/复审；禁止真实账号/DB/部署。Ubuntu须待艾诺科持续展示后上线（D-105）。
实现和边界见[功能](features/AINUOKE_SERVER_SOURCE.md)、[任务及复审](tasks/active/ainuoke-server-source.md)、[冻结证据](tasks/active/evidence/ainuoke-server-source/engineering.md)。
代码/证据G1=458c8f3b9b1bbb026644070bb47cc5cc290d5ed7，G2=fa84da0148de131edd8e7c65ae5e605f050f98b0；交付/受审head6395aa9ec261364fb220467404fff8bfac2e4630远端精确确认，三项CI全SUCCESS，建议合并默认关闭的基础能力。后续纯文档head e850c0b 的team-access暴露旧Excel测试Buffer范围问题，本次只修两处测试helper并加确定性回归（先RED后GREEN）；生产代码不变。最终精确head及三项CI以PR正文/实时checks为准，不沿用旧head PASS。
本地最新root808/808、baseline69、PG261、FreshStart7、Python52、typecheck/serverbuild/lint/Browserbuild PASS；Ubuntu来源21/21且Linux CLI实际执行，六角色/既有UI Chromium与双authority构建CI PASS。G1候选镜像仅包装验证，不是最终发布镜像。
真实Source未激活，无scheduler、首次正式订单绑定或生产路由开放。下个PR建议feat/ainuoke-continuous-material-display；真实凭据到激活前再私下配置。
LOCAL ENGINEERING与REMOTE DELIVERY已分别核实；起始fetch/诊断网络失败，后单次安全push成功，不代表网络永久恢复。旧状态见tasks/completed/2026-10-12-ainuoke-source-predecessor-state.md。
更新时机：checkpoint/main/PR/测试/来源或部署事实改变。
