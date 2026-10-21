# 交付成功输出误分类：受控修复

2026-10-21，root唯一writer，既有reviewer只读。用户持续授权安全工程/Git恢复，不再逐次询问；不扩展真实账号、业务库、来源、部署或资产退役。

## 基线与本轮范围

- 当前main独立GitHub API核实为996dfedc12da3527343cd3ff2aa5eea35497e10e。
- 从该main建立codex/git-delivery-success-classification，显式FF至已送达并验收的d6b17c7ab7deabdb0f9378d063572476b816c1ad。无继承dirty，不修改旧分支/PR。
- d6的三个原摘要逐字保存在[输入归档](../completed/2026-10-21-production-execution-ui-delivery-inputs/d6b17c7a/)，保留原日期/hash/结果/限制。
- 本轮只修Git交付工具/相关测试并同步交付事实；不改变业务代码、SQL、UI、权限、共享Git/proxy/TLS配置或认证方式。

## 事实、未证实原因与修复约束

d6上传仅一次，工具同时返回STOP_AUTH_OR_DIVERGENCE、TARGET_NOT_DELIVERED和精确目标remoteSha；root随后独立GitHub API得到完整d6。未重推。原始stderr未保留，不能据此确认真实认证失败、分歧或网络根因。

本轮已在当前纯函数复现：exitCode=0、精确远端SHA、正常成功输出中包含合法分支名codex/conflict-check，仍被判STOP_AUTH_OR_DIVERGENCE。errorCategory同样误判。该可复现缺陷不自动等于d6的完整根因。

最小修复目标：成功退出不因普通输出中的拒绝关键词被归为失败；送达仍必须独立精确核实目标SHA。非零认证/权限/分歧及TLS身份/配置异常继续停止；不因成功退出放宽dirty、仓库身份、远端关系、单次推送或未知结果规则。

新增回执只提供允许的退出码/分类/是否超时/耗时摘要，不输出stderr、stdout、token、Cookie、代理密码或credential helper内容。真实交付仍使用原工具及已批准的有界进程配置，不通过重推采集诊断。

## 验收与剩余目标

先用测试自己的临时裸仓库复现，再验证成功分支关键词、缺远端证明、真实非零拒绝、证书异常、回执脱敏及原全部防护。只清理fixture自己创建的临时目录。

实际先跑red：64项中53通过/11失败，0跳过/取消，134767.0109ms；失败含合法ref成功误判、独立证明缺失时误判及新增诊断字段尚未实现。原日志保存在ignored outputs/git-success-classification-red.log。

最小修复后green：65/65，138380.601ms，0失败/跳过/取消；含本机真实PowerShell入口和原全部保护。node语法与定向eslint通过。日志在ignored outputs/git-success-classification-green.log及lint.log；本轮未运行项目/数据库/业务浏览器新验收，不借d6历史结果。

既有独立reviewer补充的P2一并修正：remoteStatus只表达独立观察到的exact/不同或不存在/未核实，不由state倒推；非零认证或证书异常可以同时STOP和exact，但continueLocal/retry保持禁止。纯状态显式要求remoteVerified，已证实分歧优先，不信任孤立SHA字符串。正常成功也不能覆盖超时、启动失败、输出超限的诊断。

首个源码/状态checkpoint为e6fbb892f68b1d14710e383deafb1605e6d94dfd；该精确HEAD对main996的源码守卫通过（11页面/51能力/63条累计UI路径，errors=[]），显式发布基线116/116通过，305613.6671ms。原243证据/51能力与冻结业务源不变。

交付前root另发现该checkpoint的健康零退出早返回会隐藏TLS EOF警告。保留追加red：2个定向用例均失败，3604.5087ms；没有用65/65冒称最终版通过。修复只豁免成功输出的普通拒绝关键词，继续检查传输告警。新裸仓库用例证明零退出且独立exact可以同时DELIVERED_VERIFIED和NETWORK_DEGRADED，仅一次push、不重试、不泄露原文。最终完整工具66/66通过，0失败/跳过/取消，142597.9358ms；最新定向eslint通过。原red/green及新red/final-green各自日志保留在ignored outputs，未覆盖。

既有reviewer只读复核最终两文件增量无阻断；没有改业务、SQL、UI、权限、来源或共享网络配置。接下来保存前向修复checkpoint，核对最终精确HEAD守卫，再有界交付并仅运行相关Release baseline CI；不重派d6 Source/Team。新远端/CI尚未执行，不提前记PASS。

Gate7成衣出货时点仍待用户选择，未实施依赖定义的schema/命令；Gate8的加工服务产值、关账stale及旧CNY工价处理仍待决定。完整Server收敛目标未完成。本工具修复不替代后续业务Gate。
