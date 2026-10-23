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

UI v3在61e9完整构建上确认双击保存只写一笔，但第二次本地动作抢走首动作lease导致弹窗未关闭；新增弹窗同步inFlight锁，预览/重读/保存/关闭共用，后台幂等不变。类型与定向lint通过，仍需实际复验。

## built页面验收进展

应用最终修复a290edfe3ba26173e21e0c4df08f35be48fe16f4，前端/Node均exit0。v4前三项通过，丢回执用例过早按“待核对”横幅检查数据库，横幅在POST前就出现；改等明确丢回复错误后核对，并未改生产行为。v5六项通过，后续失败因测试误用另一页面登录按钮名称，改提交本页面真实登录form。
v6私有Chromium11/11（含父项），19044.6331ms，0fail/cancel/skip：六宽度、分单位部分安排、双击一笔、dirty设置导航、COMMIT后丢回执/刷新不POST、摘要不符保留、unknown明确同UUID重试、close MutationObserver旧401、历史ABA、POST/receipt成功与401四种ABA、Source失败仍读历史、只读与无金额端点/Browser回退。不是开发模式StrictMode双effect实测。
扩展后的npm run test:material-arrivals为42/42，40820.6286ms，0fail/cancel/skip。新增测试已加入同一CI脚本，built用例加入已有Source工作流（未声称Hosted CI已跑）。截图版补局部表格滚动，完整项目/发布检查与最终证据仍在收口。

截图版首次11/11，27253.3997ms，保留原输出；桌面1440和手机390已实际查看，原Modal内滚动/固定底部/分单位无溢出。后补CDP有界收口及明确清空后13/13，19973.6373ms；首次clear用例误点loading禁用按钮，补等待后通过。
应用a290上的完整项目927/927，237811.5565ms；发布116/116，236006.0124ms；最终类型与全lint exit0。随后复审确认Source自动刷新未联动到料GET的读漂移，作为新产品修复继续验证，以上结果保持原时点不冒称修复后。
最小联动使用useOrderMaterial稳定完成对象（连续同错误仍有新对象）触发现有GET，无新计时器/采集/POST。旧草稿和scope保留，来源/tracking/logistics事实变化暂停建议，明确重读后继续；自动GET失败同样不继续显示旧建议，原请求独立。

14a71172168fe429c187dadef2f3b654198c3394/build20261021-210416：完整SHA前端及Node构建、类型/全lint通过；新增联动built14/14，26495.5818ms。补两次真实响应后受控503的固定error分支，最终截图版15/15（含父项），23964.5257ms，0fail/cancel/skip；保存到独立final-reviewed目录，不覆盖先前截图。Source_failed HTTP200与HTTP503两条路径分开验证。
原排序/事件UI组合首轮24中22通过/2失败（含父项），43574.8498ms：旧设置宽度测试在Emulation变化后未等React/布局帧，输入边界立即断言失败；原CSS/设置产品无改动。补两帧稳定后保持原断言并增加实际geometry诊断，原UI10/10，16812.2166ms；七角色、事件单位/多余仓、排序、并发/丢回执/撤权均通过。
14a后完整项目927/927，188351.7322ms；类型/全lint exit0。独立GH main复核仍996完整SHA，未刷新或改写业务环境。独立审查已确认自动完成信号、旧建议暂停与CDP异常收口无新产品阻断；最终证据登记/发布检查收口继续。

证据报告/四PNG已冻结ee14615fd2d5ccc64984f2bda41041a05d6355b9；manifest仅新增5项为252，能力仍52，既有manual-arrival扩展页面/物流及七维。初metadata守卫因isolatedTest混入截图引用报STATUS_EVIDENCE_KIND，按既有document-only契约改为只引报告；图片仍在能力总evidence中，无应用变化。v2守卫PASS：checkedHead ee14615f，11页/52能力/76累计UI路径/errors空。
逐对象核实输入689afa的全部247证据、其他51能力、pages/CSS/responsive/routes/runtime/limitations完全相同；三摘要归档与输入Git字节一致。首次最终release在初metadata错误时已开始，不能用其结果冒称修正后整套PASS；终态后在正确metadata上重跑并另记。

## 最终metadata验收与边界

第一次最终release在错误metadata启动，99项中87通过/12失败，169370.2198ms，错误为STATUS_EVIDENCE_KIND；不作为修正后结果。修正只让七维指向已冻结文档，未改应用、报告或PNG。f6cd430eaa77f88d492478350ef12eb1493abbbb干净checkpoint上重跑：npm run test:release-baseline **116/116**，195751.0199ms，0fail/cancel/skip。同一完整HEAD的精确main守卫PASS，11页/52能力/76累计UI路径/errors空。
独立只读最终复审确认252证据的Git/blob/哈希/源码绑定、旧247证据/其他51能力保持，七维无合并/部署/人工接受越界；未代跑测试或网络。冻结报告ee14615f及四PNG不改，后续结果只在本任务/root摘要记录。
只读检查127.0.0.1:62426/build-info.json为HttpRequestException，localhost同路径5秒为TaskCanceledException，当前READY无法验证；不据此判定资产丢失或变更源码，保留Gate1/8175历史观察，未启动/停机/替换旧入口。docker只读可见两临时命名容器创建于2026-10-19，非本阶段创建，归属未核验且未清理。
本阶段LOCAL ENGINEERING PASS，REMOTE DELIVERY仍未做新push/PR/Hosted CI；664f写STOP原因未明，不重试/切认证/改共享配置。无真实Source/业务数据库/账号变更、绑定/激活/调度、合并或部署。完整Goal继续，正式成衣Source身份/颜色/冲销、Server关账、环境及用户验收未完成。
