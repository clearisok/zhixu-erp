# 0052 精确镜像、非空恢复及新持久空候选

2026-10-28；`feat/closing-support-interfaces`，阶段起点 `24f44284e94a0dbfda40dfc23915f0be665ea139`、clean。沿用最近独立核实的 main `6479a713e2b80228f008049519ebbd50d10601a8`，本片未 fetch 或执行 GitHub 写入。产品仍是已验收的 `a198d1829675092006708727624ee867be0e7b60`；后继仅测试、CI及证据变化，不改产品、SQL、权限、UI、依赖或业务规则。

本片实施原 Gate1/Gate8 的隔离持久工程，复用既有 Dockerfile、运维工具及恢复测试，没有升级旧目标或执行正式切换。原状态逐字/hash保存于[输入档案](2026-10-28-support-persistence-input-state/receipt.json)，精简实际结果见[机器回执](2026-10-28-support-persistent-runtime/receipt.json)。

## 镜像：一次有证据的不同构建选项

原 USTC 构建失败及其资产核对继续留在[原证明](2026-10-28-closing-executor-recovery-engineering.md)。本片先在已缓存 Node 内容镜像的独立只读、非 root、无卷/端口容器中，对官方默认 APK 索引执行一次有界 GET：TLS有效、HTTP200、完整528432字节。此前 USTC 的 HEAD403不能证明GET可用，本片未据此重跑原失败方式。

随后在既有Gate1授权内，执行前独立复审无P1/P2后，一次使用原 Dockerfile 已有 `ZHIXU_APK_MIRROR=default` 选项构建。没有改 Dockerfile/package/lock、共享代理、Docker daemon、证书信任或宿主依赖；没有关闭TLS。3258个 a198 Git archive blob逐一核对，0overlay，`--pull=false`、默认隔离构建网络、300秒上限。

- 新不可变镜像：`sha256:90e36de7c3d61ca137b2d5a4227e848b83ed57579bd146ce25501dbc6fe35f4f`。
- build：`closing-support-default-a198d182-b7ae3db3a4` / `2026-10-28T06:12:40.247Z`。
- 目录：`D:/zhixu-server-convergence/candidates/closing-support-image-default-a198-b7ae3db3a4/source`。
- 实际构建退出0；image labels与编译后的build-info均精确匹配a198、Server Quote/master、writable/session/snapshot。迁移文件51项，最高0052，不是52个文件。

## 完整非空恢复：9/9，原日志解析失败另记

使用当前既有 `persistent-local-trial.integration.test.mjs`，明确开启domain/source-ledger/financial/executor-release四个测试选项；固定上面内容镜像，创建两套全新owned项目和不重叠网段，不使用现有数据库。实际 Node 退出0，TAP **9通过、0失败/取消/跳过**，369010.8379ms，没有重复执行。

实际覆盖显式空schema初始化、错误对象凭据/CA/缺bucket负控、正式Quote/附件API、非空合同/生产/物流/物料及关账输入、重启与冷容器重建、原精确目标备份、拒绝writer/篡改/可写恢复挂载，以及独立恢复后原ID和附件字节读取。恢复启动前比较121张public表、sequence及0051/0052真实目录保护；业务投影另用113张表口径，不能与空库111张非白名单表混作数量回归。

非空输入含两个锁定期间、4条财务归属、原确认价/明确USD采用和13条月份版本；2.125件无产出执行归属恢复通过真实preview/command/原回执完成。生产、当前商业依据及锁定财务保持；恢复后相同保护函数body SHA256为：

- 0051：`f2df4338587d4dd7a8719a03e588bb0b8e8072cd4efadb7a8692a39fa3985ef5`。
- 0052：`6ada6b9ae8f6d9c5ebf48ff9a7e07df0d8108f8543b1625436ecec1c340b7e76`，启用O/type5、deferrable及initially deferred均true。

