# Server关账持久命令 Gate8B 本地工程证明

2026-10-26开始，2026-10-27冻结。不是正式关账闭环、远端交付、人工体验或部署证明。

## 精确来源

Branch codex/server-closing-commands-main-869e；最后核实main 869ee84dd0b31de6161011e4aa560678b244a64d，本轮未fetch。初始源码S e85107cc6f663f74ede421a1e59e703e8dd2310b；仅历史测试union收窄及接力修正后的精确源码S2 1e6b21f72ab4c6adbca6ce5ffd36cc85019ae4df，tree 4a1557e6cb4d34f1d96abfa810c385bd4a655462。应用/SQL/模型/完整性测试及811项目测试blob完全相同；两版原件均保留。父Gate8A b0ceeb50fa75fa6862fdfa5c29f5980ac2e5a2bf。

D162/D163 Server backend only: manual month/quantity/color/executor, immutable adopted commercial snapshots, CNY sales and separate USD labor/processing-service, no FX, atomic review/confirm/lock/reopen and original receipts. No closing UI, USD-new-price adoption, tax-rate correction, live database, cutover, Source activation or deployment.

0045只新增七张空表，版本/身份不可变、head前进、精确FK引用商业/颜色/计划/执行/原请求。期间税率创建时显式固定；一条归属一份数量，共享显式渠道，金额为精确分数，汇总后half-up显示6位，不跨币种相加。review仅更新reviewBasis；void/reopen不依赖当前价格/启用资源。旧新渠道权限并集、fresh RBAC、锁等待后READ COMMITTED重读、原子审计/回执及COMMIT未知保护保持。

## 实际验证与复用范围

- 15模型通过；14命令PG/可信HTTP通过，11655ms；7并发/恢复在精确S归档再次通过；70旧依据/归一相关回归通过，42376ms。合计106个定向检查，0未解决失败，不把旧失败的部分成功重复计数。
- 非空44→45升级对原公共表逐表hash及原migration ledger不变，重跑migrations无新增；fixture显式追加0045且与磁盘清单一致。
- 同请求和期间确认/新增竞争、实际PG锁等待期间正式议价导致旧预览拒绝、首次完成与后续更正、复核不重价/数量、确认/锁后更正、旧locked清单分页、CNY仅阻工价、加工服务零价、权限撤销与独立金额过滤、COMMIT回执丢失、审计故障原子回滚均有实际正负控。
- 归一直接引用/heads/period/history/commands/audit完整行指纹、历史locked要求财务核对、部分schema失败关闭；不开放执行或移动流水。
- 完整备份/恢复仅在同一新owned tmpfs PG容器的另一新空DB：恢复前零公共表，恢复后全部公共表原行hash/count、全部sequence last_value/is_called、原ID/回执/期间投影相同；登录/写入前比较，不重建身份。没有覆盖旧库、卷、备份或账号。
- Canonical 3028个Git blob逐字核对，0overlay，既有node_modules junction、未安装依赖。S上811项目、Server build、changed lint及7完整性测试通过；初次root typecheck只发现历史测试union未收窄。S2再次精确归档补root typecheck及该测试lint通过，未重跑源码完全未变的已过四项。
- 独立只读静态复审指出PG JSONB字节预算与migration ledger两项P2，已修复、窄复审无剩余P1/P2。真实PG预算用compact<=16KiB但jsonb>16KiB输入核验：preview/submit均422、无业务/回执写入；NUL/未配对Unicode400，合法中文/控制字符可保存。不放宽SQL限额。审查者未运行测试，不把静态审查写成其测试PASS。

## 保留失败

初次模型大数预期常量错误、备注断言误涵另一条有权查看记录，以及预算测试误读HTTP错误封装均已修正；后两次故障原始结果保留，不冒称产品泄漏或已通过。首次canonical根类型失败保留，应用代码不变；S2补足后才合并工程结果。前Gate8A旧ignored冲突、超时和archive缺Git对象的原件仍保留。最终release tests与精确HEAD守卫在后续独立回执中记录，本文不提前宣称其通过。

## 保护与未完成

旧50容器/179卷/27网络及110分支所选元数据保持；不是旧业务内容审计。3001/50426/59069/62426及Browser保持。全G1–G8/R active，后续为Server关账UI、明确USD工价采用、税率更正、人工接受及受控上线/旧路径退役。

原PR130远端61704afe22fe9fd0ea9f6625c6092fcbb9575dfc和原CI3/3不代表本阶段。本次Hosted runs/Git/ref写/真实Source读取均0。STOP_AUTH_OR_DIVERGENCE根因UNRESOLVED；普通PowerShell旧证据只说明uncertain_transport，不证明同一TLS根因。不因新SHA解除停止规则，无自动合并或部署。

## 本机原件SHA256

start.json：ba30fdee81252bebbd62674563cf48f481d7c3e5292186bcaccc41df3d1c5874

source-checkpoint.json：8839d503a388b6bed4e3eebab8c1dc8f6496feb6281c6b55a3a870c93a915b58

source-corrected.json：e1de7d25f59d7e970821e8c72cc29df0c5833ff89d5a84180fe2a3a1d1a8d473

related-regression.json：8dd6015b3a122d0c871d967980c49294e9670c4e2b3f9bf3a4aa45ffb9e677c7

commands-review-fix.json：c1ae827d895bb325e7c8e07de46eaa3e5d6cd03181e4ab7de649d48651a2f5d1

commands-review-fix-2.json：937385b774ab8d1e7abe57d0bb73e447d9c8d9f303eb85efc08db3050e68de1a

canonical.json：d7297d2eeb81c39f2ca7607627afa68b08d00025f201e20b62316163cc974aee

canonical-corrected.json：c0945af68e232b2922d89b8f30deff6ab407c99afda6b1c88ce150fca4d83960

preservation.json：b24a35953ec3a4f916237ff691d88b884bbc25fcda93f9fc9b84192c2eeb690f

原件outputs/server-closing-commands-20261026。新精确归档SHA256 f50445119a82919647cfee797adc3d2ef88a11931833ddb35435a5c2ccacf931。[契约](../../features/SERVER_CLOSING.md)；[阶段](../active/server-closing-commands-2026-10-26.md)。
