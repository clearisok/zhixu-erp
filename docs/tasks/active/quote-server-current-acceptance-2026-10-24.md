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

未提交本阶段 PR 或触发 Actions。#125 精确 API 快进例外仍待答复，不重推或移动引用。
不自动合并/关闭其他 PR、部署、改账号/业务库、读凭据/真实 Source、启用调度或退役旧环境。
原 G1–G5 及生产/出货/关账 Goal 保持 active。
