# Server成衣出货只读界面

## 当前范围与数据owner

2026-10-24；D147/D152/D153，基于[已冻结0040后台](SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)和当前0041。这里只在原正式订单详情接入只读区块/历史抽屉，复用当前orderRead与可信session；不新建导航/写入口、不调用Source HTTP、不写产出/订单数量/商业价或关账。后台feature保留原696冻结字节，前后阶段状态按各自日期解释。新UI工程结果见下方独立冻结证据；发布和最终守卫仍后置。

Num/outdate为原观察的精确数量和业务日期，保留单位、原单据、其他日期/累计列与来源trace；零/负/未知/非法分开，不将观察累加成事件账，不把空结果/消失当取消。未匹配/重名/缺失颜色提示，不填生产方或价格。加工不适用、未连接、未采集和身份变化各自显示。

## 协议、时效与身份

纯model的可见字段、数量/日期投影在客户端/服务端共用，既有精度/业务含义不变；严格DTO shape/byte/行/游标检查，不接内部原始input或wxprice等金额。普通当前/历史/detail均是现有DB-only GET，no-store；分页保留25锚点，空页仍可按合法cursor继续。

读模型增加expiresAt，严格取原快照observedFrom+当时freshness_ms，不用当前target延长历史。客户端使用请求经过时间及单调时钟保守减去已消耗时间；时钟/上限异常不延长fresh，过期保留内容并标识，targetPolicyChanged/colorBasisChanged保持。没有默认时效。

layout token+epoch+sequence与真实session联合所有权，scope文本相同也不能接纳旧A回复；关闭/卸载/换单/换身份使旧200/401失效，不清新页面或退出新session。历史打开前核current与权限，失效清区块；请求abort不是权限或写入回滚证据。无localStorage/IndexedDB业务读写、Browser fallback或新缓存。

## 原页面交互与验收

默认收起，展开读取当前指定观察；显示原快照时间、过期/依据变化，原批次/历史按明示入口查看。桌面使用现有表格，手机历史用原Foundation卡片保持长数量/日期可读。保持当前订单详情/物料/交期/价格操作，不引调价。

新driver修复精确构建身份及自有Chromium退出确认、原子enabled+click，before渲染精确a0c3、after精确本轮source；产品/driver/渲染SHA分开。补客户端/真实HTTP、双构建/产物、before零出货请求/写入、after TTL/历史/迟到/ABA/401/403/七角色、六宽/DPR/touch及原订单/物料导航回归；证据按实际SHA另冻结，不借旧4066/a21结果。这里只记实现范围，不预写PASS。

不新增迁移或改0040/41锁序、容量、回执/owner，不读取真实凭据/Source、不绑定/激活/调度/部署，不改现有体验库。完整Goal和后续0042/43及关账待决项独立。

## 当前隔离工程证据

2026-10-24 source 922488b9474daeed8abc2204e21f6ffeefc39955，本轮102相关API/客户端/升级、根811、类型/Node/lint、双构建/产物、before3/after14/物料与导航28均通过。23PNG/3JSON、六宽/DPR及390实际CDP touch，9图已查看；原始lint生成目录污染失败及仅lint修正补跑均保留，未变Python139只范围复用。详见[本轮证明](../tasks/completed/2026-10-24-garment-read-ui-current-engineering.md)。发布134、精确main守卫和独立终审后置，不借本条声称Hosted CI/合并/部署/真实Source或人工接受。
