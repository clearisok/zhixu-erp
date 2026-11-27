# 正式订单工作台 Demo / Issue177

2026-11-27；用户批准 [v1 页面及实施范围](order-workbench-approval-2026-11-27.md)。仅独立分支开发、本地 Demo 和 PR；禁止合并、部署和真实业务写入。

## Delivery Phase 1 baseline

- Worktree `C:/Users/Administrator/.codex/worktrees/f120/zhixu-ainuoke-api`。
- 起点 detached HEAD，`10b9a7d827e1c09f152ead58c21f26712d49a619`，dirty 为空。
- 2026-11-27 本轮通过已核实监听的 7888 进程级 Git 代理 fetch，origin/main 精确为上述完整 SHA。未修改共享代理/认证/TLS。
- 独立分支 `feat/order-workbench`，初始 HEAD 同 main；未改动其他工作树/分支。
- Issue177 记录用户批准；项目字段实际读取后进入 In Progress，不改用户已有字段/视图/自动化。

## 实际实现边界

保留正式详情加载/会话/请求归属及来源和交期维护；只复用现有 Server 客户端展示交付、物料、生产、出货和关账。前置交付计划会提前读取其现有 GET，不改保存或合同所有权。新的待处理区只解释现有 alert，不创建业务风险公式。价格、采集和技术信息可展开查阅。

其他未合并 PR 保持。PR171/172/176 也包含原详情和物料摘要，存在后续合并时的共享文件冲突风险；本分支从实际 main 起步，不复制或覆盖其分支。当前真实 Staging 与 main 并不相同，不能把旧 CURRENT_STATE 的部署 SHA 当当前线上事实；此次没有部署动作。

## 验证和 Demo

待实现和实际检查后填写；未运行项目测试或真实业务验收前不记 PASS。本机未发现运行中的 ERP 服务或 Docker 容器；不会为 Demo 启动既有自动采集器、恢复业务库或重启现有服务器。

## Phase 1 checkpoint 与 Phase 2 起点

源码 checkpoint `b2cc6ad4ea1c015ffb4960aacb68197b24fe0f5e` 已独立提交并经官方交付脚本一次push，精确远端HEAD同SHA / DELIVERED_VERIFIED。一次Dry Run后遇新建本轮测试文件的未知dirty保护（0 push），核实唯一新文件及完整指纹a29511c43d9beefab9273570753feb71d3be8057569ce94bdad0881bdfa6901d后按脚本保护执行；未混入后续增量。没有共享Git/认证/TLS修改。

此checkpoint的类型/后端编译/正式Server前端构建通过；lint零错误但有一个未用import警告，已在后续移除。初轮root在原两条源码位置断言失败后继续长时间执行守卫；本轮同时更新了守卫摘要输入，因此主动中止，不记完整PASS。移动展示断言后定向7/7通过。最终冻结输入后将重跑root与release套件。

Phase2以b2cc6ad4为baseline；随后dirty均为本轮新增浏览器测试/只读Demo工具及局部可用性修复，无继承用户改动。原型/第一次driver的DOM未就绪和初始夹具仅一单导致失败均保留本机日志，修订driver而不改业务鉴权。构建b2的实际fixture六项功能/权限通过、900宽可达性失败，已定位角色面板最小宽度/表格字号并修复，后续新源码重新构建验收。

## 已执行的真实只读核对（非部署/人工接受）

本机5177真实API桥接已运行，使用现有app正常认证及GET，session/密码只在原app进程内存，不输出或落盘；HTTP业务写入在本机403，远端不接收业务mutation。首次63177被Windows拒绝监听后改用5177，未更改端口策略或主机配置。旧main从Git archive独立构建，验证后移至任务专用仓库外目录，未改动其他工作树。

实际6233-937：UUID 02b75c2f-8dc1-414a-bfc5-3411bc636072，SO-00000595 / PI2610-190 / 54000，数量和颜色均从实际API返回，不写入组件。订单、交付、物料、生产、关账分月及价格GET均200；成衣出货503，页面明确未取得，不补0。物料为stale/旧成功来源，独立Worker既有运行不属于Demo采集。本轮没有触发采集、修改源数据、部署、重启或数据库业务写入。

已拍摄main10b9与b2实际订单前后图，b2六宽三页签无浏览器异常/无前端业务POST；进一步几何检查发现隐藏横向溢出不能仅凭document宽度判断，已加入Card边界和字号校验，当前新源码结果尚待。原记录不冒充最终版本通过。

## Phase 2 checkpoint 与 Phase 3 起点

`0e5e573b283756119408456577c5627c5c43522a` 已独立提交、一次push并核实精确远端。此源码Server前端/后端构建、typecheck及完整lint通过（零警告）。真实6233浏览器42项身份/数量/六宽三页签/卡片可达性/字号/无业务写入/无异常检查均通过，但Windows Chromium退出超时，命令整体不记PASS。隔离工作台8个功能子项亦通过，外层同样因退出超时失败；原连续UI功能子项与成衣13项（含批次、权限、折叠401、A-B-A、空历史游标）通过，外层退出超时不冒称套件全过。原交期套件另有断言待排查。私有profile按既有保护保留，未按进程名清理浏览器。

Phase3基线0e5e573b；本阶段增量仅全局旧表格min-width:1000px的工作台局部覆盖、两个新driver沿既有允许范围增加退出等待，以及验证记录。没有改变业务数据/计算。root与release守卫仍执行中，输入的基线/冻结历史不变。

## 最终工程验证与证据冻结起点

