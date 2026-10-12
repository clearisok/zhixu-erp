# 合成工程证据：首次绑定、持续采集、P6 页面接线

核实日期：2026-10-12；GitHub main：db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e。
渲染/业务代码：e4d9737a048474d15d2f25d9e84dae327ac103c5。GitHub 是实时工程事实源；本文是阶段性冻结快照。后续更新用新证据和 manifest 追加修订，不能覆写旧证据。

## 已确认事实

PR99 head 213fb2524bb5f8a2806fea0427a0d3a865612360 的三项检查成功，用户授权后于 2026-10-12T09:27:54Z 合并到 db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e；本分支从此最新 main 建独立 clean worktree。PR99 的默认关闭 Source 基础已合并。本分支的首次绑定、调度和页面接线尚未合并、部署或获人工业务验收。真实 Source 未激活。

实现证据：
- server/ainuoke-source/binding.ts：完整 Discovery、正式6087105、现有 bootstrap mapper；先预览再双指纹确认；空账本或审计凭证/集合/事实相同重试；整批事务、来源锁、权限重查、时间边界、现有 UUID/正式编号/日志。
- server/ainuoke-source/cli.ts、scheduler.ts：显式 check/preview-bind/bind/execute/schedule；检查不访问来源；来源配置0600；持续串行采集、退避、恢复、撤权停止、退出等当前轮完成；默认不启动。
- tools/ainuoke-bridge/ainuoke_bridge/server_source.py：固定报表目录；无任意SQL、报告号或目标URL参数。
- features/order-center/server/read-capability.ts、server/build-identity.ts：默认disabled；显式snapshot候选仅原三页，要求可信session/Server authority/持久来源读取；构建与运行标识不符则停止启动。
- features/ainuoke-material-progress/order-material-summary.tsx：30秒/focus读取、身份/权限/订单scope隔离、旧请求取消、失败/陈旧不沿用事实。
- server/sales-orders/repository.ts：SQL DATE按日历字符串返回，避免Shanghai/LA本地Date转换偏移。
- database/migrations/0001–0012 未改变；没有新增 migration。

## 用户决定及 UI 范围

用户授权“首次订单绑定、持续调度和现有页面接线，保持现有 UI，合成数据测试后提交PR复审”；不修改真实账号/数据库、不部署、不自动合并新PR。授权功能接线不等于批准重新设计。
D099/PR64、D102/P6历史批准证据未替换；本轮没有CSS、布局或断点重设计。新增截图仅记录本轮合成工程结果，不标成人工验收，不替代历史视觉基线。UI范围记录：docs/release/ui-changes/ainuoke-continuous-material-display.json。

## 执行结果

| 检查 | 结果与限制 |
| --- | --- |
| npm run typecheck / lint | PASS，0错误/0警告；最终后续纯证据编辑另行门禁 |
| npm run server:build | PASS |
| 默认 Browser build | PASS，默认orderRead仍disabled |
| 显式Server/session/snapshot build | PASS；computed-styles.json记录完整渲染SHA |
| npm run test:ainuoke-continuous | 30项：29 PASS、1 Linux private-file子测试在Windows跳过 |
| npm run test:ainuoke-server-source | 21项：20 PASS、1 Linux权限子测试在Windows跳过 |
| npm run test:bootstrap-source | 18/18 PASS |
| Python unittest | 54/54 PASS；仅合成transport/fixed catalog |
| npm run test:postgres | 261/261 PASS；独立临时PG/MinIO |
| npm run test:ainuoke-continuous-ui | 8/8 PASS，private Chromium+实际构建+可信六角色+持久PG快照 |
| root tests / release baseline | 此冻结点待manifest收口后执行，最终结果见任务/PR精确head CI |
| Docker候选 | builder编译完成；runtime apk下载仍进行中，不能在此宣称镜像完整PASS |
| GitHub CI | 此冻结点未创建新PR，Linux执行结果待精确head CI |

浏览器覆盖：1440/1280/390屏宽；列表真实CSS/grid/toolbar；详情三列→一列、技术区默认折叠；没有页面级横向溢出；合同日期2026-11-01；物料四事件流/采购价；六角色可见；已持久化下一代在30秒内自动出现；采集失败/陈旧清除事实、恢复重现；缺UUID和未接通模块阻断、不写Browser数据。产品console异常为0。
测试直接点击详情的物料链接。测试器中跨整页导航时document.body暂为空，修正为等待DOM存在后断言；不吞掉产品异常/超时。

截图：list/order/material各1440、1280、390共9张PNG；文件名见当前目录。computed-styles.json记载真实computedStyle的列数、溢出和折叠结果。人工视觉检查本轮order-1440和material-390确认现有样式加载；这不是用户人工验收或逐像素黄金图比较。

## 复审与修正

1. 首绑相同集合不足以证明幂等，已增加持久审计receipt/reviewHash；来源变更不能伪装重试。
2. Discovery adapter身份hash不足以检测raw Num变更，新增完整raw values稳定hash与误通过回归。
3. 来源缺Num不能默认为0；非法日历日期、范围/分页缺失、未来/陈旧、敏感字段均拒绝。
4. SQL DATE读回时区偏移已修正；Shanghai/UTC/Los_Angeles列表/详情/颜色回归。
5. 身份隔离scope成功写回误用订单id导致loading，实际页面回归发现并修复；最终8项重新通过。
6. 默认入口和来源读取分别关闭；runtime能力不匹配拒启动，不因静态allowlist包含路径就自动启用。

## 已知限制 / AI 建议 / 待确认

- 只持续刷新已绑定订单的采购、入库、物料出运、物料出库；新增合同自动建单、旧主镜像/颜色增量刷新不在本轮。颜色数量显示沿用P6，完整分码表UI尚未接线。不是独立库存台账。
- 单账户可见范围≤1000订单、32MiB/600秒worker等上限；真实数量/分页/速率未知，不能保证真实规模。历史快照持续积累，无自动清理策略。
- 上游无跨报表事务快照；前后Discovery一致不等于物料事件同一瞬间。
- 真实私密凭据、安全HTTPS/受控通道、合法采集账户范围、持续运行、外部告警/restart、备份恢复、独立目标库、外网入口与人工业务验收未完成。
- AI建议后续先确认可见合同规模/安全通道，用户私下配置凭据，获授权后做独立候选环境连续演练；建议至少24小时、含一次来源失败恢复并核对抽样采购/入库/出运/出库。这些建议不是已通过事实。
- D105“艾诺科四流持续展示后再上线Ubuntu”保持。PR98历史现场证据保留，但现GitHub CONFLICTING/DIRTY、旧Quote-first顺序/0011摘要与当前不符，不能原样合并。

回退方案：停止调度、关闭候选orderRead/reader、回到兼容0012的旧镜像；保留已提交订单/快照/ledger，禁止自动清库或删历史。本轮没有执行任何真实回退或部署。
