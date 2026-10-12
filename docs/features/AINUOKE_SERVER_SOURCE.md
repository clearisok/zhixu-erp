# 艾诺科 Server Source：首次订单绑定与持续物料展示
核实日期：2026-10-12；main 基线：db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e（PR99已合并）。
GitHub/代码为实时事实源；本文件随来源契约、权限、命令、构建、调度、真实激活及验收变化更新。PR99阶段证据保留在原任务/冻结证据，本轮见[任务](../tasks/active/ainuoke-continuous-material-display.md)。

## 用户决定
D105：报价当前暂时OK；艾诺科采购、入库、物料出运和出库按正式订单持续展示后再上线宁波Ubuntu，不做独立库存台账。
D106：实现首次绑定、持续调度、现有页面接线；合成测试、PR与复审。保持D099/P6；不执行真实账号、数据库、来源激活或部署，不自动合并新PR。
D104：六角色同见已授权来源及采购价，织序售价/确认工价/成本继续D103。首轮用户本人账号“全部合同”是用户陈述，真实覆盖尚未证明。

## 实现与边界
1. 既有正式 UUID/order_no、Source Link、Contract Mirror、6087105 Color Mirror 复用；不引入第二套订单/库存模型。
2. 首次绑定固定完整6086103 Discovery → 当前全部BillNo的6087105 → 再次Discovery。包含草拟/生效等所有可见状态，不按状态排除，不固定历史合同数。
3. 复用Final Bootstrap Preview mapper。颜色missing/invalid是enrichment状态，仍创建主订单且不猜颜色；未知Num不能转零，非法日历日期拒绝。6086997不再作正式颜色源；6087050不得生成订单。
4. --preview-bind只读来源和DB。--bind重新采集，必须匹配目标与reviewHash；事务内重新检查权限/来源/时效。reviewHash涵盖映射的客户、品牌、数量、日期和颜色元数据，忽略读取时间。
5. 一次事务创建完整订单集合及逐单/整批可信审计；中途任何失败全部回滚。编号序列可留gap，不能回收。无新migration，0001–0012不变。
6. 首次只接受空订单账本；重试必须有相同来源profile、首绑审计reviewHash和精确同一绑定集合/镜像。不能把已有旧订单、部分账本或同BillNo新sourceId冒充重试。当前没有新增合同的自动建单或订单镜像更新命令。
7. 采集使用PR99的固定6086103→6087050→6086103。已有绑定订单与当前InsideOrderNo解析，整代来源快照/日志/current pointer原子提交；失败保留历史并取消当前事实判定，过期不冒充零。
8. 调度显式启动，单次完成后等待；不并发追赶。默认建议间隔5分钟、退避上限30分钟，成功归零；错误凭据/账号变化/用户停用/权限撤销停止。每轮重验migration ledger但不应用migration。SIGTERM/SIGINT完成当前有界采集/发布后退出，等待阶段立即停止。
9. 原API启动绝不启动采集。GET只查持久快照，不读来源密码、不访问上游、不写业务表。页面每30秒及回到窗口时刷新GET，无重叠；按订单/当前用户/权限隔离响应、取消旧请求。故障时清掉已显示判定，不回退Browser。
10. 本轮修复发现的DATE偏移：订单/颜色日期在SQL读取时保持YYYY-MM-DD，避免东八区被toISOString减一天。没有改任何数据库日期。

## 凭据与命令
仅Linux操作端读取仓库外的普通文件，当前执行用户拥有、0600/0400；拒绝symlink、宽权限、非法UTF8/未知字段。Windows原Bridge Credential Manager不变。
固定字段：sourceKey、baseUrl、username、password、operatorUsername。操作人必须是已有active织序用户，具备ainuoke.view/order.view/style_progress.read/ainuoke.sync/style_progress.import；首绑额外ainuoke.bind。不自动授予权限或创建真实账号。

只允许HTTPS origin或已核实安全通道的字面量loopback HTTP；不允许远端明文HTTP、重定向、ambient proxy，不关闭TLS。已知旧艾诺科端点为HTTP，安全后段仍待证明。凭据经匿名stdin交给短命Python worker，不进入argv/env/DB/日志；上游登录协议含query参数，安全代理仍须禁止记录敏感query。
现在无需提供真实密码。未来私下配置时才需要安全endpoint、用户本人来源账号、织序操作人、目标指纹；密码不发聊天/GitHub。

以下仅是已实现命令说明，不是本轮真实执行授权：
~~~text
npm run source:ainuoke -- --check --config=/private/source.json
npm run source:ainuoke -- --preview-bind=<key> --expected-target=<check返回的完整指纹> --config=/private/source.json
npm run source:ainuoke -- --bind=<key> --expected-target=<完整指纹> --expected-preview=<reviewHash> --config=/private/source.json
npm run source:ainuoke -- --execute=<key> --expected-target=<完整指纹> --config=/private/source.json
npm run source:ainuoke -- --schedule=<key> --expected-target=<完整指纹> --config=/private/source.json --interval-ms=300000 --max-backoff-ms=1800000
~~~
镜像中使用node dist/server/server/ainuoke-source/cli.js。同一动作不接受重复/未知参数。--check不访问来源或写DB；preview会读取来源但不写DB。调度只更新快照，不重复首绑。
目标指纹包括实际DB名/用户/address/port、DSN host/port、sourceKey及来源origin/账号指纹。密码轮换可在同账号下私下更新；换账号/来源/操作人会停止，不能静默换源。

