# 0052 持久恢复输入与保护证据工程

2026-10-28；`feat/closing-support-interfaces`，阶段开始 HEAD `d243a65df9000fc6dc2a85fe8e8252c1031fe109`、工作树干净。当前 main 经 GitHub 本轮再次核实为 `6479a713e2b80228f008049519ebbd50d10601a8`。产品仍为已验收的 `a198d1829675092006708727624ee867be0e7b60`；本片只扩展 owned 恢复测试，不改应用、数据库迁移、权限、UI、依赖、原运维恢复工具或业务规则。旧摘要逐字/hash保留于[输入档案](2026-10-28-executor-recovery-input-state/receipt.json)。

## 实际镜像尝试：失败，未生成新运行候选

从 a198 的 Git archive 提取3258个 canonical blob，逐一核对Git SHA1，无overlay。新目录为 `D:/zhixu-server-convergence/candidates/closing-support-image-a198-757bf06705`，唯一镜像tag `zhixu-closing-support:a198d182-20261028-757bf06705`；固定本机desktop-linux/npipe及已缓存Node镜像ID `sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`。

独立执行前复审指出唯一buildId/time会使ENV之后的APK层不能保证复用，故在执行前移除离线缓存假设，使用原Dockerfile允许的默认隔离构建网络、原USTC选项；未用host network或改共享配置。唯一一次构建实际在USTC APK索引下载处出现TLS错误，python3安装失败，退出1；并非应用编译失败或成功镜像。没有重试、切换镜像源、关闭TLS或安装宿主依赖。

失败后独立只读集合核对：旧容器ID/image/name/state、旧卷名及旧网络ID/name/driver全部保留，missing/changed均空。当前52251合成演示与旧62428持久空候选保持；未建新持久目标，没有升级任何旧库。私密 `support-linux-image.json/.log` 和新目录的 `assets-before.json/assets-after-failure.json` 保留原失败。不能把旧cf77/0051恢复通过借作a198/0052镜像验收。

## 恢复测试增量

- 新显式测试选项 `ZHIXU_LOCAL_TRIAL_EXECUTOR_RELEASE_RECOVERY=true` 必须依赖financial/domain recovery；默认关闭，原0051及原非空测试路径保持。没有运行时产品开关。
- 在原owned非空财务夹具的开放三月，真实HTTP先匹配2.125件到尚无产出的外发排单，再通过正式资源/排单命令合法更换执行方，最后由同一月份preview/command/原回执执行 `release_executors`。没有直写月份表或造成功回执。
- 恢复只清执行归属，保留精确片段ID/颜色/量/月和Source指纹。生产、当前完整商业依据及此前锁定期间逐对象保持；原production/resource与month回执全部加入同一现有快照。已有全库行hash和sequence核对继续覆盖新增非空版本/审计。
- 备份时和恢复后应用启动前，新增检查真实0052约束触发器：public原表、启用O、AFTER INSERT/row(type5)、deferrable且initially deferred、无条件/参数、普通plpgsql trigger函数、无SECURITY DEFINER/search_path覆盖。函数body与0052源码逐字规范化匹配；定义/body SHA256纳入原快照比较。仅存在迁移ledger或非空表不能冒充保护恢复。
- 现有0051冻结保护保留。原保护查询默认返回格式不改；仅显式新选项增加0052目录证据。提交、退款、真实财务或Source均不在此测试内。

## 已实际执行的检查

- 初版新owned PostgreSQL/真实HTTP/原回执和目录负控 **8/8 PASS**，8141.4605ms，原日志保留。复审指出该独立用例冻结集合为空、应直接比较当前商业依据；已补真实HTTP建立同SO一月1.25件片段并同步/确认/锁定，加入periodIds后才执行恢复，并逐对象比较 `/basis`。仅重跑该文件，最终 **8/8 PASS**，8274.342ms，0失败/取消/跳过。负控包含停用/删除触发器、SECURITY DEFINER、函数配置、替换body和去除deferred属性；每次事务回滚后精确原保护保持。
- 原financial fixture和local-trial安全检查 **11 PASS / 1 SKIP**，287.1117ms。跳过项正是未提供新镜像的完整持久重启/备份/独立恢复；不能写成12通过或完整持久恢复通过。
- 原domain回执负控 **4/4 PASS**，111.1937ms；5个MJS语法及定向ESLint零warning通过。
- 既有独立只读reviewer复核最终夹具、冻结对照、当前商业依据相等及日志，无P1/P2；reviewer未重跑测试或Docker。完整原始日志保存在outputs/approved-support-flow-20261028，最终新增用例为executor-recovery-frozen-integration.log。
- 尚未运行新镜像的完整非空持久恢复、新空候选、其重启或持久目标人工体验；Docker TLS失败后没有循环重试。不重复a198已通过的18实机、811项目、182发布或未受影响SQL套件。

## 并行工具收口与交付边界

既有git-delivery-preflight工作树的独立 `fix/git-delivery-upload-budget`：源码checkpoint `a859b44cff57b7a5e7b4f42e6f6348d8d44ce266`，结果文档收口 `c91d904d8751275dd6a7830893ce237efa021905`，工作树干净。唯一push预算180秒、证据读仍30秒，隔离Git/state79及发布144通过、精确6479守卫PASS、独立复审无P1/P2；没有真实网络上传/新CI。此工具与当前业务分支分开，不伪造共同提交或送达。

此前a027明确一次实际push已消耗并超时，d243及本片没有新上传、PR或Hosted CI；原安全STOP与精确远端送达独立处理。完整Goal继续active。正式合并/部署/50426切换、新真实Source范围、账号/既有业务库和旧资产退役均未执行。