测试本身通过后，私密汇总wrapper直接JSON.parse了TAP诊断，因Node reporter额外转义反斜杠而误记 `FAILED_RETAIN_OWNED_EVIDENCE`。原失败回执/原日志保留；没有把该wrapper退出1当产品或恢复测试失败，也没有重跑。离线按本机Node24.16 native tapEscape的逆变换解码唯一诊断，再以原规则逐字重编码验证，核对原exit0、9/9、五项恢复标志、两个锁定期及0052回执，另存 `PASS_RECONCILED_OFFLINE`，绑定原件SHA256。独立reviewer复核通过；校正新增测试/Docker/网络请求均0。原harness已成功，因此仅清理其自己的临时双项目，未清理旧资产；原wrapper名称不能误解为仍保留两套成功测试容器。

## 新持久空候选：READY，未替换演示

| 项目 | 实际结果 |
|---|---|
| 项目与私密目录 | `zhixu-quote-trial-support-60b2e53765`；`D:/zhixu-server-convergence/support-empty-a198-60b2e53765` |
| 入口 | `https://localhost:65139`，只有gateway发布127.0.0.1端口；无50426切换 |
| 运维来源 | a198 canonical目录中17个ops文件逐一核对Git blob，长期配置不依赖可变checkout |
| 隔离 | 全新project/四卷/两个网络；拒绝任何同project旧容器、卷或网络名称/标签，网段避开宿主与旧Docker保留范围 |
| 新网络 | default internal `10.253.240.32/28`，gateway ingress `10.253.240.48/28`；两个网络身份/IPAM/internal及每容器附网已核对 |
| 初始化 | 原工具check→prepare-local→init→objects-init→start各一次成功，不先Seed再清空 |
| 空库 | 121张public表逐表计数；排除原10项技术白名单后111张全部0；仅1名新local.admin/role-server-admin |
| 持久与重启 | 五服务healthy、四个owned named volumes；restart一次READY；重启前后全部表计数、技术身份/角色、51项迁移和完整0051/0052目录/body摘要相等 |
| 就绪 | TLS有效的health200/database ready和build-info200，与精确image的build-info相同；原start/restart签名对象存储检查通过 |
| Source | 既有local-empty/snapshot配置；profile/target等非白名单表0，无新真实读取、绑定、激活或持续调度 |

没有登录、导入或业务写入新空候选。新技术凭据仅由原私密工具生成，仍在其私密文件，不进入Git或日志。自签证书未安装到系统信任；浏览器信任、视觉及用户业务接受未运行，未自动越过警告。

三个阶段各自核对原69容器、195卷、35网络选定身份/state/name/image集合，missing/changed均空；这不扩大为旧业务内容审计。旧52251合成体验、62428/0051候选、62411/59846、3001/50426及其全部输入保持。

## 交付与复审边界

既有独立reviewer在执行前发现并关闭了wrapper的reporter/证据字段、旧网络复用保护缺口；目录检查补齐原0051/0052 schema/function/language/args/security/config/condition契约。执行后独立核对六份私密原件hash、三份旧状态Git字节，以及公开/私有镜像、恢复、空库和资源回执逐对象一致；9份docs增量无P1/P2，reviewer没有重跑测试或操作环境。最终精确基线守卫在本片commit后执行，结果以本机 `outputs/approved-support-flow-20261028/support-persistence-final-guard.log` 的checkedHead及实际exit为准。

本片不重跑未变化的18项UI、811项目、182发布或47项测试修复；这些仍绑定原精确源码。本片没有新push/Hosted CI/合并/正式部署。PR131远端仍以原4584及首次Release成功、另两项旧测试失败为已核实事实；136本地修复及后继文档待恢复交付，NETWORK_DEGRADED继续，不再撞失败通道。

新候选READY不等于已合并、50426已切换或用户接受完整业务闭环。全局Goal仍active；保留后续精确交付/必要CI、明确合并、用户体验及目标切换、具体来源授权和旧资产依赖解除边界。
