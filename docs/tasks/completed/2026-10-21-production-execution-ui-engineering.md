# Server生产执行页面：隔离工程证据

2026-10-21；D147/Gate6C，用户明确的D151两项规则不再等待确认。
root唯一writer，独立reviewer只读；不合并、部署、改真实账号或业务库，不升级既有体验入口。

## 精确源码和范围

main独立API核实996dfedc12da3527343cd3ff2aa5eea35497e10e；新分支codex/server-production-execution-ui
从该main建立并显式FF至d207b1a2d116f92d542499b5e21c933e0d2d5a23，无继承dirty。
d207后端已一次送达/独立exact，Source39530058362、Team39530065617、Baseline39530073595
均success/attempt1；这是后端历史，不借它称本页面远端成功。

页面首源c7e58563c6bf645cac01a454ec196f90c16c5c32，手机footer修复29410ac553f93f8c11089772446bd27429418330，
最终应用/验收源码27b3f08febdbe76e9253e8db5d30855faa26346f。后续证据/状态/清单提交不改应用字节。
新增UI契约和工程记录各自冻结为新文档，不改原0035/0036阶段新根证据、不覆盖旧PNG/ID。

仍使用同一排单路由和计划/执行API、同一命令事务/审计与原actor/tab未决槽。新增执行读取/预览/确认、
更正原因、双权限联动、独立历史；取消产出保留原执行方，剩余新排。没有第二套价格/数量/日期计算或Browser回退。
唯一后端增量是纯函数参数由StoredAssignment缩窄到实际所需公共Assignment的type-only修改，不补造resourceFacts，
没有新迁移、默认权限、主资料或业务Seed。

## 本切片实际检查

| 检查 | 实际结果 | 范围 |
| --- | --- | --- |
| 计划/执行客户端、表单、未决槽 | 35/35，2447ms | 新精确事实/回执/历史/缓存，含原全部27；其函数字节此后未改 |
| 计划/执行契约、纯预览、真实PG/HTTP、升级组合 | 98/98，53864.8409ms | 含类型缩窄，0036实际保护与旧计划回归；其运行时字节此后未改 |
| 全量TypeScript、全量lint | PASS | 最终27b源，g6c-ui-27b-typecheck/lint日志 |
| 显式Server frontend build、顺序Node编译/真实模块导入 | PASS | 最终27b；build-info为server/session/writable/snapshot，未并行清dist |
| built排单/执行与恢复/六尺寸 | 28/28，62842.4468ms | 最终27b；27子场景＋父，0失败/取消/跳过 |
| 首源main996最小守卫 | PASS，11页/50能力/63累计UI路径 | c7e阶段；新证据/能力绑定后的最终完整门禁另在active任务核实 |

本记录不提前宣称尚未完成的最终项目/显式基线、远端交付、CI、合并、部署或人工验收。
full PostgreSQL全仓回归未在本UI切片重跑；最小相关98是实际本轮执行，不借旧261。

## 真实浏览器场景

现有server/integration/production-scheduling-ui.integration.test.mjs仍创建自己的随机一次性PG、loopback HTTP、
私有Chromium profile，完成后只清理其自有目标；没有用户标签页、Browser长期资料或业务库写入。
保留原计划15业务场景，新增：

- 数量/实际日期空白，不以计划或今天补造；记录12.5、0、9007199254740993.001保持精确。
- 非必需queue读取422后仍可仅登记本单；明确联动才GET队列，失败不POST、不静默降级。
- 双击只发一次；版本冲突有拒绝回执、保留输入，重新读取后再次预览。
- 更正为零仍锁执行方、颜色和位置；完成/计划日期独立；取消剩余保留产出，新Assignment另承接余量。
- complete-only可仅登记，edit-only不能登记；联动缺任一权限403，已保存回执fresh复核双权限。
- 本单与后续变更在一个operationId/事务，前序/固定/历史只读不改；后续各订单和颜色明确预览。
- 丢回执、错误hash、刷新、未发送原命令、未知后明确重试和撤权保留精确缓存；没有自动POST。
- POST/回执200和401跨A→B→A，旧响应不清新缓存、不退出新登录、不继承旧unknown许可。
- 不存在的回执只表示未找到；重试仍fresh鉴权，撤销edit后不能靠unknown写联动命令。
- 停用外发厂仍可按原已采用事实登记；不出现成衣价、工价、外发裸价或币种。
- 独立执行asOfVersion/50条分页，追加不挤旧页；冻结订单只读实际历史。

1920、1536 DPR1.25、1440、1280、900、390各检查队列、计划表单、执行表单、执行预览及内部四按钮，
合计30份几何记录；包括字段/按钮边界、不重叠、表头实际display和前后列对齐。页面宽度不替代按钮/列检查。
root实看最终390执行预览与linked-preview，及前一相同footer字节的390内部四按钮/1536外发；仅工程像素核对，非用户接受。

## 本机证据与历史失败

最终材料在ignored outputs/production-planning-ui/27b3f08febdbe76e9253e8db5d30855faa26346f-1792551815022/，
build20261021-110310；build-and-checks.json有30几何和空异常数组，测试另断言服务端无非预期异常/Browser sentinel不变。
原历史PNG/截图哈希完全保持。本机材料不作为自动更新截图基线；选定SHA256：

| 文件 | SHA256 |
| --- | --- |
| actual-internal-390.png | dda6a981d20f0ddb53f9770977021bff1081631674b503bf2cb4564c946f9bfb |
| actual-form-1536.png | e8fd3702bfa8e6d109fe47322ab3eaa1cd922fbf709a9a6d931ca13fa2c1b19c |
| actual-preview-390.png | 95a51031e3b545d30167b28e0c6f16e5f960eeb49e281a59ba52c4fc7dc0c293 |
| actual-linked-preview.png | c9d3e2084c0befbb562e38e96101ed3555d2cab3482d3308eeb0d654f171f3d2 |
| actual-anchored-history.png | b868b12af41f92026f75de68f6b11bbaa3e97c76e0f2814142ca079b98145c24 |

首TS参数过窄已仅改类型；独立复审P2“仅登记被非必需queue失败阻断”通过懒读修复并负测。
首built13通过/2失败（含父）是旧撤权角色意外保留新增complete；第二轮17/2是测试直接选择分页外组。
两项修正均为合成前置/选择方式，不放松产品保护。第三轮c7e28通过，但尚未验证内部四按钮。
增强后第四轮26/2真实发现390取消按钮x=-34；294 scoped footer换行后28通过。
root像素复核再发现旧通用队列表格在767以下隐藏表头、错排前值，27b仅执行预览scope恢复三列并增强六尺寸断言。
最终28通过；这些早期结果、失败日志及旧图各按其source/范围保存，不覆盖或扩大结论。

## 未完成边界

新切片尚未合并、部署、人工接受；成衣出货、物流、Server关账及完整ERP仍未闭环。下一Gate7成衣出货时点
已询问用户，未答不写其身份/schema/数量假设。未来CNY销售/USD工价仍分开，不换汇、不重标历史。
保留#120–127原头/draft，不建重复累计业务PR，不merge/close。62426仍Gate1源8175；3001/50426/59069、
旧卷/工作树/Browser均保持。没有真实账号/业务库或新增艾诺科读取/绑定/激活/调度/资产退役。
