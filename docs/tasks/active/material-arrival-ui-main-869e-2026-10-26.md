# 当前main物料分批到料界面整合

root唯一writer，既有独立审查者只读。

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T04:35:24.589Z独立API核实，开放PR为0；branch codex/material-arrival-ui-main-869e从该main创建，显式快进已审0039后台201ac270cf75cf983dd27dd17eb82836fe2ea3aa后普通合流原到料界面5f3dc11df3270fceef14227c0a005220bd570145。全部非docs逐blob等于驱动源码abf3bf774124934b9372586d079308a120d6980d；产品逐blob等于a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad，唯独原material-arrivals-ui集成测试驱动已作abf3触摸补验。

## 业务与交互

原Server物料卡片新增分批到料入口，沿用Modal、历史Drawer和唯一material-logistics-service，不新建导航或第二套物流算法。每批填写到已明确持久化集货仓日期和逐需求数量，可部分未安排；Source交期、人工计划和实际四流分别保留。运输建议取最早未取消排单的采用地点快照，路线当前版本只用于测算，不伪称已冻结到仓或实际出运；buffer与距上线分列。缺仓、来源、路线或唯一匹配时明确提示，不推断默认值。

复用0039权限、CAS、预览和同事务回执；actor/tab原请求先完整保存读回再提交。刷新只核对，未知回执不自动重发；改身份/订单/抽屉/来源后的迟到结果不能污染新草稿。依据更新暂停旧建议并保留输入；保存后重新读取。来源不可用仍能读旧计划、25条锚定历史和核对原请求。物流DTO只给必要非金额事实，不泄露联系人、备注或其他排单。客户端完整响应1MiB与PG原8192/24576预算保持，不扩大0039。

## 合流和证据归属

共同祖先557ce；直接普通合流，保留全部父清单、N/B/L与11c6 witness和单一决定叶。原24个新增记录有独立路径，新增UI契约保留eb2冻结字节，原后台契约仍为761字节；已修正的387/56不回退成f7候选386/56。当前合并清单400/56/21routes，48份继承UI记录不动，本阶段10路径V1只更新base/link，原JSON归档。

原产品archive SHA256 65ee4546cc20e65b171fbf585ec51e2596dd9b261c34c565d2108ae8ce3daa24和driver archive SHA256 314592182747b0b0c0f8a65121dca8f7d18bf20983ee8d1cf3bcd52037c58be8已核对；原a0c3的97相关单元/SQL/API、根811、类型/Node/load/lint与双构建，before3/abf3 after17/物料10/导航18共48浏览器全部实际通过。18PNG/3JSON、8图查看及proof e2a0089fd9063dae77de0eccbd3ac1d4126994cf保持原字节、日期与source范围。修正元数据后的9d5da9发布134/134（400362ms）与5f3旧base守卫保留；初f7候选和1001颜色容量red/green不是本轮新验收。仅Browser产物的users路由preload hint告警照原产物记录保留，不冒称零告警。本轮不重跑未变测试、构建或浏览器，只在最终commit后新跑精确N源码守卫；正式PR仍需当前发布134与必要三CI。

原后台218项217通过/1既有Windows平台SKIP仍独立未验证；Linux Source CLI与原557ce逐blob未变，当前97、48浏览器及旧134均不能覆盖该缺口。必要Linux CI是未来合并前置，不以源码守卫替代运行验收。

原[UI任务](server-material-arrival-ui-current-2026-10-24.md)、[工程证明](../completed/2026-10-24-material-arrival-ui-current-engineering.md)和[UI契约](../../features/SERVER_MATERIAL_ARRIVAL_UI.md)保持原source/driver/日期/失败与限制。最终commit、精确N守卫和本轮独立复审按outputs/material-arrival-ui-main-869e-20261026同HEAD终态核定；准备时尚未完成，不预写PASS。

## 完整目标与执行限制

H0d70精确交付授权保留；本分支实际Execute/Push/新PR/Hosted为0。普通PowerShell也复现TLS中断，根因未确认，不重复未改变通道、不修改共享代理/TLS/认证，不把H授权扩展为本分支远端写入授权。不自动merge/close。

没有新凭据、真实Source请求、账号、业务库、对象/卷/备份写入，不触Browser持久账本，不安装依赖或应用迁移，不替换3001/50426/59069/62426等入口，不部署、激活、调度或退役。原201ac/1b47/7db/588d/81f及38580受保护镜像分支和所有旧结果保持；未来持久化演练须复用38580已审归属保护harness，不执行业务分支继承的旧驱动。

完整G1–G8/R active。下一步沿0040/41成衣出运观察、0042交期维护继续；订单出货事件身份、Server关账三问、目标切换、真实Source额度/激活、人验与退役分别有独立Gate。本地界面整合不冒称部署或业务闭环完成。
