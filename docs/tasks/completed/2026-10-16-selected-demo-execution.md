# 两合同真实来源隔离演示执行报告

核实2026-10-16，Asia/Shanghai；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。GitHub是实时事实源，本报告不是持续监控。源码、镜像、权限、来源、授权、资源、期限或验收变化时前向更新，保留原失败、日期、SHA与证据。

## 用户决定与基线

用户明确批准[两合同提案](../active/ainuoke-selected-demo-execution-proposal.md)：新本机隔离空库，仅S1/S2，一次订单/颜色、物料四流及6086941，使用既有私密凭据文件；不持续调度、不改真实账号/现有业务库、不自动合并、不部署宁波及18443/18444。首轮报告保存失败后，用户独立批准仅补一次同范围订单/颜色读取；物料、财务仍原各一次。真实合同号只保留在本机受保护且Git忽略的文件。

原工作树和分支feat/ainuoke-selected-source-once保留，执行前clean HEAD `0dfd51e798768530d1e6134e6019f57b39645197`。执行后GitHub API再核main与PR116：base仍064、head0df、open/draft/unmerged，没有重复PR。原0df三项CI按该SHA保留，本Phase文档新提交CI另核。

## 已确认的执行结果

| 项目 | 结果及证据 |
|---|---|
| 资源 | 新实例zhixu-selected-demo-20261016-r2；新DB/user/volume/owner marker。初始化前0非系统表；不挂旧volume |
| 构建 | 源码71b291762467c1efd19873438fef2abfd2954d23；镜像sha256:8f4c0e5272394db15933a2a0c00c0e44933b4b5e42dbcfca8c92a59217aaacfc；build selected-source-20261016-71b29176。非main构建 |
| 初始化 | 25份当前迁移、7个合成角色；初始化后SO=0。复用现有迁移、权限、bootstrap和team服务 |
| 订单/颜色 | S1/S2各1 SO、各1种颜色。可信Discovery身份；同一新鲜bundle/reviewHash接纳，不按款号/相等数量猜身份 |
| 物料 | 1 run/2快照；S1展示9需求项、S2展示30项；另1项厂供排除。原validateBundle/captureSource/reader读回 |
| 四流 | S1采购9/入库12/出运9/出库12事件；S2采购21/入库28/出运22/出库28事件。计数不是跨物料实物数量 |
| 单位 | S1已知9；S2已知21、缺9。未知不默认“个”，不从规格推算 |
| 财务 | 精确2目标启用、2快照发布/0未决、12/9行。既有D142 plan→原子enable→started→collect-once→发布/回执 |
| 权限/API | 7个合成角色均读回2单/39物料/21申请行；成本/售价/工价维持预设，登录/退出正常、业务mutation被只读边界阻断 |
| 浏览器 | 登录、两单列表、详情/颜色、物料四流/事件及12行财务侧栏实际DOM核验；过期后物料历史另核并保存私有截图 |
| 封口 | 原临时62317入口取消；仅替换本次专属PG容器、同一新volume保留；最终PG零host端口，仅internal网络，app健康200 |
| 期限 | app只读、127.0.0.1:62316，18:08:03自动停、restart=no；绝对deadline启动/请求检查与停止timer，不续窗口 |

所有数量事实沿用原Projection，不新计算业务总量；理论用量/实际采购分别保留，num_dyc不加进rknum。未知数量不补0，申请金额不认定银行实付。

## 失败、修复与真实次数

1. **资源清单错误：** 私有执行器误组`docker ps ls`，准备阶段即失败，尚未读取来源/凭据或初始化DB。正确只读清单后，13项精确资源/镜像/合同/端口/授权/无调度负向检查通过。
2. **Docker Desktop网络：** 新PG内部ready，但internal-only的发布口不能从Windows loopback连接。仅为本次PG临时接入本次专属owner校验bridge；完成后替换同一新volume的专属PG、去掉host发布，只保留internal。旧资源/共享配置不变。
3. **迁移换行：** 2份Windows SQL与Linux镜像原始换行不同，checksum校验正确拒绝启动。25份规范化内容与候选Git/镜像一致；本次app只读挂载实际初始化的同一组迁移。没有改SQL、迁移台账或放宽校验。
4. **报告包装：** 首轮mapper结果再套一层超过深度限制，合成复现深度13；合法原worker envelope深度8。改成先原Node范围/秘密值验证，再保存原envelope，不额外包装preview。受保护文件写入绿测通过。原首轮没有可恢复bundle，0 SO/0快照已读回，operation保持unresolved、计数未知，不能声称“未请求”。单独获批补一次后独立operation完成；原失败未删除。

