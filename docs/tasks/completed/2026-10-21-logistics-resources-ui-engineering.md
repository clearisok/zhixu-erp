# Gate6D物流资料Server页面：工程验收与边界

2026-10-21，root唯一writer，既有server_convergence_review独立只读复审。分支codex/server-logistics-resource-ui；main以独立GitHub读取核实996dfedc12da3527343cd3ff2aa5eea35497e10e。新分支由该本地main对象创建并显式FF到干净56cf706e5582f1b4c202b302370234cc98751090，无继承dirty/reset/rebase。三摘要原Git blob逐项保留于[输入档案](../completed/2026-10-21-logistics-ui-inputs/56cf706e/)。

最终应用/SQL/字段/客户端源为 **f4c3aa06ffcd8adf4bed39ba99bc0e336dceb451**；候选buildId **20261021-152547**，buildTime2026-10-21T15:25:47+08:00。Server quote/master、session、writable、orderRead=snapshot；前端完成后才运行Node构建。后续仅两处浏览器验收等待/目标选择与事实文档/清单收口，不改变该应用源；最终文档提交不冒称新构建或新CI。

## 实际功能与权威

在原“生产与运输”页面恢复集货仓/运输方案卡和原抽屉，不增加菜单、不改为另一套表格或领域writer。旧四资源及新两资源共用可信session、fresh授权、CAS、原命令hash、临时未决缓存、审计和不可变服务端回执。0037后台沿用[原后台切片](../active/server-convergence-gate6d-logistics-2026-10-21.md)，本UI切片没有新增SQL或改写0001–0037。

- Hub和生产地点须明确分页选择，不采用首项、唯一项或Browser默认。完整GET方案后编辑全部方式，含已停用成员；本地editorId不出组件，新方式modeId=null，仅Server分配正式身份。空天数/排序不补零，明确拒绝保存。
- 成功回执核对完整成员/顺序/业务字段、原ID及唯一的新ID；旧四类型规范化/hash保持。裸422、错误摘要和未知结果继续保留原命令，只有范围正确且hash匹配的物流容量拒绝才是已知终态。刷新不自动POST，人工重试保持原编号和全部内容。
- 新请求只读核对选中的父资料后派生标题，并再次检查完整会话owner。标题至多200个UTF-16单位，按完整Unicode字符/省略号处理；完整父名称与UUID不裁剪、不回写。原请求重试不因父资料改名而重新派生标题。
- 方案卡仅对当前页读完整方式，父版本不一致提示重读，不拼接新子项和旧父行；引用键包括kind+UUID。Hub服务路线数量为数据库全量启用方案计数，不冒充当前页计数。
- 修改Hub名称后重新读取引用；停用不级联删除或修改方案。CAS拒绝保留草稿；当前编辑授权/目录尚未恢复时“读取最新版本”禁用，避免看似可点却被内部权限守卫静默忽略。
- 新Server物流专用抽屉恢复原已声明的760px宽，手机保持Foundation全宽；选择器不匹配Browser或旧四资源。原字段、方式行、底部操作和布局保持。纯展示抽取保留Browser既有ID、默认、空值处理、Repository和长期存储，不挂载Browser设置hook或数据。

## 本阶段实际检查

所有DB、loopback API、账号与Chromium profile均由验收fixture创建，测试后只清理自己的随机资源；没有访问现有体验/业务库或真实Source。

| 检查 | 实际结果及精确限制 |
| --- | --- |
| 新旧客户端/临时缓存 | 21/21，537.4788ms，0失败/取消/跳过；包含长名称、Unicode、生成ID、完整成员和限定422；源码随后在c87cc178保存，后续未改客户端 |
| 原Browser基础资料模型 | 14/14，241.6036ms，原默认/保存边界保持；不是用户Browser存储读写 |
| 新旧纯契约/PG/HTTP/升级 | 61/61，21296.8896ms，0失败/取消/跳过；新增Hub全量计数而非当前页，保留后台60项及升级边界 |
| 项目广回归 | 927/927，318367.6965ms，0失败/取消/跳过；运行从c87cc178开始，在最新读取按钮修复阶段结束，先于最后专用CSS，不将其说成验证了后续CSS |
| 发布基线回归 | 116/116，300921.5408ms，0失败/取消/跳过；发生于UI修复阶段、先于本份新证据/能力范围扩展；最终清单由精确守卫另查 |
| 类型/构建/lint | 类型、显式Server前端及顺序Node构建通过；最终全lint实际exit0（outputs/g6d-ui-lint-final.log），此前全量及增量日志按时序保留，不借旧CI |
| 最终built Chromium | 23/23，33468.8431ms，0失败/取消/跳过；其中22个子场景加1个父项，不是23个独立业务场景；应用build精确f4c3aa06，验收脚本仅后补两处等待/明确Hub选择 |
| 精确源守卫 | f4c3aa06对main996dfedc PASS，11页面/51能力/累计64条UI路径，errors=[]；清单收口后再核对最终HEAD，不替代像素、DB或人工接受 |

