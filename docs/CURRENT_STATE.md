# 当前状态：Issue174 v2第三阶段Staging切库完成

2026-11-26；branch **feat/issue174-storage-v2**；本Gate baseline **1cccaeb31f7c79b96125030c9f5326426563a75f clean**。线上应用 **fd84815dee273c0c65b4565961c8d4ffe3bfb764** /staging-i174-fd84815d，main **10b9a7d827e1c09f152ead58c21f26712d49a619**。PR176仍Draft/未合并，PR172/173修复保全。[实际执行](tasks/active/issue174-staging-phase3-execution-20261126.md)、[最终证据](tasks/active/evidence/issue174-phase3-20261126/second-cutover-accepted.json)、[Issue回执](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7186102906)。

新活动库 **408,345,623bytes/408.35MB/147表**，旧冻结源12,335,701,015bytes，减少96.6897%。最新一致配对→原样145表/5seq→选择转换145旧列与必要来源水合→原冻结恢复→实际147表/owner ACL/普通角色/全部引用→13附件→真实API/UI→新source完整备份及最后重启后业务/三条业务编号seq复核全部PASS。636订单、8报价8修订、13附件及13绑定、3账号/角色权限、223220操作日志等全部正式业务完整，仅正常启动登录状态变化；12技术表获批无引用旧行未迁入新库，原库及备份未删。history epoch15:37:44.970，非入口T/真实同步。

北京时间 **14:40:56–15:57:01** 完成，维护1h16m04.734s，公网/LAN新版本及DBready已独立确认，余2h13m55。普通运行角色不拥有表、不superuser、不继承maintenance，不绕过不可变保护。系统盘最低29.02GB/低水15GB；本次额外约22.61GB，含保留前次任务的采样净峰44.94GB/预算60GB。305次15秒采样最大间隔15.523秒，上次中断已确认桌面usage limit，本次独立作业和时钟持续运行。

**Worker仍停止、分钟入口hold、cleanup=false**；每日新source备份同原频率/受审暂停门禁，原fault和pause保留。旧DB/卷/所有原始配对保留，新原始配对90天最早2027-02-24 15:57:01北京时间，不自动退役；同机第二物理磁盘副本不冒称offhost。已开放新写，回退须先保全新库/对象/新增业务并用最新v2配对或前向修复，禁止盲回旧库。临时预览和owned转发关闭，任务隔离PG停止保留，Production及其他Staging整改未操作。

匿名401/管理员正常TLS与SecureHttpOnly/11API200、订单与关账完整加载及8页实际UI、13认证附件SHA均PASS。一个原有68字节PNG缩略图503（旧线上相同），原文完整；其他角色未实际登录，不替代用户人工业务验收。Project仅Status→Staging、Issue保持OPEN，PR不合并。自然两轮/24h增长未测，不能因Worker暂停编造观察。182发布回归与fd三CI已PASS，本轮无产品代码改动；最终源码/证据守卫PASS（13页/68能力/40UI路径/errors[]），最终commit交付收口中；不冒称文档新HEAD三CI。[旧恢复摘要](tasks/completed/2026-11-26-issue174-second-window-checkpoints/README.md)。
