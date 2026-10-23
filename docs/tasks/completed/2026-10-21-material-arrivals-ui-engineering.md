# Server人工到仓页面与逐批物流：本地工程验收

2026-10-21；分支`codex/server-material-arrival-ui`，root唯一writer，既有独立reviewer只读。
输入为干净689afa128bc13f56d96dfa5db13403808048943f，无继承dirty；从独立核实的main
996dfedc12da3527343cd3ff2aa5eea35497e10e建立分支并ff-only接续。输入三摘要原Git字节保留在
[输入档案](2026-10-21-material-arrival-ui-inputs/689afa12/)。最终GitHub只读复核main仍为同一完整SHA。

## 授权与交付边界

用户已批准D-147全项目Server收敛Goal，沿用D-054、D-065–069的既有分批到料与唯一物流规则。
本阶段仅在原物料卡片、分批到料Modal、历史Drawer恢复Server能力，属于V1既有行为接线；
没有新导航、全局CSS、密度或运输公式重设计。新增截图只记录此已批准范围的合成工程效果，
不表示用户视觉接受、真实业务验收或部署批准。精确路径见`docs/release/ui-changes/server-material-arrival-ui.json`。

0039仍是唯一人工计划owner；本阶段没有schema、旧迁移、权限目录、Browser账本或Seed变更。
Source供应交期、人工预计到明确Hub的日期、四流实际事件仍各自独立。没有自动补齐、Source-following、
事件绑定、物理SO搬迁、排单/实际完成、价格、币种、成衣出货或关账写入。

## 实际源码与构建

- 首个应用checkpoint：f28762005ee2587ae859a89b1b02c71edaf963f6。
- 入口等待当前读取：61e9a6601114c6cb44963c27658a70a84c1c8352。
- 弹窗同步动作锁：a290edfe3ba26173e21e0c4df08f35be48fe16f4。
- 最终应用源码：**14a71172168fe429c187dadef2f3b654198c3394**。
- 最终验收harness：77b8af68db9a6baf9749bf14a61be541794b2611；之后此报告/图片/能力登记均为证据收口。
- 显式Server quote/master、session、writable、orderRead=snapshot，前端及随后Node构建exit0：
  buildId **20261021-210416**，buildTime **2026-10-21T21:04:16+08:00**，完整gitCommit为14a71172上述SHA。

初次构建未指定完整SHA而只生成短SHA，未用于验收；完整SHA构建后才进行浏览器验收。
早期构建和各次失败日志保留，不用最终结果覆盖其时间或源码。

## 实现事实

Server派生读取在同一事务内取原物理SO最早未取消排单及其采用地点快照；不因它是外发或已完成就换成后续内部计划。
Hub只取持久化跟进，路线/方式取当前正式资料；缺失、停用、歧义或快照不可用均明确显示，不生成默认资源。
style_progress.read原定义已经包含逐物料物流；DTO仅输出所需非金额白名单，不暴露资源备注、联系人、排单数量或商业值。
原物流runtime算法不变，只窄化输入类型，逐批调用最慢可行/最快仍晚算法；距上线与运输余量分别显示。

客户端先保存并读回actor/tab独立sessionStorage原命令，再POST；不碰旧Browser namespace/IndexedDB。
刷新不自动POST，unknown/pending/损坏/未来格式/摘要不符保留。明确未知后仅能重发同UUID、同意图、同摘要的原命令。
已知回执只证明原请求结果，另读当前计划；权限、Source、历史和恢复各自守住边界。
页面及Modal/Drawer使用layout提交owner与epoch，旧成功/异常/401都须通过当前会话和实例lease。
同步mutation及弹窗inFlight锁阻止同一事件循环的重复动作；关闭和更换实例立即撤销旧读取资格。

原Source的30秒/聚焦读取每次完成后，仅触发已有到料GET；没有新增计时器、真实采集或写入。
稳定完成对象覆盖重复相同HTTP错误。已开草稿不自动换scope；Source、tracking或物流依据变化时暂停旧建议，
明确重读后继续且输入不变。GET更新中/失败也不再以旧资料显示有效建议。物流仍是当前参考测算，不冒称随批次冻结。

## 执行过的验证

所有数据库与浏览器均是自有随机一次性PG、loopback与私有Chromium profile；无真实凭据或业务库。
下列总数包含父测试时明确按日志总数计，全部通过项为0fail/cancel/skip。

| 检查 | 实际结果 | 时点/范围 |
| --- | --- | --- |
| 新协议、精确数量、HTTP物流 | 16/16，10846.9011ms | f287应用前完成；raw HTTP及解析DTO均检查非金额/备注过滤 |
| 完整人工到仓定向 | **42/42，40820.6286ms** | a290时点；旧26项加新16项。与14a的server/material-arrivals、客户端/model及唯一物流helper字节经Git差异核实不变 |
| 最终built到仓页面 | **15/15，23964.5257ms** | 应用14a/build20261021-210416，harness77b8；截图独立final-reviewed目录 |
| 原排序/事件页面回归 | **10/10，16812.2166ms** | 同一14a真实构建，原断言不放宽，等待布局稳定后检查 |
| 完整项目 | **927/927，188351.7322ms** | 14a应用之后执行；不是只引用a290旧结果 |
| 类型、全量lint | exit0 | 14a应用，随后测试harness定向lint亦exit0 |
| 发布负向/响应式套件 | 116/116，236006.0124ms | a290时点的既有247证据/52能力；最终新增证据后的重复检查单独记在阶段任务，不冒称本表已跑 |
| 精确main源码守卫 | PASS，11页/52能力/76累计UI路径，errors=[] | checkedHead完整14a；源码/证据最小门禁，不代替像素、数据库或用户接受 |

