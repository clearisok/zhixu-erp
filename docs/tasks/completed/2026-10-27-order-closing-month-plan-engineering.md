# Gate8G1订单月份计划：分源工程证明

2026-10-27；branch `feat/order-closing-month-plan`。源码S：`0969d74c5d5f6dabbd2d095c42824f80be090ab7`，直接父a98fa0cf8511e04b99d0aba943b799a0cecce8d0。本轮只读GitHub再次核实main869ee84dd0b31de6161011e4aa560678b244a64d；没有fetch或远端写，旧origin/main9d65与原Git/ref STOP保留。

## 实现范围

D169按用户的新规则前向替代三项/手工新增目标：两项产值、新SO默认按成衣交期归月、部分/整单调整；加工包含内制与外发，显示范围同时过滤明细和全年汇总。当前只实现0047未定价数量模型、原SO创建事务初始化、内部预览/原子调月/原回执及完整历史引用，不宣称年度金额或界面已完成。

默认月缺失或被冻结保留待分配；高精度/超范围Source numeric原值保留为unsupported，不阻止SO、不舍入；颜色不适合分配时保留全单未匹配量。每个正常调整保持全单及颜色/执行方数量，确认/锁定保护、fresh权限、CAS、完整PG预算、审计与回执同事务。五项实现P2经修复并独立静态复审关闭；见[契约](../../features/SERVER_CLOSING_MONTH_PLAN.md)。

## 分源结果，不能直接相加

| 检查 | 实际结果及边界 |
| --- | --- |
| 初期四文件定向 | 47/47；增加锁序/精度后49/51，其中精度正控拦住遗漏校验，已修，不改旧日志 |
| 完整关账首次 | 121/124；旧迁移断言1项、Windows Docker spawn UNKNOWN 2项（含teardown），不是全绿 |
| 两个受影响关账文件 | 修后29/29，含所有新归月、精度、容量、锁等待、丢COMMIT回执及45→47不回填 |
| 订单六文件首次 | 93/95；旧USD升级断言及父项失败，其他组完成；严格迁移列表改用人工登记fixture，不动态放宽 |
| 两个升级兼容文件 | 修后34/34，含旧关账及USD采用的全部原子/冻结/备份恢复检查 |
| 两入口锁序屏障 | batch、quote_push均通过；A调用真实业务入口，B/C使用相同PG锁模拟生产/商业锁，blocking PID与同CCT try-lock核对，不仅等待计时 |
| 项目回归 | 97个文件811/811；仅排除随后独立执行的两个发布测试文件，无依赖安装 |
| 类型 | 根工作区被原ignored冲突TS样本阻断；首次owned副本另发现三处测试未处理unverified类型，修后3104文件副本通过，最后测试清单适配后的新副本也通过 |
| lint / 编译 | 本片15个TS文件lint通过；Server构建通过，应用源码与构建副本另按哈希核对；没有新前端构建/像素业务验收声明 |

原件在本机`outputs/closing-month-plan-20261027/`：targeted-final、targeted-revised、closing-regression、closing-repaired、order-regression、upgrade-compatibility-final、project-regression、canonical*、lint-frozen及source-binding。早期5模型/11PG不叠加成新版覆盖。源码副本无outputs污染、无安装、无配置放宽；Git LF规范化与原Windows字节分别说明，不伪称二进制相等。

Windows曾出现PowerShell启动OutOfMemory；Docker spawn失败与资源压力相关仅属推断，不宣称Docker根因已修。独立Node/Docker只读启动对照成功后只补验失败组；没有无限重试、清全局网络或改TLS/代理。teardown失败遗留的本任务PG `6098b13cc398`经创建时间、唯一新库名及4个本片合成Source标记确认后停止，其他旧容器/卷未操作；不据此声称旧环境内容审计。

USD组实际全库dump/restore覆盖0047新增的非空初始化计划/版本/head，所有public表行摘要相同；本组调月commands仍为空。**没有非空调月回执的完整新镜像恢复验收**，不借原Gate8F 4/6、7/9或独立补验冒称本片完整恢复。

## 历史证据与最终门禁

三个独立冻结根文档恢复原blob；四份输入归档与a98原路径逐blob相等。旧草图原有行尾空白保留，完整staged whitespace检查如实报一处；仅排除该精确旧归档后其余增量通过，没有更改共享规则。

清单仅追加D169决策叶与新MONTH_PLAN契约，均绑定真实S；530旧记录、68能力及其他字段不变。独立只读窄审0 P1/P2，审查者未运行测试/环境或远端操作。元数据提交后，对最终完整HEAD执行一次精确main守卫及一次`test:release-baseline`；结果生成后记本机final.json，此文不预报尚未运行的结果。

后续仍有Source/执行方对账、年度两项金额、0045财务消费/冻结关联、旧写入口收紧及HTTP/UI。修订关账调整草图、USD采用UI均待具体批准；外发范围答复不是整体UI批准。当前旧HTTP仍在，不能把新分月与旧归属重复求和或称退役完成。

0 Hosted CI、远端Git/ref写、真实Source、现有账号业务库、合并、正式部署、切换及资产退役。完整Goal保持active；本片不是全项目完成。

2026-10-27最终回执：完整HEAD `582ef02a543794a0e6e7c720c0b533bbfaa178b0` 的精确main守卫PASS（150565ms），`test:release-baseline` 144/144（761861ms）；结束时同HEAD且clean。11页/68能力，累计base→HEAD包含68个历史UI路径，不称本片改动68个UI。原件final.json，state=LOCAL_G8G1_PASS_REMOTE_PENDING。随后用户明确批准修订关账UI，见[独立批准](2026-10-27-closing-adjustment-ui-approval.md)；该后续记录不改写S的原pending事实，也不把本次后端门禁当作新页面通过。