UI构建固定11053c106dd8f97c8bd52ba1482070daa63b4928。root1026/1026和release182/182在隔离Linux完整PASS；Windows两长跑因同源码Linux完成而主动中止，不记通过。typecheck/完整lint零警告、server:build、Server build PASS。真实6233和真实SO-00000001各42/42且最终浏览器正常退出；选定六图已在635cef81117c2ff16969a3118ef7a8d466fe989f提交，截图期间后台Worker独立更新来源，每次按对应GET，不宣称本Demo采集。

七套Linux组合70/72，两个失败计数是同一交期driver在初次前置GET前劫持401，修driver等待初读后武装，独立重跑交期14/14且清理PASS。其余六套最终全PASS，包括商业权限/原回执/批次/ABA。原来源详情driver完整适配前置交付和规则分组矩阵，先误选另一规则组的表导致1子项失败，定位原规则表后9/9 PASS，七角色、错归属、离线、当前/迟到401均保留。新工作台9/9、原来源详情9/9加入既有CI步骤，未改触发器/权限/自动化。最后测试driver定向lint PASS。

Linux验证使用本机新建可丢弃镜像order-workbench-ui-runtime:11053c10（由既有Node24.22.3/TS5.9.3测试镜像加Chromium156和Docker CLI），只读原Git历史和任务源码归档。Docker Desktop的127发布在Windows侧，初4套PG连接失败后仅测试容器内TCP转接host.docker.internal对应端口；实际PG/NodeAPI/Chromium未mock，未改产品、共享主机/服务器配置或真实数据库。初轮调价恰遇产物重建ENOENT、Windows Chromium退出/EBUSY均如实保留忽略目录日志，稳定构建后的相应完整复核见工程证明。

635cef checkpoint独立push一次并精确远端核验DELIVERED_VERIFIED。e638此前push时并行新增本任务图片触发STOP_LOCAL_CHANGED（pushes1），随后独立只读ls-remote确认为精确e638，未重推；main仍精确10b9。网络正常，没有force/reset/clean或修改共享Git配置。

当前阶段新增工程证明、来源driver及CI覆盖、共享摘要更新，基线635cef，全部本任务dirty，无继承用户改动。下一步将新文档/截图按真实commit和SHA256前向冻结，最终守卫及PR交付另记，不把早期候选结果冒充本阶段最终通过。

## 最终冻结清单 Gate

main再次只读核实为10b9a7d827e1c09f152ead58c21f26712d49a619。工程checkpoint e0a2e5ceaef1cd82a1c1761887a03bea4be58858已一次push并精确DELIVERED_VERIFIED；其后新增8条前向冻结证据（六图、工程文档、Demo指南），旧ID/日期/hash/人验/部署维度不覆盖。

最终候选清单与e0源码在隔离Linux再次npm test，1026/1026 PASS；清单SHA256 37dc0c98b23b1e90d5cb41c785aa83df626fb82a4ff42603c0f3128107bb52d0。独立npm run check:release-baseline -- --base-sha 10b9a7d827e1c09f152ead58c21f26712d49a619 PASS，13页/68能力/精确8个UI文件，零errors。最终清单的独立release182仍在执行；此前同UI源码182/182通过，不将当前未结束轮次提前记PASS。

首个隔离Git副本把Windows系统core.autocrlf=true的归档按Linux默认false读取，造成482条假差异/旧UI记录误报；未改清单路径或任何历史hash。核对归档app/globals.css实际CRLF及原Git归一化blob b9f47b16d88968733d89140fdf8435ce52ef0f6e后，只在可丢弃Git副本设置与原环境相同的core.autocrlf=true，hash-object完全一致、守卫精确8路径PASS。原Git对象只读打包到容器本地以避免逐文件p9开销，没有修改共享Git配置或原objects。两失败日志保留，不冒称通过。

当前最后提交只冻结清单和记录结果；8个UI源码与渲染11053c106dd8f97c8bd52ba1482070daa63b4928逐字一致。下一步推送核验、创建唯一PR，最终release结果及PR链接后续回写，Issue保持开放。

## PR交付与等待用户评审

最终候选698条清单（同上SHA256）全量1026/1026、精确8路径守卫PASS，独立release最终182/182 PASS（147309ms）。初次错误的Linux CRLF读取造成额外路径，已在一次性Git副本复现原系统有效core.autocrlf=true归一化，未改历史hash或扩影响清单。失败轮次不记通过。

a2e02c599d4e1a69fb964bcdfe1e6a590ae3f6be已按官方脚本Dry Run后一次push，精确远端DELIVERED_VERIFIED，dirty为空。随后用GitHub连接器创建唯一[PR178](https://github.com/clearisok/zhixu-erp/pull/178)，标题feat(order): 重构正式订单详情为订单工作台，目标main；非draft、无auto-merge、未合并。main仍精确10b9；GitHub实际mergeable=MERGEABLE，三个既有CI检查开始执行，不能记远端CI PASS。

实际读取Project字段后仅把Issue177的Status从In Progress转Review，其他字段/视图/自动化不改，Issue保持开放。PR含中文前后区别/交互/文件/测试/限制、六张选定截图及真实只读Demo运行方式。没有部署、服务器配置或数据库业务操作。

本轮最后增量只回写结果/链接/等待评审状态，基线a2e02c59，不改UI或冻结证据。最后一次守卫按最终HEAD另核，远端CI和用户体验分别记录，不以本地工程通过代替人工接受。真实Demo本机5177及auth/me已再次200，可直接体验6233-937；保存/采集仍本机403，不向真实API发送业务写入。
