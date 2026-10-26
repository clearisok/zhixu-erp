# 当前 main 上的 Server 报价验收前移

## 基线与范围

2026-10-24，root 唯一 writer，沿用已有一个独立只读 reviewer。GitHub 只读查询于
04:45:03Z 核实 main `e01a11952b648024c0bd6bf4259de429374981e2`；#125 仍是 CA 草稿。
从该 main 新建 `codex/quote-server-current-acceptance`，显式快进到已验收导航收口
`7635ba658ba82483ac665a14d39cea94443cd920`，开始时 clean。起点回执在 ignored
`outputs/quote-server-current-acceptance-20261024/start.json`；没有 reset/clean/rebase。

本阶段只维护三个浏览器测试/驱动及接力文档，不改产品、SQL、权限目录、workflow、构建配置或运行环境。
复用已保留本地候选中的 `2e1b9efd835061015b538d5ba499a3d027ec29da` 与
`84cd2376512a7835a8a10abd4dc6a0671245553d` 三个测试文件，核对当前规则后前向应用；
不导入这些旧阶段的 CI 接线和状态摘要，不将历史 87/87 算作本次结果。

## 验收契约

- D-145 加工只显示适用工价；字段省略与 null 区分，原始隐藏事实从 repository 核对保留。
- Estimate 完整生命周期保留在经销；加工 UI 不出现入口。单独存在的加工 Estimate API 写入风险
  不因此宣称已阻断；旧候选已有保护切片，须另行按当前代码复核再前移。
- 有 CCT 时按当前确认权威；无 CCT 使用保存的 PV。正控显式具备金额权限，负控不放宽。
- 使用真实领域的合成合同/加工批次创建和显式商业采用；报价确认不覆盖 SO 独立商业版本。
  旧 SO CCT 写入口验证 409，不恢复已废止的共享订单价。
- 保留动态经销材料、null/zero、历史图片、加工每个 PV 的工价/币种、ZIP 部分失败、25 项上限、
  内部汇总、跨账号设置、撤权、只读日志及制造方案/响应式检查。
- 复用分阶段测试驱动：每阶段仍最多 240 秒、每 case 60 秒、读轮询 15 秒、CDP 20 秒；
  失败依赖不继续操作，独立阶段可执行。不得靠重复点击、重放命令、延长读轮询或跳过有效断言通过。
  整体上限只包络八个独立有界阶段，不代表允许单个失败轮询持续三十分钟。
- CDP abort/关闭拒绝未决调用，复用当前已审 `stopOwnedChromium`；确认本轮子进程退出后才清理私有 profile。

## 本轮验证与交付

三文件语法和 scoped lint 已 PASS。独立预审指出新加工空切片的比较不足，已用现有 repository fixture
明确预置非空材料/其他费用、432.125 旧成衣确认价、active/history Estimate 标记；UI 保存后验证
raw 保留、DTO/DOM 隐藏及 Estimate 请求数为零，不冒充专用 API 拒绝。关闭失败仍释放本轮 HTTP/PG，
私有 profile 保留，不清理未确认退出的 Chromium 目录。

待冻结源码后执行本套浏览器验收。优先复用 ca53d8b8 已构建 Server 产物，但必须先证明所有产品、
依赖及构建输入 Git blob 未变，并分别记录测试 SHA、运行后台 SHA 与前端 build SHA；不冒称重新构建。
上一阶段已通过的类型/构建/66 项现行 UI/134 项发布回归保持其原 SHA 与范围，不为本阶段重复运行。
新失败、取消、跳过与未运行一律单独记录；旧 Quote 的 32 pass/44 fail/2 cancel 不覆盖或删除。

冻结源码 `2bd8b64c86e8422396a84b3c30aaad88f7ede412` 的本轮完整 Quote Chromium
**87/87 PASS**（117999.6127ms；含阶段/parent 节点，不是 87 个独立业务场景），0 fail/cancel/skip。
实际执行此前缺口中的加工历史事实、两类确认、CCT/独立订单价、客户 XLSX/历史图片、ZIP 部分失败与
25 项限制、内部汇总、跨账号偏好/撤权、日志及制造方案/响应式检查。进程 exit0、owned cleanup PASS，
HEAD 与237清单稳定；运行日志及结构化回执保存在上述 ignored outputs，旧失败结果完整保留。

本轮没有重建前端：rendered SHA `ca53d8b8ac7100e6c94e49e4aa36fb5ce3eab658`，
测试/后台 canonical archive 为2bd8（后台产品 blob 与ca53逐项相同）。原 archive SHA-256
`3dc6a1b42c4032261ab44db731dc20f3ea0884e425dd4ec209b0577cb40d2738` 已核；
复制的210个 client 文件完整指纹为
`abcc02db3ef2dbb4f1ce2eff4ffdb4ec3b32bc5e4a0ac50b00e07836d3e6bf65`。
`qa-context.json` 分别记录这些身份、全部差异路径和未安装/未重建事实。首次前向拷贝的逐字检查因
原工作树CRLF而停止，未写入；改用Git过滤后的blob核实三文件确为clean后才前向复制，没有覆盖未知改动。

独立最终复审及本阶段最后精确main守卫分别记录。原134项发布回归的守卫/断言/清单源码未变，
保留0db原结果，不重复运行；本阶段不把复用结果标成2bd新运行。

前序收口7cf7238b93b309cc736b473eeedaba394e6a47b7的精确e01a守卫PASS（64461ms，
11页/46能力/22继承UI路径、errors=[]），HEAD/清单稳定。独立最终只读复审确认上述87结果、
范围与构建复用无新增P1/P2；canonical测试文本规范化后与冻结2bd一致，CRLF/LF差异不影响断言，
不额外宣称运行副本原始字节等于Git blob。结果在本阶段ignored outputs逐项保存，无新CI。

未提交本阶段 PR 或触发 Actions。#125 精确 API 快进例外仍待答复，不重推或移动引用。
不自动合并/关闭其他 PR、部署、改账号/业务库、读凭据/真实 Source、启用调度或退役旧环境。
原 G1–G5 及生产/出货/关账 Goal 保持 active。
