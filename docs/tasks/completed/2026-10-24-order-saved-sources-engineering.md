# Gate4B 当前保存来源展示：隔离工程证据

2026-10-24；本文件记录已完成的本地工程验收，不证明合并、部署、真实来源激活或用户人工接受。
核实的 main 为 `e01a11952b648024c0bd6bf4259de429374981e2`；开始时工作树 clean。
冻结产品及测试源码为 `6ef9e37493127661a9d805979660378f6340ad5f`，tree
`168eaa9c279bdd13ebc87f48aff7d964b3882fbe`，分支 `codex/order-source-disclosure-current`。

## 实现与批准范围

沿用 D-147 / 已批准 G4，窄 V1 恢复原详情位置的颜色尺码和织序交付计划读取。
`server-saved-order-sources.tsx` 与原详情组件保留原 P6 颜色/数量/价格表、样式和导航。
两个 disclosure 默认折叠；颜色按保存槽位展示，未知、待确认0、明确0及已记录 matrix 异常独立，
不自动求和或补算。交付计划只在原技术详情展开后 GET，保留精确 decimal、空日期、0和作废历史；
计划所有权与艾诺科合同对照分开，加工不虚构艾诺科事实。没有计划编辑、来源刷新或 Browser fallback。

新 GET 的回复归属绑定 layout 已提交的订单、session 对象、展开状态及尝试次数，先核 owner
再更新/失效。当前401返回登录；旧成功/401、错单、离线/403不留旧计划。只读手动重试不重放写入。
原金额测试保留 main 已增强的字段断言，仅加5行递归泄漏/无害ID负控，没有删除原断言。

## 实际执行

在新的 owned Git archive 中验证；不安装依赖，使用现有 node_modules junction，独立 PG/HTTP、
私有 Chromium profile 和合成账号/来源。测试结果的数量包含父项，不能当作独立业务场景数。

| 检查 | 实际结果 | 进程耗时 |
| --- | --- | --- |
| full TypeScript | PASS | 24,618ms |
| Node 编译、实际 import 编译后的 app | PASS / PASS | 11,839ms / 1,899ms |
| full lint | PASS | 37,547ms |
| 修改涉及的商业来源 API | 9/9，0失败/取消/跳过 | 9,851ms |
| 根测试非发布部分：97个文件 | 811/811，0失败/取消/跳过 | 14,076ms |
| 真实 before 浏览器观察 | 2/2，0失败/取消/跳过 | 17,522ms |
| 当前 after 保存来源浏览器 | 9/9，0失败/取消/跳过 | 20,043ms |
| 原 P6、来源向导两个受影响浏览器文件 | 20/20，0失败/取消/跳过 | 68,258ms |
| Browser 兼容构建、产物检查 | PASS / PASS | 9,509ms / 2,661ms |
| Server/session/snapshot 构建、产物检查 | PASS / PASS | 9,930ms / 2,488ms |

两种产物各45页面、1 fallback、109 assets，检查器为独立已审
`1028a5bb5e5e12f31e5747414dec9405838d786c` 的原文件，没有降低检查。
Browser 有1条 `/system-settings/users` modulepreload 提示，Server为0；提示不等于缺失必需产物。
独立源码/日志复审未发现新增 P1/P2；复审者未重新运行测试。
发布134及最终精确 main 守卫在后续 metadata 收口单独记录，本文件不预先宣称它们通过。

after 实际覆盖：1920、1536(DPR1.25)、1440、1280、900、390，默认页无横溢出，前五宽度3列、
390为1列；默认折叠、不提前 GET、键盘展开；缺槽/重复尺码标签、超26槽、零/未知；大数小数精度、
空日期和作废；加工、七角色、不发业务写入、不回落浏览器；离线/403/错单与只读重试。
真实登录切换中旧200跨 A→B→A、旧401跨同账号重新登录；当前401清理。没有宣称整个页面所有请求
或全部展开内容均获像素证明。私有 Chromium/HTTP/PG 清理终态通过，不处理其他环境或 profile。

## before 与 after 身份及图像

before 复用原已验收真实 Server 客户端 `ca53d8b8ac7100e6c94e49e4aa36fb5ce3eab658`，
后台与测试为当前 `6ef9e37493127661a9d805979660378f6340ad5f`；明确 before 模式才允许此分离。
其原详情组件及 globals/Foundation/Order CSS 与4A `8da0fafb5ebe1f15bb747f44e69ef4ef779d93c5`
逐项 Git blob 相同，不冒称新建4A前端。after build-info 为当前完整6ef9，
buildId `saved-sources-6ef9e374-server-canonical-20261024`，实际构建时间 `2026-10-24T05:40:06.885Z`。
两个 build-info 与几何原文在下列证据目录保存。主控实际查看下列7张图；只是工程检查，非用户接受。

- [before 1440](evidence/2026-10-24-order-saved-sources/before-default-1440.png)
- [before 390](evidence/2026-10-24-order-saved-sources/before-default-390.png)
- [after 1440](evidence/2026-10-24-order-saved-sources/after-default-1440.png)
- [after 390](evidence/2026-10-24-order-saved-sources/after-default-390.png)
- [尺码 1440](evidence/2026-10-24-order-saved-sources/after-sizes-1440.png)
- [尺码 390](evidence/2026-10-24-order-saved-sources/after-sizes-390.png)
- [计划事实](evidence/2026-10-24-order-saved-sources/after-plan-facts.png)

## 保留的失败、证据和边界

第一次 Browser 构建在 Windows 短路径 `C:/Users/ADMINI~1/...` 下 exit0，但产物检查
`build_artifacts_route_not_rendered` 失败；保留了两个独立 Session Context 的产物及完整日志。
没有将 exit0 宣称通过。随后在同一源码、依赖及模式的规范长路径做一次有界对照，两构建/检查通过；
buildId/time亦不同，因此这是支持路径相关判断的证据，不是严格单变量或永久根因修复。
失败产物保存在本次 owned context 的 `outputs/short-path-build-failed/`，不影响旧环境。

详细回执在 ignored `outputs/order-source-disclosure-current-20261024/`，canonical archive SHA256
`0954801c7b833e74028cd4028dccf650b947a4e488492b8e6cb68a48fd7a5bf9`。
旧9/9、c77的103/103、原发布134、237证据/46能力、PNG及运行快照保持各自身份；不重记为当前验证。
当前根测试的另外两个发布文件在最终收口运行，届时与97文件构成标准根套件，不省略或重复计数。

本阶段 Actions=0；无 push/PR/ref mutation、merge/close、部署、真实账号/业务库、凭据/Source读取、
绑定/激活/调度或旧入口退役。#125精确 API 例外仍待答复；不借只读网络成功撤销原 STOP。
新能力为 implemented=yes、merged=false、isolatedTest=passed-historical、humanAcceptance=not-run、
sourceActivation=not-applicable、18443/18444=not-deployed；未新观察运行态，其历史 source/image不变。
4C计划编辑、G5及生产/出货/关账不由本文件冒称闭环。
