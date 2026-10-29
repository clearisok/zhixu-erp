# PR131 批准合并、精确 main 镜像与受控 staging 配置

2026-10-29；本片 baseline **5c8cb8037376288aa71043e799a057e21f1b985d**；新分支 `feat/staging-controlled-runtime`，开始工作树 clean、无继承 dirty。原 `7bf3` 的 `feat/closing-support-interfaces` 保持 e94a351a clean，不切换或覆盖。旧三摘要全文/原字节/hash见 [input-state](2026-10-29-main-image-staging-profile/input-state.json)，本片安全验证摘要见 [validation-summary](2026-10-29-main-image-staging-profile/validation-summary.json)。

归档捕获main5c8 Windows checkout原工作树CRLF字节，文本与5c8 Git blob按换行规范化相同。独立复审发现首次checkpoint的自动换行会使发布blob与原件hash不符；后继只为本目录三份归档设置`-text`并重新提交保留原字节，原fa18及5c8对象不改，receipt原长度/hash不改。不把working-tree原件字节冒称原Git canonical字节。

## 已批准合并与必要检查

用户明确仅批准 #131 转就绪，以 merge commit 合入 main、保留原始历史。执行前重新核实 head e94a351a84906c1e4feb35f81b48dfe023d11e57、base6479a713e2b80228f008049519ebbd50d10601a8，无冲突。三项必要 CI 已终态成功：Source40726286740（含实际关账18及Python152）、Release40726285079、Team40726285483。没有手工重跑或触发额外工作流。

合并后通过独立API读取验证 main5c8 双父依次为6479和e94；树2753102b7573bfe459b76281d27634f22b19471f与已审查合并预览、e94代码树相同。分支与全部原提交保留，没有合并/关闭其他PR。一次fetch正常exit0、2699ms；仅进程级采用系统当前7888代理/OpenSSL/HTTP1.1、原认证与TLS验证。共享旧17989配置不修改，旧2fd exit1原因仍未证实，不倒推为已解决或保证永久可靠。

## 精确 main Linux 镜像与非空恢复

对 main5c8 canonical `git archive` 的3308个Git blob逐一核对，0 overlay，原Dockerfile/lock未变。package.json与既有a198构建相比仅在原test脚本追加同SO闭环测试，不改变依赖或构建。最初脚本命令引号解析失败未执行，随后过严package守卫在Docker执行前拒绝；精确核对仅脚本差异后才实际构建一次，不隐藏前述准备失败。

- image **sha256:80ff7e5318e0f9345cdb63715d2c6e6f4eb2087dc34527abc942056e39d85ff8**。
- buildId `server-main-5c8cb803-d20d6f9c51`；buildTime `2026-10-29T00:28:15.908Z`；archive SHA256 `80f4e5b255e133acc60947cf7b6ac66a390def61b81a510404d3a656ffe34280`。
- 实际标签及编译build-info精确一致：server/server/writable/session/snapshot；51个迁移文件，最高0052。不把最高编号误称文件数量。
- 原bounded builder携带a198的历史pre-review/GET说明；原报告保留，新reviewed报告明确那是历史，未声称本片又做该GET或构建前独立复审。摘要分别绑定原件hash，不覆盖旧证明。

一次实际精确镜像恢复：**9/9，0失败/取消/跳过，未超时、无重试**。harness e94与main5c8相同Git树。两个全新自有合成项目、独立持久DB/对象/密钥卷及不重叠网络；开启domain、source-ledger、financial和0052 executor-release四项原有opt-in。覆盖重启/冷重建、原UUID/密码hash/采用版本、主信息/颜色/物料、申请与成衣观察、生产、关账及来源代际/原回执、DB与附件离线备份和独立恢复；冻结/执行归属保护在恢复应用启动前已验证。诊断JSON按原生TAP转义严格可逆后解析，不借解析失败重跑数据库测试。

恢复前后74个旧容器、201卷、37网络的选定身份/状态零缺失或改变；只清理harness自有临时fixture，不清理旧资产。该9/9使用合成worker/记录，真实Source请求为0，不能代替D105真实首绑/有限续刷和用户业务核对。旧90e/a198证明保留各自source，不冒称新测试。

## 最小公网配置增量

只改 `ops/quote-trial/trial.mjs`、`compose.yml`及两份相邻测试，不改产品、权限、SQL、依赖或UI。D178保留本机loopback探针及原端口，单独显式配置唯一staging浏览器Origin；实际Compose分别校验两个Origin。未新建ERP运行栈、放宽TLS或公开DB/app/MinIO端口。

本地26/26配置/对象/就绪测试（5565.8403ms），包含真实 `docker compose config` 两模式与继承环境漂移负控；相邻cutover30/30（4706.4917ms）。语法、相关eslint、diff检查通过。独立reviewer只读审查四文件及调用关系，无P1/P2，前轮网关实际Origin校验缺口已修正。未做公网反代/TLS/cookie、真实登录或附件端到端验收；静态/config通过不等于部署就绪。

此增量晚于80ff镜像：80ff只属于已合并main5c8，不宣称包含后继profile。新配置最终精确守卫、发布回归、checkpoint、远端/CI结果独立记录，不预报新head通过；一次集中交付、禁止为旧余额问题批量rerun。

## 当前真正剩余项

1. 本profile的最终本地门禁、唯一草稿PR/必要CI/复审；其合并需单独批准。
2. 精确最终候选的新持久空目标、反代/证书/Host/Secure cookie及附件核对；不替换旧7cd或50426。最终main变化后冻结相应镜像，不复标80ff。
3. 同SHA干净源码operator（Git+锁定依赖）至独立DB的Linux正控；应用镜像无Git/tsx，不能充当此工具或临时开放DB绕过。
4. D147具体执行单：目标指纹、PI2608-257/PI2609-039、首绑/四流次数/截止/停止方式，独立6086941范围；6086979先从既有D1933证明唯一定位C1，未定位不猜。旧真实额度已消耗，无新登录、凭据读取、报表请求、绑定、激活或调度。
5. 获准真实首绑及有限续刷、页面单位/数量/人工接受后，才提醒 `staging.weaveops.top` 隔离体验已具备晋升条件。新宁波目标采集不能跨用本机许可。

本片没有部署、真实业务写入、账号修改、旧账本迁移、共享配置修改或资产退役。原完整Gate0–8/R继续，不把合并、工程测试和镜像成功当作整个Goal完成。
