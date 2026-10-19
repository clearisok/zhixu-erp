# Gate5：页面、物料和已验依赖的联合候选

核实2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。沿既有feat/material-sort-and-event-drawer，从68ac1fc9f839ebfc894d39377dac221e7f65566b/clean快进独立已验Quote d9bf53b47f2f587d6c0db4954b0b8a55fe431638，再合入最新Gate4 4c59d974edd29cc82798884e70ff7586319f95ac（含G1–G3最新依赖）。全部原refs/提交及工作树保留，不新建树/重复PR、不合main。源码、范围、main/PR、测试或授权变化时更新；GitHub为实时工程事实源。

## 当前核实与工程动作

实际检查material-display-order、material-progress-settings权限/事务和客户端、excess-warehouse及原B2/num_dyc/Quote验收。面料跨单位数值仅临时显示排序，辅料第一个关键词字面匹配，结果不存为业务总量；设置fresh权限/CAS/actor请求幂等/审计保持。多余仓只追踪已有入库事件引用，缺键/空白/冲突/部分缺失保留未知，不默认0/个，不计入rknum/齐套。事件Drawer按既有物料身份读取，不重新归并数量。

已批准小返回箭头、业务/工厂款号、去重复导航和长说明、设置入口、颜色规格展开及右侧事件均保留。对账侧栏仍明确待接入，不把6086941同名字段混入6087050，也不把申请金额当银行已付。物料/排序/单位/设置服务、SQL及默认路由本阶段没有新增修改。

Quote保存成功后退出失败的已验修复现在确实合入同一候选，而不是仅在独立分支声明完成：保存ACK且clean时只重试退出；新dirty仍保存；未知结果不能丢弃绕过。没有带回旧a0e60e4经销报价直接SO方案。原修复源码65566527和独立报告保留。

最新G4保留D130更强准备outbox/回执/刷新恢复和原请求负向；不会用G1早期简单组件降级。归属/执行服务默认关闭、未知覆盖不当0、现有来源历史与写fence不改。实际冲突仅AI_HANDOFF/CURRENT_STATE/PROJECT_INDEX，B2/Quote/G4三份原文完整归档completed/2026-10-15-gate5-before-verified-dependency-integration.md；无业务代码或SQL冲突。

## 验证和事实分层

本次联合候选的设置/客户端、页头/退出/物料/多余仓/身份浏览器、类型/源码lint、Server/显式Server候选及默认Browser构建、root/基线和精确main守卫执行后补实际结果。原B2 25/898/94/PG261、Quote13及G4等原阶段结果不直接充作本次PASS；所有旧PNG、receipt、冻结ID/hash、源SHA与限制保留，不覆盖截图。

G1–G4新本地提交7ef6e665/e3cebb48/4da3590b/4c59d974尚待各自精确新远端/CI，旧绿灯不替代。本阶段Git NETWORK_DEGRADED，按AGENTS不自动恢复推送/换认证或文件API伪造提交；当前无新G5 PR/Hosted CI，不直接建议累计合并。精确交付后只能创建唯一Draft并披露108、109→112、G5/num_dyc及Quote原依赖，自有delta须清晰。

## 仍未获授权或未验证

6086941首页和两个精确样本的业务口径已有受保护本机证据，原始报表与确认不重复采集。新两合同完整分页/固定过滤真实核验尚无新增许可；工具通过不证明查询映射正确，更不证明正式财务来源接通。Source48b63101/clean及其准确交付命令本阶段保持，不读凭据或报表。

本机构建不切换现有真实演示。全部测试仅合成账号、随机tmpfs PostgreSQL和独立临时浏览器；不改真实账号/业务DB、不归一、不首绑/激活或恢复旧窗口、不部署宁波18443/18444，不自动合并。原四单/10分钟/2小时12/12已结束，本阶段不重新解释为长期授权。

## 本轮实际收口和失败保留

本轮实际通过：设置/客户端17/17；页头/退出/来源13、num_dyc5、身份6及物料展示9共33项浏览器覆盖（按下述两次构建分层）；typecheck、Server编译、Server/session/snapshot及默认Browser两authority构建、全源码lint（排除继承outputs私有生成物）、root898/898、基线94/94及精确main守卫PASS（11页/35能力/53继承UI路径）。真实日志为outputs/gate5-verified-{settings,typecheck,server-build,server-ui-build,ui,full-sha-build,material-ui,browser-build,lint,root,baseline,guard}.log，仅本机忽略产物。没有重跑旧PG261，也不借用旧截图作为当前像素验收。

首轮联合25项为24PASS/1FAIL：13页头/退出、5多余仓、6身份实际通过；物料组在开始业务动作前因build-info只写短SHA d9bf53b4而被完整40位身份断言拒绝。本轮不放宽断言，也不改产品或测试；修正构建调用的既有ZHIXU_GIT_COMMIT参数后，物料9/9通过。故33是两次构建的覆盖并集，不写成一次33/33完整运行。两次间产品源文件无变化；只build ID/提交号表示不同。默认Browser构建在修正后通过。原失败日志保留。

后次Server构建gitCommit=d9bf53b47f2f587d6c0db4954b0b8a55fe431638、buildId=20261015-211426；默认Browser buildId=20261015-211449。产品源码与已验父d9bf一致，合入G4仅测试/文档变化，最后原提交/两个父祖先及关键内容hash再核；所测LF规范化SHA256：

- features/quote-center/components/quote-editor.tsx：e735f62a9cabae6b5f44ea79e6a57ab72fe9221002cfd4cc7e9e125eba581507
- features/order-center/components/server-order-preparation-card.tsx：5f58929b67aec9a77d462baf2b49c01e5b867f968001286c872617047755a679
- features/style-progress/components/material-control-tower-read-only.tsx：7a5539669b3985895ec7c61199244734a76b1a10faa08e385d1407e30cc38e28
- server/integration/order-identity-ui.integration.test.mjs：dbde9b8e278d4ac2dc69eaa471d575fec1c0880e2479e4e1cb92d6140d433d85

联合复审结论：本地候选已纳入页面、排序/事件、多余仓、Quote退出及最新身份依赖，未发现新增需改SQL/物料计算或开路由的事项。仍待精确远端送达、唯一Draft PR、新CI、依赖main对齐及人工验收；不能直接合累计代码或扩大真实演示/来源授权。