补读及物料各准确1登录、26report、27HTTP、0网络重试/续期。财务终端回执证明2发布/0未决，不暴露worker transport metrics；不将旧读取5HTTP套成本次实测值。全部一次额度已消费，不通过新request ID重采。

修复只在本机受保护操作入口和本次运行挂载；本Phase生产应用代码、已批准UI、迁移SQL、正式数量公式均未修改。原SDK/Catalog/Discovery/Adapter/Pipeline/Projection/持久化服务全部复用。

## 本Phase验证

`server:build`通过；私有执行器/服务入口语法检查、13项精确范围负向检查、报告深度合成红测与修复后受保护文件写入通过。7角色实际API读回、真实浏览器DOM、过期后历史读取、owner/端口/镜像/挂载/停止期限及新PG重启后健康检查通过。离线HTML静态检查确认2合同、无外部资源/网络调用/凭据；视觉渲染限制单独记录。

`check:release-baseline -- --base-sha 064e3afaf7d08b3cb62907d4402f97d9c292f1e5`在本Phase工作内容下PASS（11页/44能力）；`test:release-baseline`94/94 PASS、0跳过。原0df/71b的全量工程证据保留，不宣称本轮重跑898项目测试、全量数据库或生产发布验收。文档commit后的精确守卫、远端送达和新CI另行核实。

## 体验限制与下一工程建议

来源仍按10分钟可信时效；物料约16:20、财务约16:21采集，到期后当前reader/组件隐藏旧值。这已实际观察，不能把app可访问2小时说成来源2小时实时；网页刷新不会再访问艾诺科。

ERP既有“历史物料来源”可在过期后查看原四流，且不显示当前齐套判断。**ERP财务历史入口尚缺**：12/9行在过期前侧栏核验成功，但到期后不能通过当前页继续看旧申请。这是已确认产品缺口，不是连接失败或数据丢失。建议下一独立PR新增财务历史阅读：明确historical/currentStatusApplicable=false、采集时刻、原归属及当前权限；不简单提高maxAge、不固定时钟、不放宽当前reader。

为本次核对提供受保护的本机离线HTML副本，包含39物料、四流、21申请及来源字段；所有来源文本转义、CSP禁止网络、无凭据/写入/当前齐套结论，不成为ERP数据源。应用内浏览器禁止file协议，未绕过或另开无鉴权Web入口，故只静态核验、不声称像素验收。用户可在本机自行打开。

S2仍9项来源单位为空、部分四流量未知；财务单位/币种不从两个已知样本推至全表。合同级申请未逐行关联当前物料，不能形成对账/银行付款结论。完整分码UI、商业价格采用及人工业务验收均非本次新完成事实。

## 安全和恢复

凭据只由私密进程消费，不进入聊天、输出、app、DB、Git、日志、argv/env；新库和合成账号密码与来源凭据独立。app只有DB reader，无Source worker/scheduler；只允许读取和登录/退出，订单命令frozen。

执行后旧四单app/PG仍exited、volume未动；无真实账号/现有业务库/宁波18443/18444改动，无合并。到期只停本次app，不删新旧volume、SO、快照或审计。提前停用也须核owner、精确ID和source/image，只停本次app，禁止清库/删volume。

续窗口、新读取、持续调度、扩合同或真实环境晋升均需新具体范围授权，不能复用旧许可。工程/远端交付/隔离运行/人工业务验收分别记录。脱敏冻结见[JSON证据](evidence/2026-10-16-selected-demo-execution.json)，原始业务与截图只留本机。
