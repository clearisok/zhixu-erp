# 网页正常后的登录核验与剩余58张恢复

2026-11-04；输入分支feat/ainuoke-full-catalog-followup，HEAD87e3da64e4d5591319d770b2dcb39a278a74ce27、工作树干净。用户确认艾诺科网页能正常登录；没有验证码/锁定的具体提示证据。这一事实不证明采集器凭据、会话或同一入口正常，不自动解除D180认证暂停，也不授权强制覆盖网页登录。

## 已准备的诊断工具

`tools/ainuoke-bridge/ainuoke_bridge/login_diagnostic.py`复用原SDK、ProtectedTransport、BudgetTransport和封闭请求事件。固定最多1登录、0报表、1HTTP、单响应4MiB、总30秒/单请求15秒、0网络重试/续期；拒绝额外contracts/reportId或未批准明文来源。SDK的isCoverLogin=false保持，任何强制覆盖请求在传输前拒绝。密码仅经私密输入进入进程，不放参数/环境/回执；登录session立即弃用，不传到应用或业务库。

只对返回明确isOk=false且提示与封闭白名单完全相等的情况归类会话已存在/验证码/账号密码拒绝/账号不可用/访问频繁；未知或冲突文案为unclassified，不推断根因，不输出提示、用户名、令牌或原始响应。HTTP401/403与HTTP完成但载荷拒绝仍可区分。它不是修改密码、改变登录协议或新的来源采集API。

Windows新9项合成单测通过，涵盖零报表/二次登录阻断/覆盖登录拒绝/提示过滤/网络无重试/超限与异常保密。原171项和主应用检查不重复；未改原SDK、采集协议、业务API、数据库或调度。Linux候选和零来源预检结果在后继记录，尚未真实登录。

## 拟恢复范围，执行前须冻结实际集合

1. 先在原宁波隔离恢复库只读核对550成功/5登录拒绝/53排队，冻结原608身份、550成功指针与完整成功时间以及仅剩余58的合同集合；不读取来源报表。数据库仍disabled/invalid_credential，旧worker仍PAUSED。
2. 获得本次具体许可后最多执行一次上述登录核验；拒绝、未知、网络或身份异常立即停止，不继续报表。网页登录正常不是自动执行许可。
3. 仅登录核验接受后，按当前快照预览hash执行原显式恢复/CAS，临时仅在同一个隔离库启用；复用现有目录完整两遍校验和每合同发布，仅补58，不重新采550详情、不重置成功/旧失败回执。目录身份变化停止，不新增正式SO、货款或成衣出货查询。
4. 拟合并上限：30次登录（含最初1次登录核验）、2400报表、40分钟；单capture仍1登录/80报表/180秒/4000行/32MiB、0内部重试。暂时错误仅已有首次+2次/1及5分钟退避；认证/证书/未知停止，连续3公共失败或预算/03:20–03:50安静窗口到达停止。上限不保证58全成功；失败和待处理如实保留。
5. 退出后控制disabled、原550指针/时间精确比对；私密原文仅保留原受保护目录。只操作原隔离恢复库，不修改体验站业务库、账号、持续服务或备份策略，不合并或部署。

上述是具体可审阅范围，不是授权或执行证明。当前Git仍NETWORK_DEGRADED；本轮不重复上传或触发CI。D147“新艾诺科采集/绑定/激活/调度仍需具体授权”及D180“认证……不自动重试”保持。

## 准备与只读验收完成，尚未真实执行

诊断源码97449e9400623fc8178de98bbb6b361c382ce684；Linux固定操作者sha256:0031993e3ce9e5fd25b1118474a08e5622fdb90982c27b13d46781ddef48b74a，基于fadf操作者离线补丁构建，未安装依赖。Windows/Linux新9项各通过；正常SDK、原171测试涉及的代码与主应用未变，未重复整仓检查。[镜像证据](../../../artifacts/ainuoke-login-recovery-20261104/image.json)。

只读预检已冻结实际550成功、5登录拒绝及53排队，原608身份未变；550的指针和规范化完整成功时间SHA256为4d2058cbe19491834b53f85542a5bbf38915bb2e34db38571dd00e701aff2895。范围hash为5d87ab8a13dc9389ed57ae482a4c330c152ab93f6694bcb58fb2a5acab26dc2e；私密合同集合只在宁波/home/jackson/weaveops-login-recovery-20261104/review-v2/scope.private.json。[白名单预览](../../../artifacts/ainuoke-login-recovery-20261104/review.json)。首次review在封装自审发现Date对象规范化前后hash不稳定，未执行；新review-v2先转ISO值再冻结并验证回读，原review证据保留，不修改全局旧hash协议。

