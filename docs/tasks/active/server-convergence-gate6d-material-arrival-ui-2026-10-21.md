# Gate6D：原页面Server分批到料与逐批物流

2026-10-21；root唯一writer，既有独立reviewer只读。前一goal turn为PROGRESS：
人工到仓后台、完整测试/独立复审与分维度证据登记已提交689afa128bc13f56d96dfa5db13403808048943f，工作树干净。
本阶段独立GitHub API核实main996dfedc12da3527343cd3ff2aa5eea35497e10e；PR120–127仍原草稿/原SHA。
新分支codex/server-material-arrival-ui从此main创建并明确ff-only接续689afa，无继承dirty；
[输入三摘要Git原字节](../completed/2026-10-21-material-arrival-ui-inputs/689afa12/)保留全部旧状态/日期/hash/结果/限制。

## 已批准范围

用户批准D147总计划继续Server化，默认一个实现者及一个独立审查者。继承D054、D065–069、D145/147/150/152。
只在原物料页/卡片/分批到料Modal/历史Drawer恢复既有功能与布局；不新建导航、不改变公式或业务规则。
Source交期、人工到明确Hub的预计日期、四流Actual分别保留。manual-only不开放没有地点证明的来源跟随。
数量文本精确，不把多单位批次合成实物总数，不自动补齐。改仓/单位/缺来源/厂供/歧义/超配保留原计划及历史。

## 实施边界与依赖

- 复用0039唯一owner及已验证preview/CAS/幂等/回执。新增可信客户端、仅未核实请求的单槽恢复；
  与Browser业务key、IndexedDB、Seed和旧备份无读写关系。先保存读回原命令再POST，刷新/挂载/重试不自动POST。
- 原Server物料页面按独立Source事实展示；批次接口失败不清空四流。当前Source缺失仍能看到原物理SO计划/完整历史。
  迟到响应受当前会话及请求lease保护，旧401不注销新会话；pending/unknown/内容不符保留原请求。
- 逐批复用material-logistics-service.ts，取同一订单最早未取消的正式排单及其采用生产组/地点快照；
  当前Hub只能来自已保存tracking，路线/运输方式来自Server资料，缺失/停用/歧义明确提示，不猜首个或唯一资源。
  不修改排单或实际完成。style_progress.read既有定义包含逐物料物流，只返回计算所需非金额白名单，不暴露排单/仓/路线备注或联系人。
- 每批分别显示到Hub、推荐运输、到厂、距上线与buffer；旧失效计划不拿新Hub重新解释。草稿测算不冒称已保存事实。
- Schema不变；既有Source/profile→SO锁序、fresh权限、物理归属、金额过滤及冻结边界保持。

主控修改范围：server/material-arrivals的派生读取；唯一物流helper必要类型窄化；
features/style-progress/server及原物料组件；对应API/client/一次性PG/真实构建Chromium测试；
精确V0/V1路径记录、相关feature及root状态。共享app/index/migration/权限/全局CSS默认不改，确有需要先核实并记录原因。

## 验收与停止边界

精确API/HTTP非金额、既有style_progress读写与撤权；稳定需求数量/单位/歧义/改仓历史；
真实回执丢失/刷新恢复/请求未知/重放不重复；两人并发与 stale preview；历史25条锚定。
Server唯一物流与原算法结果一致，最慢可行/最快仍晚、逐批不同方式/0与7边界、无Hub/无排单/无地点/无路线/无方式。
类型/全lint/相关测试/项目回归/发布基线/顺序真实构建/私有Chromium六宽度，精确main守卫及独立复审。
开始前尚未运行本阶段新测试，不把上一阶段26/45/55/927/116及旧UI结果写成本轮执行。

保护3001/50426/59069/62426及旧卷/Browser/其他工作树；62426仍8175，不升级。
仅自有合成一次性数据库/loopback与私有浏览器，不用真实凭据/Source/账号或业务DB，不安装依赖。
Git664f非零push具体原因未明，相关写入STOP保留；本阶段只读main成功不是写恢复。
不新push/PR/Hosted CI/合并/关闭/部署或Source绑定/激活/调度。D1935/D1933真实额度已用完。
本阶段与正式成衣Source、Server关账及环境收敛分别验收；完整Goal active，不能以本切片代替最终目标。

## 第一个可验证checkpoint

已实现窄化物流读取、可信协议/原请求槽、原物料页Modal/Drawer与会话owner。没有schema/全局CSS/权限目录改动。
新协议/精确数量/真实HTTP物流组合16/16，10846.9011ms，0fail/cancel/skip；包含raw HTTP非金额/备注过滤、采用地点、路线变化、外发、停用Hub及Source失败仍读历史/回执。
首轮10项中8通过/2失败（含父项），原因是测试未断言预期Source采集异常；补正确assert.rejects，未改变采集行为。
类型v2通过；lint初轮23错3警告（render ref），改layout owner后v2余1错1警告（effect同步状态）；改为外部恢复微任务并memo可见状态，v3全量exit0。
独立只读复审发现并关闭4项P2：设置导航守卫、preview tracking/source一致性、129位派生余额、Drawer layout清理前旧401。
实际built浏览器/六宽度、完整回归、精确发布守卫尚未执行，不把本checkpoint称最终PASS。日志保存在outputs/g6e-arrivals-*。

首个应用checkpoint f28762005ee2587ae859a89b1b02c71edaf963f6。前端/Node构建exit0；首次构建仅短SHA，未用于验收，重建完整SHA的build20261021-203457后开始私有Chromium。
首UI尝试因测试误用tracking表名失败；v2实际发现刷新期间仍可打开旧Hub的初始Modal，新增批次停留禁用。入口改为等待当前计划读取完成（不自动改写已开草稿）。相关从属场景首次未通过，完整日志保留，不将连带失败当独立产品缺陷。测试改为首依赖失败即停，并按单位定位分配字段，避免随机UUID排序假设。
精确main源码守卫f287通过：11页/52能力/75累计UI路径/errors空；不是像素/业务验收。