built场景覆盖六类型空库无Seed/报价/SO、23候选分页及AND搜索、明确父选择、零天数和空值、完整停用方式/新ID、重复点击只一次POST、Hub改名/停用、真实COMMIT后丢回执刷新GET恢复、原内容重试、父改名后原请求标题不变、列表/详情版本竞态、CAS草稿、错hash、无权限及撤权Enter、真实SPA A→B→A的旧POST/回执200/401、父读取后身份更替不继续写入。

旧组/厂及日历验收保留；新Hub/方案在1920、1536、1440、1280、900、390检查真实面板/字段几何，方案各宽度overflow=[]。新图像不覆盖任何旧PNG。root查看最终1440 Hub、1440/1920及390方案图；reviewer独立查看1920/390方案及390 Hub，无横向裁剪或底部操作缺失。图片与build/geometry位于本机ignored目录：

`outputs/production-resources-ui/f4c3aa06ffcd8adf4bed39ba99bc0e336dceb451-1792567864371/`

这是工程像素核对，不是新的用户认可截图或正式部署。

## 保留的失败与修复时序

初始物流客户端5项失败复现旧四kind不能提交；实现后先19/19、补Hub计数20/20，非最终21的替代。reviewer发现两个合法100字符父名称拼成203字符标题必拒绝，保留单独红测后以有界派生显示名修复；未改变源字段/UUID/数据库上限。

1. c87cc178首轮built总10pass/2fail（34441.9692ms），CAS最新读取超时。已修复上述mayEdit等待，保存23278ffc，不放松权限/清草稿。
2. 23278ffc第二轮built总21pass/2fail（31132.1586ms），真实1920几何显示480px基础Drawer覆盖原760px规则，右侧字段裁剪。f4c3aa06增加只作用于Server新物流的宽度规则。
3. f4c3aa06前两次总21pass/2fail分别为31720.8313ms、46287.1914ms：验收在Hub详情GET结束前测量空面板，之后又误取排序第一张长名仓。只将脚本改为等待详情并明确选择目标仓，没有产品改动、删除断言或覆盖失败日志；随后完整23/23通过。

原日志分别为outputs/g6d-ui-browser-first.log、g6d-ui-browser-conflict-fix.log、g6d-ui-browser-drawer-fix.log、g6d-ui-browser-final.log；最终为g6d-ui-browser-verified.log。长名称red/green、后台/项目/基线及构建日志也按原名称保留。独立只读复审无新增产品/安全阻断；reviewer未代为运行测试、DB、构建或网络。

## 能力、远端与禁止范围

本资源能力implemented=yes，隔离工程passed-historical，main merged=false；扩展范围为六资料及已有页面。humanAcceptance=not-run，Source activation=not-applicable，trial18443/preview18444=not-deployed。只前向增加文档证据及更新本能力范围，原244证据、其他能力和历史PNG不删除/覆盖。

本阶段只读Git诊断：默认4033ms、HTTP1.1 2902ms均exit0且main996；OpenSSL进程对照exit128/uncertain_transport，配置未改、pushSubmitted=false。它不解释先前664f实际push exit1的具体原因，不证明推送恢复，仍STOP_AUTH_OR_DIVERGENCE/原因未证实。没有新上传、PR或Hosted CI，不借旧664f CI冒称本阶段通过；不改认证/共享Git/proxy/TLS，不盲目重推。

3001/50426/59069/62426、旧卷/工作树/Browser保持；62426仍Gate1源8175，没有替换入口。没有真实账号/业务DB操作，没有新增艾诺科请求/绑定/激活/调度，不安装依赖或部署/退役资产，不自动merge/close。

本切片不包括订单SupplyHub写入、逐物料物流推荐、成衣Source正式身份/生命周期或关账。D152的Num/outdate已确认；D1935/D1933两笔真实读取许可已用完，不扩大采集。CNY销售/USD工价不换汇或重标历史。完整Server目标仍active/未完成，Gate8其他业务决定继续待确认。
