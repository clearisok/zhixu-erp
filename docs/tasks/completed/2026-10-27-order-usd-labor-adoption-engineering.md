# Gate8C USD工价明确采用：冻结工程证明

2026-10-27；本地后端切片，不是远端、正式部署或完整关账闭环。

分支 codex/order-usd-labor-adoption-main-869e；最后核实main 869ee84dd0b31de6161011e4aa560678b244a64d（未fetch）；父Gate8B f080263ab681afdb79b20df3200ca027a96ec234。初始精确源码S 34547801fd818f5f6777809f11c09ddd574688c2，根类型测试修正e02b2b287263c4dbf0548e1467556df4c885b370；仅归一错误优先级修正f9e2017c9fb185c45e6d6cdc7fd8f40ff0bb5fdd；最终源码S4 7afc5bb3a38784bd44dc539dbf1104143ae49fb2。S4相对f9仅修合成预升级夹具并补反例。两次后继归档各3043 Git blob全核对，0overlay、既有依赖junction，无安装。

D162 CNY→USD confirmed labor conversion only; same Quote/fixed PV/trusted successor/unchanged product, exact USD no-op only, immutable order commercial versions and separate work provenance, original sale/product/batch/closing preserved. No general USD→USD adoption, free labor price, FX, UI, tax correction, live data, deployment or source activation.

## 规则与实现

新确认从保存PV记录确认时币种，旧缺失不猜测；已有确认不直接改币种，原确认及创建审计不可覆盖。后继逐步匹配唯一专用创建凭据、同Quote固定PV并比较完整业务产品；未知字段保持比较，真实configuration六字段含freight仅作技术来源。CCT优先包括null；不放宽其独立关联规则。零USD有效，不推算换汇。

仅原CNY行采用USD；原USD只有金额和完整凭据相同的no-op，混合越界整单拒绝。复用原不可变商业版本，原source/product/hash/sale/quantity及未选行不变；labor_confirmation_source只保存工价凭据，后续成衣议价保留。加工原consumption/商业快照永久存在；新line-item头不是重建批次。历史统一工价按exact旧version读取。

0046不回填旧数据。可信会话、fresh RBAC、商业head/Quote/CCT CAS、原请求共享锁、原子版本/head/审计/receipt、未知COMMIT及暂停重放保护。权限不推导售价/成本。归一新直接引用/完整行指纹及部分schema拒绝保持，不开放归一执行。

## 验证与分源

- S精确归档811项目、Server build、相关lint通过；原npm build通过11253ms。最初runner误猜CLI路径失败，原件保留，随后只用真实package build脚本，未改依赖/代码。
- S数据库/HTTP/模型整组191项，189通过、2失败为同一归一fixture的子项和父项。该fixture模拟隐藏0028两表，却保留依赖0046回执表；fail-closed防守正确。先保留既有color错误优先级，再将完整旧版本夹具一并隐藏新依赖，另补列/表部分升级反例。S3三归一组中其余33通过；S4只重跑改动的归一preview组13/13。按文件组替换后共192项，无剩余失败，不将前次部分成功或重跑重复相加。完整USD组含29项，真实HTTP覆盖三种越界的409、持久拒绝回执及订单不变。
- S2与S4根类型通过；初次根类型失败仅新测试preview union未收窄。S4相关lint通过，S3新Server build通过；只复测受影响项，未重跑已过811项目或无关报价组。
- 非空45→46保留原商业行和消费；44→当前按原列逐项比对并明确新证据列全NULL。新版本、旧CNY、颜色/其他SO、售价调整后来源、CCT空值、两级可信后继、伪造/重复创建凭据、COMMIT回执丢失、审计原子失败、冻结SO、锁定关账旧快照与完整owned dump/restore均有正负控。新库只用随机owned tmpfs容器，恢复只进另一个新的空库，全行指纹与ledger不变。
- 独立只读静态终审0 P1/P2；审查者未运行测试。最后schema夹具修复无guard放宽。当前没有新UI，所以无新像素/人工验收；optional确认字段V0无DOM/CSS/Browser仓储、Seed、key或schema迁移。

## 保护与限制

旧50容器/179卷/27网络及111旧refs所选元数据保持，不是旧业务内容审计。3001/50426/59069/62426、Browser数据、备份均未操作。已在原source CI job登记两个测试命令，不新增job/触发器或重复检查；本次Hosted runs 0。

Git/ref写0，PR130原远端617及旧3/3不代表本阶段。STOP_AUTH_OR_DIVERGENCE退出1根因UNRESOLVED，不因新SHA解除。发布测试与精确HEAD守卫另见后续独立回执，不预先宣称通过。完整Goal仍active，后续为报价USD采用交互、关账UI、税率更正、人工接受及受控上线。

## 本机原件SHA256

start.json：ca4a984c13d9f76fb572f582af2fb214a6484fb043e9772c36228be768592e92

canonical.json：8ac534430219949ba548f8a0a910697fcaf0fbac7983d9e46002c4a888e402e7

canonical-corrected.json：e532cb4c85421c0df1dea31458a323612b1283b6b72faa6e864b801dffa8be06

canonical-final.json：601e5bf6b491635a6da00e4a65ceba59d2edf2d93870715f646548d3045802f4

canonical-terminal.json：a27c391e470ac89e5402924abf953f504576fe7d170a7666f39c9e28175de006

frontend-build-recovered.json：995feaebbd02b694988c2123e3e6410811c2b4319bac07fe9bdc7cf654003a23

preservation.json：c54a19dae69d864fb1e9c40347d951e09ffb44c1c4ca1f8c4edb23d60a8f1d3c

canonical-affected-integration.log：52cde26b0b726772e62f44e93530de5ccb0ac2823f278512e5c0026cbabec5ea

terminal-normalization-regression.log：6444a36b7029e77419219c8d9f6ad51e8752afdae5fbf68bac6d8f3462c05b62

原件位于outputs/order-usd-labor-adoption-20261027；[契约](../../features/ORDER_USD_LABOR_ADOPTION.md)，[阶段](../active/order-usd-labor-adoption-2026-10-27.md)。所有失败原文保留，不重写旧证据。
