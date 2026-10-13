# 全合同只读核对与四流代表合同验证

核实2026-10-13；GitHub main：8b3f3d811d05182ea1a7f3214eae9d530056fa04。分支feat/ainuoke-readonly-validation，独立工作树从该main开始，初始clean。GitHub是实时工程事实源；随main、代码、测试、真实回执、人工验收更新。

## 用户决定与范围

用户授权合并PR103后继续全合同只读核对、采购/入库/出运/出库的代表订单验证。D109原HTTP风险接受永久有效；保持UI，不修改真实账号/数据库，不部署。密码仅在本机隐藏输入，本轮不存密码、不复用旧凭据。

## 事实与实现

- PR103 head1de3078dfd0bcb540d87f792f0b43273f294a615，三CI成功且无行级审查问题，于2026-10-13T00:02:33Z合并为上述main。source第一次Chrome启动超时、同提交第二次通过的历史保留，不改写成首次全绿。
- 初始fetch出现connection reset。已通过只读GitHub API获取新merge的公开签名payload/signature，验证tree等于原PR head、双亲对象存在，重建字节的Git SHA精确匹配上述main后仅写本地对象库。没有伪造新commit、远端文件API写入、修改origin/main引用或退用旧基线。
- 新audit是显式本机私密命令。Python复用既有登录、固定catalog、无重定向/ambient proxy传输及分页检查；完整6086103→均匀最多80合同的完整6087050→完整6086103。读取0行、分页不全、重复身份/源漂移不升级为验证通过。
- 原页面的projectMaterialProgress及Discovery adapter直接处理快照，不另建四流业务算法或库存模型。采购/入库/出运/出库各选最多3个有正数量、单据号和日期的不同合同；厂供排除、去重、缺失值规则沿用原代码。
- 原始来源只在短命进程内存/匿名stdin，密码不传入离线Node分析器。私有报告仅含允许字段的代表合同、单据号、日期、数量与问题合同；无原始行/客户/供应商/采购金额。标准输出脱敏，仅标签、计数、摘要、私有报告路径。
- 私有报告使用独占新文件、拒绝输出目录symlink、置于Git忽略的outputs；不得将其作为原始业务附件提交。CLI不读取DATABASE_URL，不连接DB，不安装scheduler，不开放API或生产路由。

## 使用与结果含义

~~~powershell
pwsh -NoProfile -File (Join-Path $env:USERPROFILE '.codex\worktrees\ainuoke-readonly-validation\zhixu-ainuoke-api\scripts\ainuoke-readonly-audit.ps1')
~~~

密码隐藏输入，最多900秒来源读取，报告请求上限2000，每报告最多200页、每页50条，总计100000行及32MiB；正常网络不自动重试，token过期最多一次重新登录。离线分析另限90秒。原首页probe不变。

全合同=当前账号可见的完整合同发现，不证明公司全局授权范围。物料抽样最多80合同，必须报告sampledContracts/allContractsSampled；每类3代表合同是本轮AI验证预算，不足明确missingRepresentatives。完整分页不证明上游跨报告事务一致；前后Discovery相同不证明采集中间的物料同时不变。

source-records-found仅表示固定来源记录及既有解析器能构成代表样例；不等于人工业务验收、Source激活或上线。unit仍未映射/未核实，数量不得跨材料加总；缺失数量保留unknown。仍需确认实际字段/单位口径和上游界面一致性。

## 当前恢复点

工程head5d77355568913f96d91c2ff37541b1ee6a9c3adf的PR104三CI成功；8审计/66Python/root810/基线71及类型/lint/server/build通过，Ubuntu补验Linux分支。历史[工程Gate](evidence/ainuoke-readonly-validation/final-gate.md)保留其回执未到达时点，不用新结果改写历史。

用户已私下输入凭据完成真实运行，助手核对本机文件：[脱敏回执](evidence/ainuoke-readonly-validation/real-readonly-receipt.json)、[完整结论及边界](evidence/ainuoke-readonly-validation/real-validation-results.md)。558可见合同完整且前后一致；80物料抽样1空0无效，四流79/75/75/75有合格样例，代表均为R01–R03。62合同有数量未知；四流未知需求项184/250/341/258，不能推为上游错误或按零处理。unit及逐物料语义未核实，不声明全部558合同物料、全量颜色或业务人工验收通过。

下一步建议`feat/ainuoke-source-diagnostics`：少量代表/问题合同补物料身份、数量未知原因与单位候选的只读证据，合成验证后再私密读取并与上游对照。不重复从连接检查起步，不凭此修改计算或绑定。真实空账本首绑、持续采集写入和宁波上线均待具体执行授权。回退本轮只读命令即可，无真实数据库或环境回退动作。PR104更新后复审，不自动合并。
