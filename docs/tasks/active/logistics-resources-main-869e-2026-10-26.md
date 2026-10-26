# G6D物流基础资料：当前main本地整合

root唯一writer、既有独立审查者只读。

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T03:27:24.484Z独立API核实，开放PR为0。branch codex/logistics-resources-main-869e从该main干净建立，普通合流原G6D 4f3fd6e20a2f9e0e848ff352ee73cfdf7610740f，已普通合流并保留已审生产执行81f131c993087012689981b86d74d0bb1dff20c5的完整依赖历史。全部非docs逐blob等于已验收源码07d481afcd16fd1fc48ab3c3b3ffa2fe23b741d9。

## 范围与业务保护

复用同一production-resources领域、权限、fresh actor、锁序、父版本CAS、actor/requestId回执与事务审计。hubs和transport-plans仅基础资料，不是物料到仓、运输执行或成衣出货。运输方式稳定身份留原路线，完整子项包含停用项，省略或换父拒绝；启用hub/site/calendar及唯一启用hub-site路线在事务内校验。原四类资源的jsonb实际1MiB容量拒绝保留，新聚合超界回滚后保存小型422回执；未知结果先核原请求，不自动POST。

0037原字节引入空表及约束，0034–0036保持；Browser Repository/key和长期记录不改。页面复用已批准同页卡片/宽抽屉，不新增导航；当前V1仅前向更新精确比较基线及任务链接。25个原非docs增量与旧07d保持，不重写已验收业务代码。

## 合流和验收

先真实B=[当前main,原4f3]保留两侧决定贡献；再普通合流81f执行/规划/资源/G5依赖，保留原F/C/B/L及11c6生产文档同路径witness。每个实际父manifest对象、PNG、原JSON、旧日期/source/hash保持；决定分叉仅在真实双父checkpoint前向记录，不伪造祖先或削弱守卫。

原07d canonical archive SHA256 e039ad8307e678465d7fddb2c2872c67bf4809c913aac3b1f55355f54833ff89、356相关API/升级、根811、before2/after23/导航18以及类型/Node/import/lint和双构建实际回执已核对。14PNG/2原JSON及proof 1b8b22fb643e8ac118a9ed81940a74c8394564c1保留原字节。仅复用成功且未变的原范围，不称本轮新测试；before仍是9c2客户端配07d后台。原64f03a发布134和4f3旧base守卫是2026-10-24结果；本轮最终commit后新跑精确N源码守卫，正式PR前仍需当前发布134和必要CI。

本轮准备时：最终commit/精确N守卫/独立复审尚未完成，不提前PASS。实际终态以outputs/logistics-resources-main-869e-20261026同HEAD回执为准。原[物流任务](server-logistics-resources-current-2026-10-24.md)及[工程证明](../completed/2026-10-24-logistics-resources-current-engineering.md)保留原结果。

## 交付、数据和后续依赖

H订单读取链0d70的精确交付授权仍保留，Execute/Push/新PR/Hosted均0。普通PowerShell同样约5秒TLS失败，具体故障点未确认；当前通道没有新可用证据，不重复探测、不改共享代理/TLS/认证，不把H范围扩大为本分支交付。PR129已单独批准合并，当前没有其他合并或关闭动作。

本阶段不读写现有账号、业务数据库、config、凭据、Source私密报告或对象内容；不应用0037、不替换3001/50426/59069/62426入口、不改Browser存储/卷/备份、不部署或退役。原38580精确main镜像8/8是另一分支的已验证候选，保留其历史，不推定本物流分支部署。

完整G1–G8/R仍active。后续0038订单跟踪、0039物料到仓、0040成衣出运观察、0041刷新前缀再到0042交期，不跳号或重排旧迁移。目标切换、真实Source额度/激活、coverage V2、人验、退役和Server关账待决事项仍分别受控。

## 实际历史合流

第一真实合流B 572d4368c8f9fede5958d3f5bcb888efd75ae034父为main 869ee84dd0b31de6161011e4aa560678b244a64d与独立物流4f3fd6e20a2f9e0e848ff352ee73cfdf7610740f，绑定提交15460f55a240b0bdaf9273ec7c4fede7f93cd9f6已保留两侧决定贡献。第二普通合流保留执行81f131c993087012689981b86d74d0bb1dff20c5及其完整规划、资源、G5和生产文档11c6 witness。两次实际只遇四份状态/清单冲突；全部非docs保持精确07d，最终决定记录绑定前350证据/52能力全部保留。新决定合流随后绑定真实第二merge SHA，不使用未来身份。