## 页面与发布开关
默认NEXT_PUBLIC_ZHIXU_ORDER_READ=disabled。仅显式snapshot候选启用：
- /order-center：既有Server列表。
- /order-center/server-detail?id=<UUID>：原P6 executionOnly详情、颜色与物料汇总。
- /order-center/style-progress/detail?orderId=<UUID>：既有只读Control Tower、四流和采购价。

Server材料路由即使缺orderId也不进入Browser组件。原导航位置/样式/断点/CSS保持；未接通款式总览/风险预警入口disabled。生产、关账、旧订单新增/编辑、Browser导入没有被放开。executionOnly不开放商业条款编辑；织序金额安全服务保持原权限。

必须同时Quote=server、masters=server、writer=writable、identity=session。构建元数据记录orderRead，生产启动校验build/runtime一致且来源reader=snapshot；源码中的serverRoutes是候选能力上界，实际边界与导航使用isEnabledServerRoute，默认关闭。
reader另需ZHIXU_AINUOKE_SOURCE_KEY、ZHIXU_AINUOKE_SOURCE_MAX_AGE_MS（1000–86400000）；建议30分钟过期。Dockerfile支持默认disabled的同名build arg；仅构建不等于部署。

## 合成演示与验收
~~~powershell
$env:NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY='server'
$env:NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY='server'
$env:NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE='writable'
$env:NEXT_PUBLIC_ZHIXU_IDENTITY_MODE='session'
$env:NEXT_PUBLIC_ZHIXU_ORDER_READ='snapshot'
npm run build
npm run demo:ainuoke-continuous
~~~
脚本忽略真实DATABASE_URL，自己创建随机名loopback/tmpfs PostgreSQL，合成六角色/首次绑定/快照；输出临时网址、合成账号和密码。每60秒生成下一轮合成快照，页面30秒读取。两小时自动关闭并删除仅本脚本创建的临时容器；Ctrl+C也清理。绝不连接真实艾诺科或18443/18444。演示密码仅用于这个临时本机账本。

自动验收：test:ainuoke-continuous（Preview/事务/权限/调度/实际Python/LinuxCLI/构建开关），test:ainuoke-continuous-ui（真实构建、真实session/PG、六角色、P6 1440/1280/390、自动刷新/故障/陈旧/恢复、禁止Browser写入）、既有来源/Python/订单/bootstrap/基础门禁。
截图为新路径的新工程证据；不是用户人工PASS。旧P6截图不覆盖。

## 上线仍需的Gate及已知限制
- 真实安全通道、账号授权、当前完整合同覆盖、字段/单位及速率验明后，才可提出具体首绑计划供执行授权。缺/异常颜色必须如实呈现；目前颜色汇总可见，完整分码UI仍未接线。
- **只持续刷新已绑定订单的四流。** 首绑后新增合同不会自动建单，已存在订单主信息/颜色不会自动改写。后续需独立增量绑定/来源镜像刷新设计与冲突/消失策略；真实验收不能把本轮当作全合同自动生命周期完成。
- 最大1000订单、每报表200页/50行、整次100000行及32MiB、worker600秒。真实采集超过边界要设计按范围代际发布/限速，不截断假成功。没有真实规模性能承诺。
- Snapshot保留历史，无自动清理；哈希防误改，不是抗DB管理员的签名账本。上游没有跨报告事务快照，前后Discovery一致不证明物料完全同时。
- 调度输出机器可读captured/retrying/stopped供未来运维监控；尚未安装systemd/容器restart、外部告警接收或凭据轮换服务。终止窗口应允许当前采集600秒+发布完成，不能配置几秒强杀后谎称优雅退出。
- 连续24小时、多次新增/变动四流、断网/重启恢复、至少各3张真实单核对为AI建议验收，未实际完成。未来需验证新增合同处理范围，不能把合成轮询当作24小时真实运行。
- 宁波独立DB/卷/对象归属、完整ledger、备份恢复、外网域名/Origin/TLS、候选镜像SHA与回退仍独立Gate。PR98旧Quote-first方案需按D105更新后再合并。
- 最后用户在原UI完成人工业务验收，再单独授权真实初始化/部署。生产/关账Server及独立库存台账不追加为本轮前置。

回退：暂停采集、关闭orderRead/reader，保留绑定和来源历史；不可删除ledger/订单/快照来回退。候选镜像须验证兼容既有0012；DB恢复只到另一个明确授权目标。首绑回滚只针对未提交事务，不提供已提交订单的自动删除命令。
