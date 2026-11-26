# 接力：Issue174原样恢复完整核验PASS，隔离选择转换进行中

2026-11-26；branch feat/issue174-storage-v2，Gate baseline **8b326c871cd1396998579db5525b57dfb52ae52a clean**。应用候选仍 **fd84815dee273c0c65b4565961c8d4ffe3bfb764**，main **10b9a7d827e1c09f152ead58c21f26712d49a619** 再核实；PR172/a0a9、PR173/da1c精确未变且未合并。仅运维文档，未修改产品代码/SQL。见[执行日志](tasks/active/issue174-staging-phase3-execution-20261126.md)、[用户专项sudo与续做决定](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7180928896)、[配对备份Gate回执](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7181669651)。

**维护已生效，不能结束任务而无人管理停机。** 北京时间10:37:07开始、14:07:07绝对截止，13:37前保留30分钟取消余量，不重置窗口。公网cloudflared inactive；LAN192.168.66.69仅503；两owned cron块hold；Worker停止、清理false。新私密验收仅127.0.0.1:443经SSH，本地Chrome正常TLS，nginx除auth/login POST外拒绝所有写请求。LAN原件/当前held配置不同且均保全，以maintenance/lan-held.conf为当前精确比较基线；最终恢复lan-before.conf移除临时预览。SSH03:13Z附近短暂timeout、03:17Z新连接恢复，根因未确认，没有改网络/认证/安全配置。

最新配对 **20261126T023837Z-14573686**，manifest **85bc4166743272cbbbcdca71379ef2c9ebeeab9e782aec1113bb4a95fae9dd25**，145表/13对象/58文件/3,843,034,120bytes，02:38:37至03:02:43Z完整PASS。前后全量摘要、归档TOC+完整decode、全部hash、执行器cleanup/服务恢复均通过，历史failure未改；立即原trial maintenance-db重新冻结旧四服务，仅旧PG运行。原始配对/data第二物理磁盘副本58文件全hash通过，仍同机不是offhost。保留90天从未来正式迁移验收成功起，不是此次复制时间。

原样隔离恢复含副本工作1191.213秒，恢复DB12,208,897,047bytes。第一次全核验仅两个独立序列owner不同：quote_center_quote_number_seq、sales_order_number_seq为postgres，而备份为quote_trial；全部表行摘要及其余序列字段已相同。只把隔离副本两个owner恢复至安全NOLOGIN/非superuser quote_trial，未改值/旧库/校验工具，保留首次失败与独立修复intent。随后原verifier重新完整执行498.972秒，**ORIGINAL_RESTORE_VERIFIED**：145表/5序列精确、13对象引用配对。当前已启动 `isolated.py select-convert`，已有intent，**禁止盲目重跑**；尚未宣称选转或最终目标PASS。

私密根服务器 **/data/issue174-phase3-20261126**；当前状态evidence/window-status.json、select-convert-driver.log、isolated-select-convert-result.json/failure与evidence/migration。检查结果后执行isolated.py compact（每phase有不可重放intent）。固定CLI原白名单不改：issue174-v2-pg-20261124、issue174_original→issue174_selected_phase3_20261126，全部绑定本次fresh manifest与原样证明，副本以外不筛选/删数据。isolated PG container69e63582…/internal/no ports/2CPU4GiB。实际工作盘消耗约17.1GB、系统盘34.61GB，60GB预算、root15GB低水位；resource-samples.jsonl保留离散采样，不冒充连续峰值。

新正式空PG project zhixu-quote-trial-i174-v2，container8b8bb05a…，标准独立data卷，Docker目标指纹 **a326d8d6f36e69cafa57318f88c73b947ae8404b6fe4d42174be623991d9f79c**，仅维护owner postgres；quote_trial角色尚不存在。app **sha256:776effff8f66c652f4ed7694440535f060dbb58d0bb8ea3c63ad0241d95e50de**，operator **sha256:6e0f4b2c033e769cd95ab1b3ade99f544477eda5c81df9821f5337702ed2db9c**，build staging-i174-fd84815d。

compact之后：将紧凑dump下载到本机D:/CodexPrivate/issue174-20261124-v2/phase3-restore-ops/backups，fullSHA核实，原冻结 **Invoke-Phase3Restore.ps1 -DumpSha256** 使用process DOCKER_HOST=ssh://weaveops（不能误用desktopDocker）。原Restore-Zhixu --no-owner/--no-privileges，之后必须私密 **final-integrity.py**：修复四maintenance函数owner/归档ACL、原runtime-role.sql建普通非owner quote_trial、受管LOGIN、相同role/database作用域planner off、全部147表/5序列与已验证selected逐行SHA等价、columns/index/FK/trigger/functions/owner、负权限拒绝；原CLI --check只读重算新物理目标source指纹并绑定新identity，不能沿旧f3fe地址指纹，不能放宽CLI白名单去指实际quote_trial。

随后私密 **objects-and-start.py** 只调用原trial objects-init/objects-restore/start，恢复本次13对象到独立卷、完整hash/原bucket/key/引用，正常verify-only app启动，公网仍hold。browser-fixtures.py取既有只读引用，本机phase3-real-browser.mjs使用正常TLS与Secure session验API/附件/7页面/历史起点缺口提示，原始截图/账号只存私密目录。post-startup-integrity.py再次核对业务/员工身份/角色权限分配；仅允许既有bootstrap/login的明确技术字段变化。不要把登录会话/last_login_at自然变化误报业务损坏或跳过全业务验证。

私密 finalize-policy.py在上述完成后生成新source147表policy，原145 policy不改，全部输入置于任务根。prepare-cron.py已准备原频率的每日备份03:30北京时间（实际cron30 19 UTC，不改为文档其他时点），分钟Worker继续hold，尚未安装。new-source-backup.py在公网仍hold下通过原Supervisor与reviewed-paused-Worker路径取得新完整配对备份和正向退出证明。完成所有门禁才执行open-writers.py：**在入口可能开放之前先写newWritesOpened保守意图**，之后禁止退冻结旧库；保全新业务再v2完整配对恢复/前向修复。cancel-before-writes.py仅在尚无新写意图时可取消回旧app/原库/原对象，不删任何新副本，Worker继续hold。所有脚本已有phase intent，失败保留原记录，先对账不重跑。

182发布回归已182pass/0fail/0skip（1474813ms），不重复；fd应用三CI成功。8b运维检查点已DELIVERED_VERIFIED；其发布源码守卫正在运行，phase3-backup-checkpoint-release-guard.log；786旧Source cancelled不能冒称成功。各Gate独立commit/安全push并回链Issue。Worker恢复、清理启用、旧库/卷/备份退役、PR合并及Production仍禁止。新source备份/实际入口切换尚未完成，自然两轮同步/24h观察仍未执行，迁移epoch/入口T/首次真实同步分别记录。
