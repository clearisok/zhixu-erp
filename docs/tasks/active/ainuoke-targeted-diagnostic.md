# 少量订单物料来源字段定向诊断

核实日期：2026-10-13。GitHub main `8b3f3d811d05182ea1a7f3214eae9d530056fa04`；依赖开放的 PR #104 head `b43b78bee72a496219bd4872245ad28109f421c4`。本分支从该 head 建立，GitHub 与代码状态变化时复核。本文件只放脱敏工程事实；真实合同、物料、单据、请求范围与逐行结果只在本机 Git 忽略的 `outputs/`。

## 用户决定

只诊断一张已知采购合同的三行数量，外加最多两个已有未知问题的销售合同；继续接受 D109 的固定 HTTP origin 风险。先合成测试，再由用户在普通私密 PowerShell 隐藏输入艾诺科凭据显式运行。不得修改业务库、真实账号、现有 UI、正式物料计算、单位换算、已发布 SQL、Source 激活或部署；新 PR 不自动合并。

## 已确认工程事实

- 旧只读私有报告仅有一条数量相等的采购样例，未保存三行原始物料身份；不能把另外两行标为未采集，也不能以数量相等证明物料对应。
- `6086103` Discovery 用当前 `BillNo` 精确定位 `InsideOrderNo`，只读一次完整当前账号可见合同索引；随后最多三个指定销售合同按该 InsideOrderNo 查询固定 `6087050`，各自完整分页。不是再次执行两遍 Discovery/80 合同抽样。
- 定向工具使用既有 Source adapter、Normalize/Dedup/Preview 和页面只读投影。三行私有报告含来源行身份、物料名称/编码/颜色/规格、采购号/日期/数量、候选单位字段、归并后的采购事件 ID/数量/来源引用；不保存完整原始行、采购价、供应商或凭据。标准输出只有脱敏计数和私有文件路径。
- `6087050` 当前已映射采购、入库、出运、出库的数量字段；单位没有可信语义映射。诊断中出现的 `unit`/`单位`/`dw` 字段只算候选，不能据截图把“个”填进所有来源行或页面。
- 数量观察按来源行分开标记：字面零、数量空白但有单号、数量/单号都空白（仅“可能未发生”）、非法、负数、正数量缺单号、正数量有单号。映射错误和业务是否未发生都需上游界面证据；重复来源/事件以及候选单位冲突单列，不当作空数量根因。原投影的 unknown 保持 null，62 合同全体原因尚未统计。

## 运行边界和验收

本机忽略文件 `outputs/ainuoke-targeted-request.json` 已按用户已知三行与旧私有问题合同生成，仅含范围和预期数量、无凭据。`scripts/ainuoke-targeted-diagnostic.ps1` 在交互终端提示账号和隐藏密码，先采集，再用短命离线 Node 进程生成私有报告。固定 origin、无重定向/ambient proxy、最多 80 次报告读取、50行/页、总计 100000 行/32MiB、来源超时 600 秒；没有数据库、任务调度器或公开 API。错误只输出封闭错误码，不反射上游响应。

仅当用户回传脱敏 JSON 并核对本机报告、三行物料身份与单位含义后，才能把行状态由“待确认”改为“已证实”或“不匹配”。这一轮合成测试不能称为真实三行验证，也不能对 62 合同总体归因。即使目标三行对齐，首绑、持续采集、全量颜色、规模、六角色和宁波上线仍各有独立 Gate。

本地合成工程 Gate：定向测试 5/5、Python Bridge 全套 68/68、原只读审计 8/8、Source 集成 20通过/1平台跳过、根级 810/810、基线回归 71/71；TypeScript 类型、lint、server build、静态前端 build 通过。`check:release-baseline` 对实际 main SHA PASS 且 UI 变更数 0。这些都是本地工程验证，不是新PR CI、真实来源逐行核对或人工验收。

操作人首次在普通 PowerShell 启动时，旧包装脚本在 Set-Acl 处因缺少 SeSecurityPrivilege 停止，发生在账号输入和 Python 上游读取之前。现已改成只读检查预受限的 NTFS ACL；权限不满足时闭锁，不要求提权。单位候选扫描排除单价、金额、成本、币种和汇率字段，合成高价格值负向测试通过。修正工程head cef2e5653524bb65a80b8f9787e0ab937390d88b 的 Source CI 全成功。

2026-10-13 用户在普通 PowerShell 私下输入凭据后，真实定向读取成功；助手核对受限本机报告和三行对照表。技术上三行118/356/6各找到来源名称、编码、颜色、规格、采购单号、日期和数量；截图未直接显示编码，仍需人工核对；356由两来源行归并为同一采购事件。三行API单位候选为空，截图“个”尚未形成正式来源映射；人工业务确认仍为0/3。三个样本仅能分类少量来源行观察，不能外推到62合同。完整脱敏结论见[真实证据](evidence/ainuoke-targeted-diagnostic/real-results.md)；私有逐行身份不提交。PR104仍开放，新PR105保持草稿且不自动合并。
## 证据与更新时机

代码：`tools/ainuoke-bridge/ainuoke_bridge/server_source.py`、`server/ainuoke-source/targeted-diagnostic.ts`、`scripts/ainuoke-targeted-diagnostic.ps1`。测试：`tools/ainuoke-bridge/tests/test_server_source.py`、`server/integration/ainuoke-targeted-diagnostic.test.ts`。旧只读统计：[真实结果](evidence/ainuoke-readonly-validation/real-validation-results.md)。真实命令、三行人工核对、PR #104 状态、CI 与 main SHA 改变时更新本任务和 CURRENT_STATE；保留旧证据原时点。
