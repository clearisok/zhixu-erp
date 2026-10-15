# 小范围首次绑定与隔离真实演示准备

核实日期：2026-10-14。GitHub main：064e3afaf7d08b3cb62907d4402f97d9c292f1e5；本轮只读API核实一致。PR108 OPEN / MERGEABLE，head 8b89de59dd405395da1dde4b6dde5f125141deb9。继续既有feat/ainuoke-anomaly-evidence工作树；Phase baseline 755a787b756b8f2d379909feaa3b85e2997caeba，起始clean。不新建工作树、不重复PR。

## 用户决定与边界

用户要求继续实施小范围首次绑定、选择代表订单，真实写入和激活前提交具体范围确认；不自动合并或部署。本次只实施代码、合成测试及旧私有证据核对，没有登录真实来源、使用凭据、创建真实目标或写真实数据库。既有UI和23单模拟演示不改。历史截图/业务回执不是本次新鲜来源证据。

## 已实现

CLI新增preview-bind-selected、bind-selected，必须显式提供contracts，限制1–25个唯一合同；绑定另需expected-target及expected-preview。原全量首绑和受控新增入口保持。复用Python additions采集模式：完整6086103前后Discovery，只有选中6087105颜色明细；不截断Discovery冒充全集。复用previewAdditions的可信身份核验和原正式订单candidate mapper；不使用款号/采购号猜InsideOrderNo。颜色表历史内部号漂移仍是既有可追溯证据，合同正式身份来自Discovery，不擅自更改既有漂移业务规则。

首次绑定reviewHash有独立selected-first-binding.v1域及规范化选集，不能拿新增合同/全量绑定回执代用。复用bindOrders空账本或精确同范围重试、可信权限、账号指纹、锁、事务和审计；入事务后重新核验时效和reviewHash。所选集合在首次await前校验复制。新增合同不由重试扩容，仍走受控新增。

修补原重试缺口：仅旧审计hash和绑定数量一致不足以证明已存镜像正确；复用新增合同现有逐字段镜像核验，修改过颜色/主信息的账本拒绝冒称精确重试。审计记录explicit_selected_first_binding和精确选集。首次绑定不采集物料、不启动scheduler；后续execute只抓已绑定合同物料。

代码：server/ainuoke-source/binding.ts、additions.ts、cli.ts。回归：server/integration/ainuoke-selected-binding*.test.ts、ainuoke-binding-cli.integration.test.ts。无新SQL/migration、UI、数量/单位公式修改。

## 合成验证

纯测试覆盖选集空/重复/超限/未知/逗号注入、缺少/额外颜色、Discovery分页不完整/前后变更、陈旧来源、错误查询合同、未知合同数量、独立hash域、CLI明确授权参数、待定颜色0与原始null、颜色内部号漂移不取代Discovery身份。

一次性PostgreSQL验证三合同中仅绑定一单、预览零写入、错误hash零写入、末尾审计失败全事务回滚、精确重试无重复订单/日志、持久化颜色篡改拒绝、选集扩大拒绝、错账号拒绝、陈旧输入/权限撤销拒绝。首绑不产生source run；随后两轮只取绑定单的四流采集、持久化、Projection读取通过，未创建报价。Python固定worker通过loopback假来源验证保留两个Discovery合同但只抓一单颜色。Linux完整私密配置CLI端到端在Windows跳过，不能写成通过。

## 代表选集（私有，不进入Git）

已依据已有全量派生报告与定向原始报告选4单，场景为：三种线材实际采购与理论用量；两次有效标签采购和工厂采购责任；待定颜色数量0；生效合同缺单位。四单旧证据均有四流，数量/来源状态以新鲜预览为准。真实合同号/物料/单据只在受保护的本机选集计划和用户聊天展示。取消四单、已删除问题采购、负入库退库实例不纳入本轮。

复用旧报告SHA256：13dc7d3b5ed3afec38bd4d8ce74fe8cba97f3ea77db4ba655df5a03a0701ba4d（全量派生）；253cc5796e904118d0c8ab3c3da0683cf161c2832051178d2bdf7822abd31049（定向）；22e8af8692b07aedb9fe0690beb10883714d94531c09f08b979ac86c384c6cd9（原始包）。不重复558合同全量颜色/物料。旧证据不能用于正式bind回放；执行时仍需完整Discovery身份索引和仅4单明细的新鲜预览。

## 拟授权目标与执行清单（未执行）

目标仅本机Docker Desktop：项目zhixu-live-demo-20261014-r1，数据库zhixu_live_demo_20261014_r1，独立volume同项目后缀-data，Source key live-demo-20261014-r1；拟应用127.0.0.1:62310，DB不发布主机端口。以上是待创建命名，不是已存在资源或已核实指纹；创建前检查重名/占用，出现冲突停止，不接管已有目标或静默换目标。镜像绑定最终候选完整commit；新建空账本，仅合成演示管理身份，不改真实账号。旧23单演示、宁波及18443/18444不连接。

授权后步骤：新独立资源/所有权标记→初始化新空库并核实migration与空账本→既有CLI check生成目标指纹→私密本机凭据经固定worker读取完整Discovery和仅4单颜色→展示/记录新鲜preview hash及合同数→选定4单首绑→两次明确execute持久化四流→现有页面逐单核验与六角色权限测试。默认不启动无限scheduler；后续持续自动调度另行明确时长/频率。首次只产生4个SalesOrder、source links/合同/颜色镜像、1个source profile及审计；两次execute产生对应run和每单完整6087050快照，绝不回写艾诺科。原始查询索引仍可能含全部账号可见合同，但仅4单形成正式订单和物料明细。

D118人工确认只在隔离应用可信端口按新绑定UUID、sourceKey/account指纹和新鲜来源证据匹配后注入；失配不硬套。默认生产Server不装载确认。单位空白仍unknown；双采购不会去重，也不会因单位等价认定首批尺寸错误物料可用于生产。理论用量和实际采购分开。来源失败/过期需真实显示；不刷旧文件时间伪装刷新。

回退：停止本任务独立采集/应用/DB进程，保留volume、私有回执与日志；不删旧环境/源数据、不自动恢复或清库。PR108的既有fixture runner会自动seed模拟订单，不能直接用于真实首绑；真实候选启动必须走空账本分支，不直接复制运行该fixture入口。容器打包/新目标创建/真实页面验收尚未执行，须在授权后的阶段记录镜像ID、端口、DB指纹、4单UUID与两轮run ID。

## 工程交付状态

本地工程与GitHub交付分别记录。继承NETWORK_DEGRADED；本轮只读GitHub核实不意味着Git push通道已恢复。无新PR、无远端CI、无合并/部署。最终本地检查结果见接力及后续冻结验证记录。更新时机：选集、目标、代码、main/PR、授权、真实预览/首绑/刷新或人工验收变化。
