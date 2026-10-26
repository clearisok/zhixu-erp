# 当前状态：人工预计到仓后台本地整合

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T04:19:08.956Z独立API核实，开放PR为0；branch codex/material-arrivals-main-869e从该main创建，显式快进已审订单物流弹窗1b47fb2b646a5c1347a377cf44c9b5cff25db37e后普通合流原0039后台557ce07bb71195f1fef9cec9e10f3cf8b55b4add。全部非docs逐blob等于已验收源码c994eac8aee32f9e6877fa81e65a604376760519。

人工ExpectedArrivalBatch/Allocation由server/material-arrivals独立拥有；来源快照、人工计划和实际入库分离。只取明确持久化Hub，Source供应交期不自动变成到仓日期。一项需求可分多批，部分未安排合法；正十进制逐需求比较，不跨单位总计，不自动补齐、换算或截断。稳定UUID保留完整业务身份，数量变化可唯一重识别；规格/颜色/单位、厂供、歧义或缺失均保留旧计划并提示核对。

原c994 canonical archive SHA256 3c45c607c83f1bb549f0ae446d346bf400b3c99b165c2588bf5dc96cd0e0d773、24文件218项相关测试（217通过/1既有Windows平台SKIP，0fail/cancel）、根811及类型/Node/load/lint实际记录已核对；proof 761267deb29796206de5492fa01bb79a417680b1原字节保持。跳过的是原Linux Source CLI集成场景，原guard和CLI blob不变，未验证路径不称通过，必要Linux CI仍是未来合并前置。原49aa9b发布134和557ce旧base守卫保留其日期及范围，不能覆盖该SKIP。本轮不重跑未变API、构建或浏览器；最终commit只新跑精确N源码守卫，正式PR仍须当前发布134和必要三CI。

376证据/55能力/21Server路由保持原状态；最终精确N守卫及独立复审按同HEAD final.json核定。UI类型只有新增联合成员，V0只更新base/link，原47份UI影响记录保留。

H0d70精确交付授权保留，Execute/Push/新PR/Hosted仍0；普通PowerShell亦复现TLS失败，根因未确认，不重复未改变通道探测、不改共享代理/TLS/认证，不把H授权扩展到本分支。没有自动合并/关闭PR。

本阶段没有新凭据/真实Source/账号/业务库/对象/卷/备份操作，不替换3001/50426/59069/62426入口，不激活、调度、部署或退役。原1b47/7db/588d/81f和38580受保护镜像分支及旧结果保持；未使用继承的旧persistent演练驱动，未来镜像演练须复用38580已审归属保护harness。

[阶段](tasks/active/material-arrivals-main-869e-2026-10-26.md)。完整Goal active；预计到仓UI和后续物流/出运/交期仍待，后台切片不冒称用户业务接受。
