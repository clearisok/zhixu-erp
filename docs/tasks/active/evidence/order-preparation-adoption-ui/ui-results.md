# 准备采用页面的精确合成工程证据

核实日期2026-10-15；main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；分支feat/order-effective-attribution。精确源码 `b63d6424dcbfd1076d4f7558ff05a9c1b1cd8280`，源码提交后工作树干净，再构建buildId `order-preparation-ui-20261015-b63d6424`，build-info gitCommit=b63d6424、2026-10-15T08:19:38+08:00、Server/session/writable/snapshot。工程构建不等于部署。本报告冻结后不覆盖，未来结论另建证据版本。

## 已确认代码与测试事实

精确构建后的准备浏览器10/10通过、exit0。9业务子场景+parent：未确认精确报价意向保存不建SO、已认领可信合同采用不改原事实、创建丢成功响应后刷新只恢复原请求、采用丢成功响应离开再返回、过期CAS拒绝、手工血统修订清current但保留历史、撤销quote.view隐藏原ID/选择器、软删Quote保留原参考且不换价格、完整屏幕和七角色。原单与目标合同数量分别115.50/120，差异合法；全体SO/合同镜像/来源链接/交付安排/商业版本逐行快照未改变，只有显式准备/身份/审计新增。

屏幕1920/1536(DPR1.25)/1440/1280/900 fine与390 touch均无页面横向溢出，Modal可滚动、footer可达；跟单可创建/认领后采用，管理员可按现有权限代执行，其余管理者/报价/物控/生产/财务五角色无准备写入口。4新PNG逐张查看，现有Foundation主题/主导航/订单概况保留，非用户人工视觉批准。

本阶段后台23/23、客户端/缓存10/10通过；原页面认领5/加工9/商业4/历史9共27通过。完整无缓存TypeScript、完整lint、Server编译、候选静态build通过；根源码824/824为同阶段checkpoint前候选结果，精确checkpoint后只重跑构建/新浏览器，不冒称再跑全部。父ff89后台完整PG261/归属45是独立历史证据，本阶段不重复宣称。Source workflow YAML和29脚本引用验证、contents:read不变，仅配置，远端CI未运行。

## 真实失败及修复

首轮新测试target重复声明，解析失败（1/1失败）。修名后9/9失败，首个保存回执等待时DOM里重复出现认领卡片/Modal，后续因准备未核对而级联。实际是详情相邻identity/material/history/commercial使用相同scopeKey；按语义前缀拆分key后9/9通过，扩展10/10和精确10/10通过。新增单份卡片/无残留弹窗断言，不放松CAS、幂等或数量/价格保护。曾调用不存在test:processing-order-ui只发生npm脚本查找失败；实际test:processing-batches-ui9/9通过。

## 用户决定、AI工程选择与限制

用户决定D121/D129：合同前准备不是正式SO，合同后认领/血统/商业独立，保持原UI，不自动合并部署。D130工程选择：独立tab-scoped未核实命令缓存+本人GET回执；不读写Browser账本/Seed/IndexedDB，不保存凭据或金额，不自动POST，不覆盖未来/损坏缓存。明确稍后核对可离开，刷新/返回原请求；整个标签页被关闭、清理站点或设备丢失不保证此临时缓存仍在，须先查服务端记录，不假定未提交重建业务。旧receipt不能冒称当前血统。

新UI已本地实现与合成验证，不表示远端交付、合并、用户业务/视觉验收、真实来源激活或18443/18444部署。G1 def98f本次已由用户备用交付回传精确远端SHA；本G4分支未push/未建PR，不借此宣称所有分支网络恢复。没有访问艾诺科凭据、真实账号/DB/Source窗口、宁波或现有环境，没有新增迁移或真实归一。G4整合/独立PR复审与G5仍待，整个Goal未完成。

## 全新图像身份

| 文件（screenshots-b63d6424/） | SHA256 |
| --- | --- |
| prepare-explicit-quote-desktop | `75d572b3e00edec100f1fa35736596b0dc1d0a9d2674d207e4e012198d161cfc` |
| adopt-preview-desktop | `82a9682d291481de5bd80ab5d37d121a690092fa9569b72913490e566d392538` |
| adopted-preparation-mobile | `9987af1eaa77c68fbb889d223e753344d752b9973d62891805f0f77080cf7418` |
| adopt-candidates-mobile | `011aaa9d24df42b71385e5f8c51b9aa3878db7d7dbedbcba88fc2af6b28de268` |

更新时机：代码/API/权限/缓存或UI行为变化时，以新路径/新证据ID前向记录；GitHub PR/CI/人工验收和部署事实分别更新，不重写本报告。