最终15项built包含：

- 无显式Hub不造默认值；按单位部分分配、精确输入、dirty设置导航、双击只产生一笔。
- Source自动更新后旧建议暂停且草稿不变；两个连续相同HTTP503分别触发新的本地到料GET，无新POST。
- 1920、1536@1.25、1440、1280、900、390六宽度，Modal/Drawer在视口内，表格只局部滚动。
- 真正COMMIT后的回复丢失、刷新不POST、摘要不符保留、known核对释放、unknown明确同UUID重试。
- 关闭Drawer时由MutationObserver释放旧401；历史A→B→A；POST/receipt成功与401四种旧响应均不能影响新A会话或确认其缓存。
- 来源采集失败仍可读原计划/历史并禁止新增；明确清空保存空版本，旧日期/数量历史全部保留。
- 只读角色、无商业端点或Browser回退；CDP单请求超时负控通过。socket关闭拒绝所有等待已实现并静态复审，未另做主动断线实测。

主要丢失/挂起/摘要修改发生在真实API返回后；另有明确的发送前中断及身份切换401负控。
failed Source的HTTP200 DTO与连续HTTP503 catch分支分别验证，不把它们视为同一种错误。
本次是production构建生命周期实测，**没有开发模式StrictMode双effect实测**；其防护仅有代码与独立静态复审证据。

## 发现与修正的真实顺序

不是单次全绿。首轮16组合前的10项有8通过/2失败（含父项），测试忘记断言预期Source采集异常，补assert.rejects，未改采集行为。
lint初轮render ref23错3警告，改layout owner后余effect同步状态1错1警告，外部恢复微任务及memo后全量通过。
独立复审关闭：导航绕过保护、preview tracking/source不一致、129位派生余额、Drawer关闭后旧401，及CDP故障收口。

浏览器首尝试误用tracking表名；v2发现刷新中能打开旧Hub的初始Modal，入口等待读取完成。
v3发现双击虽仅写一笔，但第二动作抢lease导致首动作不能关闭，补同步inFlight。
v4误把POST前出现的待核对横幅当成提交完成；v5误用另一页面登录按钮名，均仅修harness。
新增clear用例首次误点loading禁用按钮，补明确等待后通过。
原排序/事件组合首轮24中22过/2失败（含父项）：失败发生在设置宽度变化后的即时几何测量，现有测试未等待布局帧。
没有本阶段CSS变化；疑似测量时序，根因未单独复现。补两帧并保留原边界断言/增加geometry诊断后10项通过。
最后复审确认主Source自动刷新与到料读取不同步，14a修正并增加真实built正控及重复HTTP错误负控。
原始日志`outputs/g6e-arrivals-*`、旧独立截图目录保留；不自动覆盖旧PNG或修改截图哈希消除失败。

## 新增合成图像证据

精确复制final-reviewed原PNG到新路径，拒绝覆盖已有文件；旧247证据及所有旧截图保留。
已实际查看桌面、手机、来源变化提示及手机历史，未发现文档横向溢出或底部操作被遮挡。

| 新文件（本目录evidence/2026-10-21-material-arrivals-ui） | 尺寸 | SHA256 |
| --- | --- | --- |
| planner-1440.png | 1440×1000 | 2bb5250fd10bc2eb99fae2bbbc4ea2d6ea14c0fa1c66f275970560f4fb11d865 |
| planner-390.png | 390×1000 | 27052b2ad006fbb34bfe0833e0f208e9624b63e3e42b67b373a6227b9b75440d |
| draft-source-changed.png | 764×485 | a1f14062f3c153ce573a2054374648339ded35fa6535045f825fb07aaca9513a |
| history-390.png | 390×1000 | f6964587db7b6c1e166a437d5c542be6acb5cebcf1d8fdf8773e84cb1f08fa2f |

## 分维度结论与剩余边界

implemented=yes：人工到仓owner、原页面与逐批派生物流已实现；不是自动来源到Hub、正式成衣Source或Server关账闭环。
isolatedTest=passed-historical：只指上述具体源码/构建的合成工程，独立复审不代跑测试。
merged=false：独立核实main仍996，尚无本阶段push/PR/Hosted CI；历史664f送达/CI另行保留。
humanAcceptance=not-run：未把用户旧体验或模型查看截图当成本阶段用户接受。
sourceActivation=not-applicable：人工计划读取既有受控快照；未新增真实Source读取、绑定、激活或调度。
trial18443/preview18444=not-deployed：旧runtime及image记录原样保留，没有重观察或部署。

保护3001/50426/59069/62426、旧卷、Browser、账号、其他工作树；62426仍为Gate1的8175源码，不升级。
Git664f非零写入具体原因未明，STOP_AUTH_OR_DIVERGENCE继续；只读成功不证明写恢复，不能盲推、换认证或改共享配置。
D-152的Num/outdate已确认，真实D1935/D1933额度已用完。正式成衣来源身份、颜色映射、Server关账、环境收敛及用户验收仍待。
**完整Goal仍active，不以此页面切片标记完成。**
