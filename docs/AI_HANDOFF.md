# 恢复点：已批准交期维护接线，待精确built验收

最新b2b92224精确串行构建通过；built前9阶段通过含焦点修复/CAS/存储/voidall/ABA/刷新。第10阶段测试变量preview遮蔽同名UI helper导致TDZ，仅改为batchPreview，产品无变；须新checkpoint及精确构建继续完成剩余完成订单/加工/七角色，不宣称完整PASS。

2026-10-22；feat/server-delivery-plan-maintenance-ui；main996dfedc12da3527343cd3ff2aa5eea35497e10e独立核实，输入377。最近可靠客户端406a1fffe65fc442913c2d66a0c7cc4d77f24a74已精确远端；页面源码checkpoint2468db4a775223324c15ccb3f4116bc6f2a67591已本地保存，built与交付仍待。一次Execute STOP（push1/exact远端）后仅原工具DryRun零push DELIVERED_VERIFIED，保留诊断，不猜stderr原因、不重复push。root唯一writer，既有server_convergence_review只读，不新agent；完整Goal active。

先读[当前任务](tasks/active/server-delivery-plan-maintenance-ui-2026-10-22.md)、[冻结批准](tasks/completed/2026-10-22-delivery-plan-maintenance-ui-approval.md)、D100/D154/D156及实际dirty。三份输入摘要在completed/2026-10-22-delivery-plan-ui-inputs/377a3c9e和406a1fff，逐字节保留。原call_d4696fa532a64295ba294304d8404abf已答按草图实施，不重问批准；无新Source/业务库/合并/部署授权。

页面已接线：三个纯client/draft/pending、maintenance hook/组件/css、Modal默认false的closeDisabled、detail实际session对象owner与source/delivery双guard、旧GET严格投影与刷新token。输入UUID入口小写化，processing source对照不适用。API仍为原GET/PATCH/完整原body POST receipt；人工正数量/日期/100变更，历史全读16MiB+64KiB，默认0/null不回写。同值不算实际变化、显式void保历史。

pending技术sessionStorage actor/tab单槽先存读再写，不碰Browser账本。未知不清槽/不自动PATCH；仅严格原receipt unknown后二次人工确认才可重发完全相同UUID/CAS/body，发送前核对原槽存在且canonical相等。同步锁一次确认一发；再次失回执清旧许可，必须重新核对。current session/SO/layout lease保护全部异步，迟到401不能注销新会话。已知终态后旧receipt不冒充当前集合，须另GET并刷新展开披露。

实际client33/33（538.1156ms）、类型/lint/Server编译通过；静态review修复应用结果漏核对、processing误标、大写UUID及unknown无恢复死角，目前无新P1/P2。项目927首跑926/1旧Modal regex失败（197297.441ms），定向7/7已适配（222.8072ms）；第二跑因新增D156冻结证据未绑定失败，日志保留。须先提交新D156 blob，再追加supersedes证据，旧ID/hash不改，随后重验，不假报PASS。manifest270/57；批准89993412和新决策2468均已冻结，原269份证据不改。

f6639c5ee6c43162cbc7f1f6a63e62f8e9583175已本地干净保存并通过精确guard11/57/87，未交付。构建与项目并行时有原生构建异常及两子进程失败，根因未定；同源码串行构建通过，完整项目需node --test --test-concurrency=1 tests/*.test.mjs串行重验，不放宽超时或改共享环境。当前只有root产品焦点修正/测试屏障及准确文档增量；三个输入摘要已逐字节归档到f6639c5e。

新built浏览器已实际三次运行（日志在outputs/delivery-plan-ui），前三次的测试时序问题已修正；第三次前4阶段通过，第5阶段真实产品缺陷为重发后原按钮消失、焦点离开主弹窗。现交期组件增加同lease/仍open/最上层的局部延迟focus fallback，取消延迟回调保护切单/身份/卸载；保留焦点断言并补取消重发不写入。需类型/lint、源码checkpoint、全新exact HEAD显式Server串行构建后继续built；后续CAS/存储/voidall/ABA/加工/七角色尚未通过，不能预报。Source workflow已加此用例，不触发部署；API42/42已通过（31787.6579ms，自有一次性PG，无skip），后台未改不重复并发。

前置377三CI已成功：39699348958/39699352582/39699355389，均attempt1，00:48:51Z核实；不重dispatch。原固定Source调用candidate失败0 HTTP/0报表、未读凭据；离线修复已验证，但旧run-authorized-filter.mjs及wx尝试已消费，不能重跑。原F/105失败/c0d镜像8/8/144回执历史保留。不改3001、50426等旧端口/卷/账号/Browser/工作树，不建重复累计PR、不merge/close/正式部署。Num/outdate已确认，其他原关账问题仍待。
