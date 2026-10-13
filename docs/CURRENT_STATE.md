# 当前状态

核实2026-10-14；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`（#104–107已合并，最终只读核实相同）。GitHub/实际代码是实时工程事实，本文件随main、来源、运行目标、交付和验收改变而更新。旧状态/日期/hash/限制保留[归档](tasks/completed/2026-10-13-pre-live-demo-status-snapshot.md)。

- **已合并**：六角色/session、艾诺科固定Source/首次绑定/调度/P6、登录、无DB只读工具、QtyUnit和显式受控新增合同。合并不等于真实激活/部署。
- **用户决定**：D104–105艾诺科团队全见含来源采购价、织序金额按角色；四流持续展示后上线宁波、暂不独立库存。D109原HTTP风险接受。D111三组身份/单位已确认。D114理论与实际采购分开，授权新owned本机fixture DB/合成账号/Excel输入；不改旧库、真实账号、生产路由、UI布局或真实部署。密码仅受限进程消费，Codex自行执行已授权只读，不重复索要。
- **真实558预检**：当前账号可见完整稳定；552颜色可用/6无效；14,411需求单位12,655已知/1,750缺失/6冲突；物料414,954ms/25,397,547串行字节。不是公司全量权限或持续验收。四个空物料合同及四流unknown保留。[冻结证据](tasks/active/evidence/ainuoke-live-demo-readiness/real-full-preflight-2026-10-13.md)。
- **定向诊断完成**：19合同47请求，无DB、不重跑全部物料。6颜色为SizeNum/颜色空白/重复身份；6单位为相同需求的不同来源原值。五类单位/采购统计为12,653/2/2/1,748/6，缺单位不是未知采购的自动因果。负数语义仍未确认，unknown不改0。[质量证据](tasks/active/evidence/ainuoke-live-demo-readiness/quality-and-quantity-gate-2026-10-13.md)。
- **新工程本地通过**：同一 `feat/ainuoke-live-demo-readiness`，三个理论/采购样本并存；原P6只补解释段落，正式TotalNum/cgnum/齐套/单位换算/归并不改。356两行一事件。冻结证据门禁增加线性链、当前HEAD祖先和唯一末端等反例。
- **实际隔离演示可用**：[本机登录](http://127.0.0.1:62200/login?returnTo=%2Forder-center)，项目zhixu-local-314c667377ec，新独立持久卷与DB。23订单（6明确标识fixture+17Excel模拟框架），17报价/22价格版本/132输入明细（1类未映射），9品牌/18业务员/17面料/15辅料/5制作方案、6合成账号、12迁移。APP源码be1c522，真实镜像/资源ID见[A–F报告](tasks/active/evidence/ainuoke-live-demo-readiness/isolated-demo-final-report-2026-10-14.md)。仅offline fixture每轮完成后等300秒，没有真实Source采集。
- **运行验证**：831源码/85基线/47定向/17资源及验收入口保护/10实际API浏览器通过；类型、lint、Server/实际Docker构建通过。1440/1280/390样式和无页面横溢出；3轮快照、失败保留旧代并隐藏当前、陈旧、32MiB超限、恢复、stop/start卷保留均通过。人工体验仍待用户。
- **未执行**：真实艾诺科修改、旧业务DB/真实账号写入、真实首绑/持续激活、宁波/18443/18444部署、自动合并。生产/关账Server路由继续关闭。Excel排单等后续Sheet未伪装接通。
- **下一步**：IT确认局部空色/空数量行、冲突单位和负数语义；用户体验及面料单耗/采购成本类别确认。真实持续展示需精确新目标授权、2–3真实刷新和代表单签收，再做24小时/故障重启/备份恢复/容量监测等宁波Gate。不是因局部异常拒绝全部正常订单。
- **远端交付**：正文收口时无PR、当前新代码远端待验证。只读网络诊断已能取main，不冒称push/CI成功；采用一次安全交付，最终SHA/PR/CI见交付收口文件。新PR不自动合并。

恢复：[PROJECT_INDEX](PROJECT_INDEX.md)、[Source](features/AINUOKE_SERVER_SOURCE.md)、[完整报告](tasks/active/evidence/ainuoke-live-demo-readiness/isolated-demo-final-report-2026-10-14.md)、Active D105–114。