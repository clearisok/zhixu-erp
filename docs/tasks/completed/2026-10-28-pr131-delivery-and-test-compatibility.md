# PR131 精确送达及首次CI兼容修复

2026-10-28；`feat/closing-support-interfaces`。本阶段开始HEAD `4584deb786e0dd2fada0d998a16d166b00ccaadc`、工作树干净；main在上传前再次核实 `6479a713e2b80228f008049519ebbd50d10601a8`。上一状态/所有原失败完整保留在已送达的4584提交，未重写历史。整体Server收敛Goal继续。

## 已确认的远端交付

用户明确批准本次精确交付后，使用独立工具c91d904d8751275dd6a7830893ce237efa021905；其唯一push有界180秒，读取仍30秒。实际只push **1次**，退出 **0**、耗时 **5373ms**、timedOut=false；工具Git/API和独立GitHub连接器均确认完整远端SHA为4584。该次工具状态NORMAL，不意味着通道永久恢复；旧异常与a027超时没有被删除。

只在该进程覆盖本机127.0.0.1:7897，执行前确认监听者是已有verge-mihomo；未改共享Git/代理/TLS/认证。创建前查询同head全状态PR为0，随后创建唯一[草稿PR131](https://github.com/clearisok/zhixu-erp/pull/131)并附加到当前任务。实际124 commits/336路径、0045–0052八迁移，与PR说明一致；main为head祖先，本地无冲突。没有合并/部署或其他分支上传。

## 首次Hosted CI实际结果

| 工作流 | run | 结果 |
|---|---|---|
| Release baseline | 40639447810 | success |
| Ainuoke server source | 40639447798 | failure，排单旧测试断言；后续步骤跳过 |
| First team access | 40639447804 | failure，旧路由契约断言；前面的类型/lint/项目、权限SQL及两种构建成功 |

没有手工dispatch、rerun、重复PR或因旧计费失败批量补跑。不能写三项通过；两处失败在本地用原文件复现。source并发命令仍实际返回同assignment、同版本、一个回执和一条排单审计；失败点是全库颜色身份count2与旧expected1。first-team的失败发生在server-auth-frontend命令，不是权限账号页本身。

## 两份测试修正，业务产品不变

- `quote-editor-persistence.test.ts`：在try/finally内显式设置disabled/snapshot并恢复原环境，disabled拒绝关账列表/详情，snapshot允许已批准的这两个正式入口；未登记路径和数据管理仍拒绝。不是为了通过测试关闭关账功能。
- `production-scheduling.integration.test.ts`：订单默认月份初始化已为多张SO建立颜色身份，固定全库count1已过期。改为保存并发命令前的全库颜色身份完整JSON原件，确认存在当前SO的实际颜色，命令后逐字节值比较同一集合。原assignment、版本、回执、审计及冲突强断言全部保留，未放松幂等要求。

原两文件红测 **47项、44pass/3fail**，23140.9662ms，其中parent/child为同一排单失败，另一路由失败；修后同两文件 **47/47 PASS**，25666.2238ms，0fail/cancel/skip。定向lint零warning及非增量TypeScript检查实际通过。独立只读reviewer核对两处diff，无P1/P2且无负控放松，未重跑测试。最终精确守卫以本片日志实际结果核对，未提前宣称通过。

新raw在outputs/approved-support-flow-20261028：authorized-delivery-4584-attempt.json、git-delivery-budget-authorized-4584.log、delivery131-first-observation.json、pr131-ci-failure-observation.json、pr131-obsolete-tests-red.log、pr131-obsolete-tests-green.log、pr131-ci-fix-lint.log及后续pr131-ci-fix-typecheck.log/pr131-ci-fix-final-guard.log。原应用a198、SQL、权限、UI、workflow和依赖均未因本兼容修复改变；不重复811/182/18或已成功的Hosted检查来冒称新一轮全验收。

## 未完成的持久镜像边界

此前a198唯一镜像构建的USTC APK TLS失败仍保留；没有第二次构建。随后仅做一次同一公开APK索引的host/新owned只读容器HEAD对照，各1次、8秒上限：两边TLS有效但均HTTP403。HEAD拒绝不能证明GET可用，也不能证明APK原因全部解决；没有换源、关闭证书、共享网络改动或Source/DB请求。完整0052镜像恢复及新持久空目标仍未完成，不能用旧cf77/0051代替。

当前52251临时合成演示、旧62428持久空候选与全部旧输入/资产保持。PR继续草稿；新兼容修复的远端提交/必要CI须按实际后续回执分别记录，不把4584的旧成功或失败当作新提交结果。不自动合并、正式部署、切50426、读新真实来源或修改既有账号业务库。

## 136标准checkpoint交付与后续只读对照

本地兼容修复代码checkpoint为 **136ba1675c54d2ae147fdc50c72a99169aec6495**，工作树干净；精确6479守卫实际PASS，12页/68能力/38UI/errors为空。此前4584已实际正常写入、退出0且独立核实，因此按既有可靠checkpoint普通交付及用户常设授权，对这个新checkpoint集中尝试一次；不是再次上传4584或自动合并。

实际preflight Git读取30.798秒超时，既有独立API预检成功后工具只push1次；Git退出128，uncertain_transport、64.012秒，非工具180秒预算超时。工具独立API和随后连接器均核实远端仍为 **4584**，明确TARGET_NOT_DELIVERED；新CI为0。此时重新进入NETWORK_DEGRADED，不在后续Gate重复push。

仅又运行一次原只读诊断工具，继续使用同一进程级7897覆盖：default、HTTP1.1、OpenSSL+HTTP1.1三种只读对照分别30.807/30.895/30.762秒超时，configurationChanged=false、pushSubmitted=false。不能归因为特定TLS后端，也不能据此宣称已查清全部根因；没有共享代理/认证/TLS更改、证书关闭、文件API重建commit或第二次上传。一次读成功不能保证写入可靠，第一次成功5373ms也不是长期恢复承诺。

PR131正文已更新为真实状态：4584已交付、首次CI一过两失败、136本地47/47修复未送达，不误写新CI通过。raw `normal-checkpoint-delivery-136-attempt.json`、`git-delivery-normal-checkpoint-136.log`、`diagnose-process-proxy-after136.log`保留工具状态和次数；没有要求用户重复拼命令。本片最后仅收口交付/网络状态文档，代码/测试/SQL/UI/依赖相对136不变；不为文档再次跑47/811/182或Hosted，精确守卫结果仍准确绑定136。
