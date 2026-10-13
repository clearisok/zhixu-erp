# 艾诺科 Server Source：首次订单绑定与持续物料展示
2026-10-13 / D-111：固定 6087050 的 QtyUnit 在只读物料 Projection 按需求展示一致来源单位；旧快照缺单位仍未知，冲突停止该需求汇总。不改正式计算、数据库、Source 调度或部署。[单位证据](../tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-confirmed-2026-10-13.md)。

D-112：用户要求首轮上线前受控接纳新增艾诺科合同。现有调度只刷新已绑定订单；新增合同 Discovery、预览、确认、幂等绑定和主信息/颜色策略须另行实现验收。#104/#105 已合并至 main 6abc4bebc59954b98a6e3f79f038f9574588390d，#106 未合并；无真实 Source 激活或部署。[合并记录](../tasks/active/evidence/ainuoke-targeted-diagnostic/pr105-merge-reconcile-2026-10-13.md)。

核实日期：2026-10-13；main 基线：8b3f3d811d05182ea1a7f3214eae9d530056fa04（PR103 HTTP扩展已合并；D110全合同只读audit在独立分支实施）。
GitHub/代码为实时事实源；本文件随来源契约、权限、命令、构建、调度、真实激活及验收变化更新。PR99阶段证据保留在原任务/冻结证据，本轮见[任务](../tasks/active/ainuoke-continuous-material-display.md)。

## 用户决定
D105：报价当前暂时OK；艾诺科采购、入库、物料出运和出库按正式订单持续展示后再上线宁波Ubuntu，不做独立库存台账。
D106：实现首次绑定、持续调度、现有页面接线；合成测试、PR与复审。保持D099/P6；不执行真实账号、数据库、来源激活或部署，不自动合并新PR。
D104：六角色同见已授权来源及采购价，织序售价/确认工价/成本继续D103。D110已完整发现当前账号可见558合同，但仍不证明上游全公司权限范围。

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
Linux操作端读取仓库外的普通文件，当前执行用户拥有、0600/0400；拒绝symlink、宽权限、非法UTF8/未知字段。D109另有本机不落盘的私密终端首页探测，Windows原Bridge Credential Manager不变。
必填字段：sourceKey、baseUrl、username、password、operatorUsername；已批准HTTP额外指定transportPolicy=user-approved-http-d109。实际绑定/采集操作人必须是已有active织序用户，具备ainuoke.view/order.view/style_progress.read/ainuoke.sync/style_progress.import；首绑额外ainuoke.bind。不自动授予权限或创建真实账号。

HTTPS origin、已核实安全通道的字面量loopback HTTP继续支持；D109长期允许原地址http://61.164.81.194:9043与显式policy的组合。其他公网HTTP拒绝；禁止重定向、ambient proxy，不关闭TLS。该例外仍是明文，不称为安全隧道。凭据经匿名stdin交给短命Python worker，不进入argv/env/DB/日志；上游登录协议含query参数，未来代理不得记录敏感query。
密码只在用户本机私下输入或未来受控Linux私密配置，不发聊天/GitHub。同一HTTP风险不再重复确认；未来绑定/持续写入/部署仍需具体执行授权。

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
- 已批准HTTP认证成功，D110当前账号558合同两遍完整稳定，80合同物料抽样四流有代表。62合同数量存在未知，单位与逐物料/去重语义、全合同颜色、真实全规模速率仍未验明；不能将抽样升级为首绑/上线PASS。缺/异常颜色必须如实呈现；目前颜色汇总可见，完整分码UI仍未接线。
- **只持续刷新已绑定订单的四流。** 首绑后新增合同不会自动建单，已存在订单主信息/颜色不会自动改写。后续需独立增量绑定/来源镜像刷新设计与冲突/消失策略；真实验收不能把本轮当作全合同自动生命周期完成。
- 最大1000订单、每报表200页/50行、整次100000行及32MiB、worker600秒。真实采集超过边界要设计按范围代际发布/限速，不截断假成功。没有真实规模性能承诺。
- Snapshot保留历史，无自动清理；哈希防误改，不是抗DB管理员的签名账本。上游没有跨报告事务快照，前后Discovery一致不证明物料完全同时。
- 调度输出机器可读captured/retrying/stopped供未来运维监控；尚未安装systemd/容器restart、外部告警接收或凭据轮换服务。终止窗口应允许当前采集600秒+发布完成，不能配置几秒强杀后谎称优雅退出。
- 连续24小时、多次新增/变动四流、断网/重启恢复、至少各3张真实单核对为AI建议验收，未实际完成。未来需验证新增合同处理范围，不能把合成轮询当作24小时真实运行。
- 宁波独立DB/卷/对象归属、完整ledger、备份恢复、外网域名/Origin/TLS、候选镜像SHA与回退仍独立Gate。PR98已修复并合并，当前[上线方案](../ops/ningbo-rollout-plan.md)按D105执行。
- 最后用户在原UI完成人工业务验收，再单独授权真实初始化/部署。生产/关账Server及独立库存台账不追加为本轮前置。

回退：暂停采集、关闭orderRead/reader，保留绑定和来源历史；不可删除ledger/订单/快照来回退。候选镜像须验证兼容既有0012；DB恢复只到另一个明确授权目标。首绑回滚只针对未提交事务，不提供已提交订单的自动删除命令。

