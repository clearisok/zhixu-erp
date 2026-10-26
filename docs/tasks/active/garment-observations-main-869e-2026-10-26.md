# 当前main成衣出货观察后台整合

root唯一writer，既有独立审查者只读。

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T04:56:38.443Z独立API核实，开放PR为0；branch codex/garment-observations-main-869e从该main创建，显式快进已审分批到料UI 80fdf8ba80c6bfef3321c61d6c8fe8662eb44e22后普通合流真正的当前观察阶段aad673099da0221312a70e88bd8e2f33bfa06244。全部非docs逐blob等于已验收source d1930a2da590098f70e6433892eab350a3262e0c，只增加16项原后台增量，没有重引早期修复或混入后续0041/42/43。

## 已批准口径和唯一owner

0040只新增默认关闭的逐合同target、不可变观察/颜色匹配和CAS head；Num是本笔成衣数量、outdate是业务日期，其他日期和累计字段分别保留。缺失/非法/零/负值不混同；颜色按既有稳定身份唯一匹配，歧义不猜。完整两遍观察不是跨次事件账，不以消失/空结果作取消，不把负数命名冲销，不写生产完成、价格、收入或关账。

读取是可信session下DB-only、no-store的当前/25项历史/指定观察详情；只有order.view＋ainuoke.view，发布另需ainuoke.sync，均fresh检查。默认disabled开关不因物料源开启而推导；内部prepare/publish没有公开writer、采集或激活入口。完整物理SO与profile锁、有效归属、颜色FK、JSONB实际容量、原捕获精确回执和COMMIT未知边界保留。普通DTO不返回wxprice、备注或内部input。

本轮只读预检先挡住旧b652整条历史：它会改变16路径范围外32项已验收代码。未动工作树、未采纳该merge；转用已完成当前前移的aad/d193，阻断和定位证据保存在outputs/garment-observations-main-869e-20261026/raw-input-rejected.json，不重复旧API/网络。

## 合流和验收归属

初仅给B加一条mergeOf的计划被独立复审判P2：缺696对N的直接父见证。未运行旧bind-evidence.mjs、未改guard或原对象。已用真实A=[N,aad]及R绑定修正ancestry，再普通合流R回保护B；当前404/57有两个预期叶，随后以本真实合流L冻结文本并前向绑定最终mergeOf，形成405/57单叶。原父对象、49份继承UI、全部0034–0040和冻结feature/proof均保留。

原d193 archive SHA256 58adb7b1db317c04e758ca9deb8f9a710ecbbf5e0bb9a8e5b18e538ff1799e36、19文件174项相关单元/SQL/API（173通过/1既有Linux Source CLI Windows平台SKIP，150909ms）、根811、139离线Python及类型/Node实际load/lint已核对。proof 696738e5b21a57a4d82e3c1e7b610f96c361f8c1保留原日期、源码和失败记录；0039非空升级只证明已有SO与Source逐表保护，未预置人工到料计划。前端和锁文件未变，原a0c3的215复制产物hash一致，没有新Vite或浏览器验收。原4e8232发布134/134（406504ms）及aad旧base守卫保持历史归属。本轮不重跑未变测试，只在最终提交绑定后新跑精确N源码守卫；正式PR仍须当前发布134与必要三CI，不能用旧134覆盖Linux缺口。

原[当前任务](server-garment-observations-current-2026-10-24.md)、[观察契约](../../features/SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)及[工程证明](../completed/2026-10-24-garment-observations-current-engineering.md)冻结内容不改。当前最终checkpoint、文档绑定、精确N守卫及独立复审仍按本阶段同HEAD回执核定；尚未执行的检查不预写PASS。

## 交付与完整目标

普通PowerShell同样复现约5秒TLS中断，具体代理/上游根因仍未定位；未重复原失败通道，未修改共享代理/TLS/认证。H0d70原精确授权保留，本分支Execute/Push/PR/Hosted均0，不自动merge/close。

无新真实Source、凭据、账号、业务库、对象/卷/备份操作，不改Browser持久账本、不安装依赖或执行真实迁移，不切换3001/50426/59069/62426及其他入口，不部署、激活、调度或退役。保留80f/201ac及此前分支、镜像和测试结果；新source工程预算不是新增真实读取许可。

完整G1–G8/R active。下步0041受控已绑定合同刷新，再成衣观察只读UI、0042交期/coverage、0043收集器/目标/操作者；源事件身份及撤销/修正语义仍不能由本观察模型冒充。Server关账三项用户选择、真实Source额度/激活、目标切换、人验与退役分别独立。

## 独立复审P2及实际修复

原单B绑定计划未执行并保留于保护性B 3a1a0955420d659aa23ea1295c314a184df72d85和旧plan/只读复审回执；新方案经独立静态核对，无新产品问题。真实A 4e92b0bfae06923940c3b85cd78fc1714f96444f、R 5670a8869768f9a1cd8189a23c09e52031e328f7已保存；现在合回B，只改根恢复摘要及本阶段记录，源、旧对象、守卫均未改。见[独立A/R记录](garment-observations-main-anchor-869e-2026-10-26.md)。最终仍待实际L、最终绑定、精确N守卫与终审，未预写P2关闭。
