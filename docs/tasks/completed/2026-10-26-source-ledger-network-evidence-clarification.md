# 来源账本恢复证明的网络证据澄清

2026-10-26；前向澄清，原[冻结证明](2026-10-26-source-ledger-recovery-validation.md)与507清单保持原字节。

## 更正范围

原证明第31行和准备时task第3行的“普通PowerShell约5秒TLS中断”超过了人工回传JSON的证据范围。准确事实为：用户普通PowerShell的default、http1.1、openssl_http1.1三项均exit128、category=uncertain_transport，分别5348、5359、5359ms。该JSON没有TLS原始错误，不能据此确认具体TLS故障、两环境同一根因，或另一笔Git退出1的原因。只能确认普通PowerShell也发生约5.35秒不确定传输失败；未由本代理重新执行。

人工回传原件outputs/order-readchain-delivery-main-869e-20261026/manual-powershell-diagnosis.json，SHA256 525b1ca1b3d0d7d19898b4b5c55310f90ff5d93e19bab6eb7dde179f71dd6069；source明确为human user response，原configurationChanged=false、pushSubmitted=false。原Git退出1的STOP_AUTH_OR_DIVERGENCE根因仍UNRESOLVED，Git/ref远端写冻结不变；不为澄清重新探网、改代理/TLS或认证。

## 工程结果归属不变

Test source 6dcea703ccc5372ad1b6d68ad919a287ef975dc6＋原6d镜像，实际9/9、488736ms、55张业务表非空；8项回执检查和3项实际Node TAP校准不变。原wrapper汇总初失败、原日志和独立离线reconciled结果均保留，不重跑runtime、数据库、构建或CI。旧50/179/27所选元数据核对仍按原范围，不是业务内容审计。

首次同HEAD守卫37bc5a2ba23ea3e53c327dc948d8f6e6e7be10fa为PASS、128084ms，仅归该旧head；本澄清后的最终head另验，不用旧PASS冒充新head。准备task的“尚未运行”已标明为准备checkpoint记录；当前终态见冻结回执。本澄清不改变产品/API/SQL/UI、商业口径或完整G1–G8/R范围，不合并、部署、切换、退役或操作真实数据。