2026-10-12统一本机演示：PR100已整合获用户视觉确认的PR101正式/login；报价/订单/物料共用一个临时Origin/session/PG，原布局保持。用户已接受本机合成体验，并另行授权合并PR100；main为上述SHA。历史组合证据见[统一演示](../tasks/active/unified-local-demo.md)，最新验收/合并范围见[真实接入](../tasks/active/ainuoke-live-readiness.md)。真实来源/账号/数据库/部署未操作。

## D108：无数据库的来源准备检查

新增 `npm run source:ainuoke:readiness -- --check --config=<私密Linux文件>`，不读取DB、不访问来源；给出来源指纹，不承诺凭据或通道有效。`--probe --expected-source=<该指纹>` 只做一次登录、三份固定报表的首页，每页50行，90秒总限，不翻页/重试/重登。空Discovery时后二报表明确not-probed；输出固定ID/数量/范围，不含任何合同明细或秘密。loopback还要求独立核实通道后显式 `--verified-tunnel`；该参数自身不能证明隧道安全。

探测不校验织序操作人RBAC，输出not-checked；不证明全合同覆盖/字段语义，不启动原scheduler或绑定writer。后续写入仍走原CLI的DB/权限/目标守卫。D108原传输观察及步骤保留于[历史接入任务](../tasks/active/ainuoke-live-readiness.md)，该HTTP限制由D109更新。

## D109：已批准HTTP与本机私密探测

用户永久接受原HTTP来源风险，Node配置和Python worker均要求原origin及policy，不需到期续批。Linux readiness指纹包含policy；既有HTTPS/loopback指纹不变。配置兼容现有首次绑定/采集CLI，但没有因此执行任何DB命令。

Windows普通PowerShell私下运行（用户名可输入中文，密码隐藏且不保存）：
~~~powershell
pwsh -NoProfile -File (Join-Path $env:USERPROFILE '.codex\worktrees\ainuoke-approved-http\zhixu-ainuoke-api\scripts\ainuoke-readonly-probe.ps1')
~~~
该工作树路径为本机本任务入口；其他检出位置运行其scripts/ainuoke-readonly-probe.ps1。仅真实终端输入，非交互/回显降级拒绝；复用固定probe并限制90秒，无DB、无账号变更。

2026-10-13用户回传：认证成功、6086103=50/558（不完整），首合同6087105=5/5、6087050=0/0。不把首合同0行推广至所有合同，不把首次连接证明写成持续Source激活。脱敏回执、工程测试、下一步见[本轮任务](../tasks/active/ainuoke-approved-http.md)。

## D110：全合同与四流代表合同只读核对

PR103已按用户授权合并；新增独立`scripts/ainuoke-readonly-audit.ps1`私密终端命令，原首页probe不变。两遍完整6086103核对分页/唯一sourceId/BillNo/前后内容，当前账号可见全集不等于全公司权限证明。按合同号排序均匀选最多80合同，完整6087050后由原`projectMaterialProgress`生成四流、厂供排除/去重/未知量状态，每类寻找3个有正数量/日期/单号的不同合同。

900秒来源读取、2000报告请求、每报告200页/50行、100000行/32MiB；Node离线分析另限90秒。只有允许字段的代表单号/日期/数量与问题合同写本机ignored私有JSON，不保存原始来源或密码；stdout为脱敏回执及本机路径。`unit`尚未映射/核实，不跨物料加总。样例存在不等于业务人工验收/全合同物料覆盖/持续激活。测试、真实回执与限制见[只读核对任务](../tasks/active/ainuoke-readonly-validation.md)。本功能不读取业务DB、绑定、调度或部署。

2026-10-13真实结果：558唯一可见合同/每遍12页，前后一致；80物料抽样1空0无效，125次报表请求。采购79合同、入库/出运/出库各75合同有正数量/日期/单号样例；四流均取同一组R01–R03。数量未知需求项184/250/341/258，涉及62不同合同，不能跨流水去重或加总为问题总数。当前报告缺物料身份/原始字段，无法判断未知根因或完成逐物料人工对照；下一步建议定向只读诊断。详见[真实证据](../tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)。

## 后续定向诊断（只读已执行，人工语义待确认）

从 PR #104 head 派生的草稿 PR #105 提供固定 6086103 一次当前可见合同索引定位，以及最多三合同 6087050 完整分页的显式私密诊断。合成测试和用户普通终端真实读取均已完成；目标三行118/356/6找到对应来源物料/采购字段，356两来源行归并一事件。API单位候选为空，人工业务身份确认0/3，正式单位映射0/3。少量样本的空值/零值/重复观察不能推广至旧统计62合同；unknown仍保持未知。见[任务](../tasks/active/ainuoke-targeted-diagnostic.md)和[脱敏真实证据](../tasks/active/evidence/ainuoke-targeted-diagnostic/real-results.md)。未激活 Source、读取业务DB、绑定、调度或部署。

2026-10-13 后续受保护报告显示目标四条来源行的 QtyUnit 候选均为“个”，三物料身份/采购归并与旧报告相同；业务语义尚未由 IT/用户确认，正式 Adapter/Projection 单位仍未映射。[脱敏证据](../tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-followup-2026-10-13.md)。不得据此改变 TotalNum、cgnum 或齐套计算。