实际调用原recoverSync的预览路径（未提交恢复命令），当前actor/控制版本/暂停原因、无未知任务/目录回执与冻结范围匹配。执行器只复用原recoverSync、configureSync、captureCatalogOnce与runSyncTick；来源HTTP前再次校验新鲜RBAC、启用的Source profile和账号身份。一次性reservation在请求前落盘；已经有reservation/summary则拒绝重跑，不覆盖旧结果。完整目录仍复核，合同详情只允许58白名单。03:12提前停止新capture，为03:20备份窗口留缓冲。

两项实际Linux阻断烟测均按预期退出1：无approved.json为EXPLICIT_APPROVAL_REQUIRED；合成已消耗额度为RESERVATION_ALREADY_SPENT。它们均在cfg/数据库/来源I/O前拒绝；没有制造批准记录或消耗真实额度。[准备结果](../../../artifacts/ainuoke-login-recovery-20261104/readiness.json)。最终执行器私密文件/home/jackson/weaveops-login-recovery-20261104/login-resume.mjs，SHA256 f60c0d137a4f0ae6f29f717486821d06b11d45b5a947e9e75bfb0cf0296be19c；不能改用旧c7bc范围或旧helper版本。

本轮新艾诺科请求0、业务写入0，未建立approved.json或真实reservation。预检临时启动的本任务PostgreSQL已再次正常停止，数据卷及550成功/全部旧失败保留；旧worker仍PAUSED、体验站不变。GitHub API本轮核实main仍cb5cc29baa49ed7115fdb6c9506b6a80356936ea；不重推已知失败通道、不创建PR或触发CI。自审与本地准备不替代尚未运行的远端CI，也不等于真实核验已获批准。

## 用户已批准并执行：仅登录阶段拒绝，固定范围关闭

用户明确批准call_66ecaab4114e435bb28d2c5c31ffdba3的完整固定范围。执行前核对SOURCE97449、操作者0031993e、scope5d87、helper f60c、owned PG镜像/标签/唯一卷、内部网络及旧worker PAUSED；仅建立本次私密批准/一次性reservation后启动。没有更改认证方式或覆盖会话。

UTC2026-11-04T12:19:55.051Z开始、12:19:55.483Z结束（北京时间20:19:55），432ms；实际1登录、0报表、0未知/内部重试。请求耗时276ms，传输返回后SDK看到payload isOk=false，封闭serverHint为unclassified；按条件立即停止，未解除暂停/启用控制或进入报表查询，容器退出1。[执行回执](../../../artifacts/ainuoke-login-recovery-20261104/execution-result.json)。这不是密码错误的确定诊断；当前没有保存拒绝原文，不能反推具体原因。

用户随后确认是同一账号且密码未改。原本机D:/workspace/ainuoke-key.txt已验证仅owner/System权限、非reparse；本机/宁波两个私密进程使用临时随机HMAC密钥比较，只返回账号原值、规范化值及密码三项bool，全部true。没有输出用户名/密码、持久存储比较密钥/派生值或修改任一凭据。[只读比较](../../../artifacts/ainuoke-login-recovery-20261104/credential-comparison.json)。这排除两份配置不一致，不能证明服务端当前接受该SDK登录。

尝试只读现有Chrome网页时，getState及一次针对性listTabs均因浏览器request-header policy加载错误失败；可见IAB仅Cloudflare/试用站登录页，未读取艾诺科页面内容，未新建/导航/刷新/退出或登录。该工具限制与艾诺科拒绝、Git传输分别记录，不互相归因。不尝试读取浏览器cookie或缓存绕过。

收口首次只读SQL在冷启动后未等ready，命令失败，finally正常停库；补就绪检查后只读复核通过（未新增Source请求）。独立确认仍550成功/5失败/53排队，控制disabled/invalid_credential，原550指针及完整成功时间保留；原worker PAUSED，操作者/owned PG均停、卷保留。真实批准附加approval-closed.json，不修改历史批准/失败回执；不能用未消费的理论额度再次尝试。[保护收口](../../../artifacts/ainuoke-login-recovery-20261104/closeout.json)。

本轮没有修改业务代码、真实账户/体验库、备份策略或持续服务，没有推送/PR/CI/合并/部署。已成功工程测试按相同代码复用；最终收口提交后仅运行精确源码守卫。下一步必须先取得可安全解释的拒绝原因（现有封闭分类线索不足）或维护方登录规则，再决定客户端修复及新的固定核验，不能继续盲目重登或重采550。会话数量、频率、IP、许可等均为待验证方向，不是本次已定位根因。
