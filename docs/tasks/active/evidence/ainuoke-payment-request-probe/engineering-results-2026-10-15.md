# 6086941 固定首页诊断工程验收与复审

核实日期2026-10-15；GitHub API当日再次确认main为064e3afaf7d08b3cb62907d4402f97d9c292f1e5。源码8655a052f22458506094fa0941ba7344fbff9bff，分支feat/ainuoke-payment-request-probe；父基线68ac1fc9f839ebfc894d39377dac221e7f65566b包含尚未交付的G5/num_dyc/B2依赖。本文为冻结证据，后续补充另立新文件，不覆盖本报告或旧B2截图/hash。

## 已确认工程事实

固定6086941第1页、100行、一次登录一次报表，HTTP请求计数是应用层transport调用次数，不宣称底层TCP次数。复用AinuokeClient、固定请求构造和既有分页解析；不新增Bridge/持续Source catalog、Discovery、过滤猜测、第二页或自动重试。仅允许已批准HTTP origin和D109 policy；禁止代理/重定向；每响应4MiB，Node stdout16MiB，总worker120秒，包装器135秒。

Python保留报表原始UTF8文本，拒绝秘密字段/密码/token回显；Node交叉校验hash、报表ID、页码、返回行数、总数、时间与元数据结构。原始数值文本保持权威，不用JS浮点重算金额。公开回执只给50个静态候选字段的覆盖计数、缺元数据标志、范围/行数/hash/日期及私有路径；不输出业务单据、名称、单位值或金额。少于报表声称首页条数时明确firstPageMatchesReportedSize=false，不补抓、不宣称完整或可上线。

原始数据、totalInfo、未知字段、重复行/相同id、空值、负数和零均保留在独占新文件。rowTrace仅为本次raw位置，不冒充稳定业务身份。QtyUnit与bgQtyUnit不合并；各数量/金额独立，不识别实付。报告复用现有ignored路径与owner/SYSTEM ACL校验，未改既有凭据ACL/报告，不保存登录响应或凭据；写入器默认原前缀/原行为保持。实际命令需干净提交和显式动作，默认、Help或错误参数不会读取凭据或联网。

## 测试证据与限制

- 新Node/实际PowerShell/子进程/ACL：37/37 PASS；含19项分页、数量、身份、时间、hash等负向子场景，以及超时/超限/非法JSON/失败传输、原始小数、字段保密、两个不可变报告、缺运行时、错误参数和宽ACL拒绝。
- Python全套83/83 PASS，其中新诊断12项；固定请求、401/302/网络失败、无重试、无代理、读限额及秘密回显均为模拟传输。没有连接真实艾诺科。
- 既有全量预检24/24 PASS：受保护报告前缀扩展不改变原语义。
- 项目root898/898 PASS；Server build及默认Browser build PASS。类型检查PASS，最终精确基线与基线回归在后续发布元数据提交中核实。
- 普通npm run lint扫描继承outputs私有历史TS生成物而报16错误3警告；未修改/提交这些文件。npm run lint -- --ignore-pattern outputs --max-warnings 0对全部工程源码通过。该例外仅排除Git忽略的私有生成物，未新增eslint规则豁免或跳过产品源码。
- 工作树内日志：outputs/payment-probe-final.tap、payment-existing-preflight.tap、payment-root.tap、payment-tracked-lint.log、payment-server-build.log、payment-browser-build.log。日志是本机辅助证据，公开提交只含本脱敏结论及测试源码。
- 新Node回归已加入现有Source workflow，Python沿用既有全套入口；未运行Hosted CI，不能称GitHub通过。没有SQL/API/UI变更，不重复声称数据库或人工像素验收。

## 用户决定、AI建议、未验证项

用户已批准6086941独立来源接入方向及长期HTTP风险，但用户转述的49字段、17247条和100条公式并非本工具实读证据。字段和报表配置存在也不能证明业务身份、单位、币种或金额计算正确。所有正式映射、分页全量、过滤粒度和跨表关联仍未验证，付款状态绝不推断。

AI建议下一步只批准本工具固定首页：使用既有本机凭据文件，由私密进程读取，一次登录+一次报表、最多100行/4MiB/120秒，无DB/绑定/激活/调度/部署。之后只核对受保护报告中的cellList/来源表/行身份/数量单位与几个具体业务样本，再提出最小正式Projection。不重复558合同预检，不扩全量财务采集，也不增加汇率逻辑。

## 交付与复审结论

本地诊断工程可进入独立Draft PR复审，不能称财务对账模块可用。当前Git交付通道仍NETWORK_DEGRADED，本分支未送达、无PR/CI，不自动执行恢复。B2工作树仍68ac1fc9/clean；本轮用户普通PowerShell回执pushes0，一次API核对该分支不存在。交付源码确认before阶段只用Git ls-remote，API只用于push后核对，故本次卡在远端前置读取，Git网络根因仍未确定。未删规则、换认证、改共享TLS/代理、伪造commit或盲推。

未读取真实凭据、未请求真实6086941、未写业务数据库/真实账号、未重启窗口或变更现有演示/宁波/18443/18444。后续随源码、main/PR、授权或真实来源证据变化新增报告；GitHub是实时工程事实源，本文只是阶段快照。
