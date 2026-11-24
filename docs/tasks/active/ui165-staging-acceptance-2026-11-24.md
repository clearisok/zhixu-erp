# Issue165 全38项Staging组合验收

2026-11-24；关联Issue165。用户在当前聊天明确批准一次性补送2775aae8、核实六PR的必要CI、专项恢复备份发布门禁，以及独立临时分支组合全部38项后仅部署Staging；不得合并main/正式PR、部署Production、改业务规则/数据/权限或实施10争议。本文件是交付执行记录，不重新调研或重写原整改方案。

## 起始与输入
main经GitHub和fetch再次核实10b9a7d827e1c09f152ead58c21f26712d49a619。原ecceb144工作树clean未动。验收分支codex/ui165-staging-acceptance从已完成组合9802e738889e5a86727fa998874a34224fba2fe7 clean建立；恢复记录另在codex/ui165-staging-recovery从main clean建立，UI实施PR不扩张。

|PR|获批范围|精确输入SHA|
|---|---|---|
|166|规范与原始审查报告|a588f41272d82d7150ecbe4ec685a775693f4eb0|
|167|A7项|19e090bd13efa0fe552587acd3dc5eee2426bd3f|
|168|B4项|83ed26fd65e7aa9f8d05a1260eb0d26c15cb1967|
|169|C1六项|8ab2ef04736a867f21594cfb105c894144bb630e|
|170|C2十一项|07fc0dc74a0524c9109a777674d665449340ee7c|
|171|C3十项|2775aae86584f7a3db634dad658aa3ae46e767c9|

Git恢复命令本轮获用户明确批准后执行一次：DELIVERED_VERIFIED，pushes1，远端精确2775aae8，networkMode NORMAL；未改全局代理/认证/TLS或强推。PR166/167/168/169/170三CI均已核实成功，171新HEAD CI另行记录。

## 组合完整性
[逐文件映射](ui165-combination-paths-2026-11-24.json)记38个产品路径及五PR输入blob；27个单批独占路径精确相同。11个共享路径仅保留双方已批准变更：排单单位+单空态，附件隐藏输入+去重粘贴入口，报价编辑文案+隐藏输入，物料单位+页签/时间，UnsavedDraftDialog参数+去冗余正文，基础资料确认+去横幅，批次复用Checkbox+危险样式，角色共享确认/导航permit+文案/危险样式，报价设置共享确认/导航permit+去来源横幅，报价基础/汇总Checkbox+去教学/业务名称。所有原处理器/字段/权限不变，不存在批次互相覆盖的新替换。最终以必要组合测试及真实运行版本证明兼容性。

原报告原字节从PR166带入，仅用于引用；其“尚未批准”等文字是11月23日历史时点，最新授权与结果以前向记录为准，不改原报告。五份V3影响记录并列，manifest除baselineSha/verifiedAt其余字段与main深比较保持，不改截图hash。38项逐条改动见[实施清单](ui-standards-delivery-2026-11-23.md)。

## 实际集中验收路径
均以https://staging.weaveops.top为前缀，详情从现有记录进入并保留真实UUID，不编造或新增业务记录。

|路径/入口|对应整改|
|---|---|
|全局侧栏、顶栏及未保存确认|G01–G04、G08|
|/quote-center、/quote-center/new、/quote-center/detail?id=现有报价UUID|G05–G08、Q01–Q10|
|/basic-settings/brands、/basic-settings/customer-salespeople|G05、G08、B01|
|/basic-settings/fabrics、/basic-settings/trims|G05、G08、B01–B02|
|/basic-settings/production-groups、/basic-settings/outsource-factories|B03|
|/system-settings/quote-settings|G07–G08、B01|
|/order-center、/order-center/detail?id=现有订单UUID|O01–O02、O04、G07|
|/order-center/style-progress/detail?orderId=现有订单UUID|O03、M01–M02、M04–M05|
|/system-settings/progress-settings，以及物料页已有进度设置入口|M03–M04|
|/production-scheduling|P01–P02|
|/closing-center/detail|G06–G08、C01|
|/system-settings/users（/basic-settings/user-permissions为已有别名）|U01|
|/system-settings/roles|G07–G08、U02–U03|
|/system-settings/ainuoke-sync-records、/system-settings/operation-logs及报价操作记录|L01–L02、Q09|

路径及查询参数最终按现有路由代码/运行页面核实，受权限或无相应业务数据而不可触发的状态单列，不能冒称实机全状态覆盖。

## 不实施的十项争议
D01登录动画/Slogan；D02物料概览与六页签；D03报价组合列宽/截断/默认密度；D04完整SHA与PROD标识；D05四类生产运输资源工作区；D06专用表格改DataTable；D07关账全年和12月卡片；D08全站字号/间距/圆角；D09普通附件删除统一确认；D10每项权限说明收起。

## 验证与部署边界
组合工程、六PR CI、配对备份/恢复门禁、实际部署和用户验收分别记录。尚未部署时不能把现有0752地址当本轮版本；Staging需包含全部38项的唯一组合SHA/镜像/构建，不能只部署C3。原Quote三类失败在main控制组复现的证据保留，不改币种业务或D03布局。备份专项不改UI产品或原失败证据，通过现有正向门禁后才发布。
