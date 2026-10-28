# PR131 CI契约修复与艾诺科闭环准备

2026-10-28；feat/closing-support-interfaces；phase baseline **c9b87c3ca48de5104f3de4158ce0f434cd3a2d52** clean，main **6479a713e2b80228f008049519ebbd50d10601a8**。最终HEAD从Git核对；[原三摘要/hash](2026-10-28-pr131-ci-source-readiness/input-state.json)保留。只两份测试与状态/发布准备文档，不改产品、SQL、权限、金额、UI或来源范围。

## 原交付与失败

c9经既有c91工具、进程内清空通用/Git专用代理一次上传，4337ms/exit0/独立API exact full SHA，PR131指向c9。全局代理/认证/TLS未变，不把一次成功当永久修复。当前c9完整发布182/182、1007239.7607ms实际通过，原私密回执在outputs/approved-support-flow-20261028/delivery-c9-direct-execute.json及delivery-c9-release-tests.log。

Hosted run40666735485 Release成功；40666735476 source在order-usd-labor-adoption旧create_allocation失败，依赖该步骤的历史断言也失败；40666735781 team在动画登录旧“关账尚未接通”失败。后继skipped不能记为通过，没有手工重跑。

## 修复及实际检查

工价测试保留45→current非空升级和字节保持，补无自动月份回填；实际加工业务另建当前schema新单。从原10件明确调2件入月，再sync_month_outputs验证CNY阻断、USD零价及独立工价财务事实，原8件仍待分月、批次原件保持。锁定测试调入新订单全部100件，先证明两色各50、locked和两条非空快照，采用USD后逐行比较；不用空集合相等冒称历史保护。

登录按snapshot门控验证匿名closing跳转、原returnTo和API401；order-read关闭时仍验证尚未接通。未改产品路由或放宽匿名访问。

| 检查 | 实际结果与边界 |
| --- | --- |
| 首轮修复单文件 | 20/20，27591.3795ms |
| 六文件完整USD套件 | 78/78，71979.033ms，绑定非空快照补强前；其他五文件未再改，结果复用 |
| 独立复审补强 | 指出锁定可能空集合误通过，已加正控；补强中一次误用snapshot.color.id实际18/20（含父节点失败），改真实snapshot.colorId后最终受影响文件20/20，21859.0738ms；不覆盖失败，不称最后重跑全部78 |
| 实际Chromium登录 | 11/11，19959.8067ms；复用a198 canonical Server产物，生产前端自a198未改（仅一份测试差异）；临时junction已移除、原产物保留，未重建 |
| 类型/相关eslint | 通过，最终补强后再检查；不重复无关全仓套件 |
| 独立只读复审 | P2已关闭，本片两测试范围无剩余P1/P2；审阅者未测试、访问数据或来源 |
| 发布 | c9完整182/182复用；guard源码/manifest/冻结feature/UI/SQL/截图未改。最终精确main守卫另跑，不以最小guard冒称业务全量验证 |

## 宁波与Source边界

本轮只读SSH严格主机校验：Linux x86_64/Docker29.8.1、四旧服务健康、根盘剩余194G、可用内存约13.2GiB。公网staging.weaveops.top/build-info与宁波127.0.0.1:3002均200、均精确旧7cd43b6142800bb61827410395c4a2d7a9856bc5；旧staging无当前附件storage/Source配置。无数据库查询、秘密读取、sudo、安装、构建或启停。

物料schedule仅刷新已绑定四流，主信息/颜色、6086941、6086979各有既有独立入口；无Git运行镜像不能冒称满足源码operator的clean/原件要求。65139仍local-empty；历史恢复9/9及合成界面不替代精确目标真实首绑/续刷/人工核对。最短顺序见[发布准备](../active/ningbo-server-closed-loop-readiness-2026-10-28.md)。D105四流前置和D147具体许可保持，本片真实Source请求/激活0；就绪提醒不是部署授权。

最终交付只用已有工具一次，独立核实远端后更新原PR131说明和必要CI；不自动merge/deploy，不改真实业务数据或清理旧资产。未实际发生前此处不预报送达或Hosted通过。

## 同批补齐Hosted未到达的旧升级夹具

在干净checkpoint d38c4b7326ec35a6878253fc2b5ad5a7f2ea013d，本地继续Hosted被前置错误阻断的后半段。首个normalization套件40/42：旧pre-0047模拟隐藏月份表，却保留0049财务link，现行服务正确拒绝closing_month_financial_schema_incomplete。只补测试：先断言该依赖错误，再同时隐藏从属link，最后验证完整旧schema可选。修后42/42（25929.8014ms）、相关eslint/diff通过；不修改产品、不恢复已退役的公开归一操作。原失败和后半段日志保留outputs/approved-support-flow-20261028/d38-source-ci-continuation.log/json。其余未到达命令按接下来实际结果分别记录，不预报通过。
