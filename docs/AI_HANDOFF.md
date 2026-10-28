# 接力：0052恢复证据已补齐，镜像下载失败不重试

2026-10-28；feat/closing-support-interfaces，main本轮重新核实6479a713e2b80228f008049519ebbd50d10601a8，PR130已批准合并且双父/树已验证。先读CURRENT_STATE/PROJECT_INDEX与D169–D177。完整Goal继续，不把本片完成设为complete。

产品a198d1829675092006708727624ee867be0e7b60；最终业务验证a0272a44be9c0f5961bbc2de51477a996815af57，d243a65df9000fc6dc2a85fe8e8252c1031fe109仅交付失败文档。最新本片从d243 clean开始，只改5个集成测试/夹具和状态文档，没有应用/SQL/UI/权限/依赖变化。原feat/order-closing-month-plan仍0900c2b0ae9bc875e91c4c124bb101f52d227250，前向整合153c04及所有原ref保持。

## 本片实际结果

- persistent-executor-release-recovery-fixture.mjs检查0052真实目录、延迟属性及源码body；显式ZHIXU_LOCAL_TRIAL_EXECUTOR_RELEASE_RECOVERY只在原financial/domain owned路径加入非空真实HTTP match→合法无产出改外发→release。原resource/production/month回执和全库行/sequence快照继续使用同一实现；恢复后app/login前比较0051和0052目录。
- 最终独立PG/HTTP8/8，8274.342ms，真实同SO1.25件锁定一月、当前/basis及生产完整相等；最初8项空冻结集合证明边界已修，原日志保留。原financial/local检查11pass1skip、domain回执4pass、MJS解析/定向lintpass。完整持久镜像恢复因没有新镜像SKIP，不是通过。独立终审0P1/P2，未重跑测试。
- a198 canonical3258 blob唯一Docker构建，目录D:/zhixu-server-convergence/candidates/closing-support-image-a198-757bf06705，tag zhixu-closing-support:a198d182-20261028-757bf06705，USTC APK TLS失败退出1。没有重试/换源/关TLS/宿主安装。build wrapper执行前已按review改为默认隔离网络；原Dockerfile/lock字节未改。全部旧资源集合缺失/变化为空；raw support-linux-image.json/.log和assets-after-failure.json保留。
- 本片证明[见此](tasks/completed/2026-10-28-closing-executor-recovery-engineering.md)；旧状态逐字/hash在docs/tasks/completed/2026-10-28-executor-recovery-input-state/receipt.json，不覆盖旧日期/source/失败。无需重跑a19818实机/811项目/182发布或不变SQL；新test-only改动不借旧结果当作新镜像验证。

## 运行与交付

当前 http://closing-current.localhost:52251/closing-center?year=2027，a198、独立临时合成PG zhixu-pg-it-290e734e433b，Node31904。closing.editor/labor.editor，密码synthetic-closing，后者仅工价。不要刷新用户正编辑表单或重置库。保留59846/62411/62428/3001/50426等全部旧入口、输入、库/卷/备份/Browser。旧62428只到0051，未更新0052。

a027指定一次实际push已耗尽且30秒超时，原事实/STOP边界保留。随后用户明确批准4584新例外，c91既有工具实际仅push1次、退出0/5373ms，Git/API加独立连接器精确核实4584deb786e0dd2fada0d998a16d166b00ccaadc；创建唯一草稿PR131并attach，main6479为其祖先。仅进程级代理7897，未改共享Git/TLS/认证，无重试。本次真实写入正常、工具NORMAL，不能称通道永久恢复；新的认证/拒绝/分歧/证书异常仍停止。普通可靠checkpoint及安全恢复常设授权保留，不自动merge/deploy。

独立既有工作树git-delivery-preflight，fix/git-delivery-upload-budget，最终c91d904d8751275dd6a7830893ce237efa021905 clean；源码a859b44c。唯一push等待180秒，其余read30秒、一次性/STOP/独立核验不变。Git/state79、发布144与精确6479守卫通过，真实GitHub上传0，无PR/CI。不要把工具分支旧产品页面用于关账演示。

0052恢复片8752729f17b191e5dd32a265de5effcf858f601a精确6479守卫PASS。随后独立CI收口仅改原source workflow：增加一次0052模型/SQL/目录检查和一次已有18项UI检查，CLOSING_UI_EXPECTED_SOURCE绑定github.sha、Ubuntu CHROME_PATH明确google-chrome。无新job/workflow/push重复触发，concurrency/缓存/20min保持，已有锁定js-yaml解析通过，初次yaml模块缺失日志保留而未安装。独立只读复审无P1/P2；详情见tasks/completed/2026-10-28-closing-ci-integration.md。新最终守卫以closing-ci-final-guard.log实际结果为准，不预报Hosted PASS。

PR131首次Hosted：Release40639447810成功；source40639447798失败于production-scheduling.integration.test.ts:126全库颜色2!==1；first-team40639447804失败于server-auth-frontend的quote-editor-persistence.test.ts:51 closing route旧false。不是新排单重复写或权限UI本身失败；原job122653911201/122653911180的失败摘录在pr131-ci-failure-observation.json，后续步骤跳过，未rerun。当前仅两份测试修正：disabled/snapshot显式环境并恢复、closing正式路由和未知路径负控；并发前后全库颜色身份完整JSON不变。原红测47/44pass3fail（含parent同源）、新47/47、类型/相关lint通过，review0P1/P2；产品/SQL/UI/依赖未变。精确新守卫看pr131-ci-fix-final-guard.log。详见tasks/completed/2026-10-28-pr131-delivery-and-test-compatibility.md。

下一步按正常可靠checkpoint协议集中一次更新同PR并核实新SHA/必要CI，不手工重跑旧失败或重建PR；遇到新故障仍按原协议停止，不无限重复。新Linux镜像/非空恢复/持久空目标仍待；唯一后续HEAD对照host和owned只读容器均TLS有效/HTTP403，不能视为GET/APK可用，未再次构建。不升级旧62428、不切50426。此后全链最终审计/人工接受、具体来源和依赖退役按Gate0，不自行合并/部署/读新真实Source或删除资产。
