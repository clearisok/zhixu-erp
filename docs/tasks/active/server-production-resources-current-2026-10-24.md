# G6A 当前生产资源 Server 前向整合

2026-10-24；执行已批准 D147/G6A，root唯一writer，既有server_convergence_review只读。
从独立API已核 main `e01a11952b648024c0bd6bf4259de429374981e2` 新建
`codex/server-production-resources-current`，显式FF到已收口 G5
`530203b32aa9b237c4b81be285e91be40d4e990e`。开始 clean，无继承用户dirty。
G5两状态逐字、逐SHA256保留于completed/2026-10-24-production-resources-input-state/。
起点与范围审计在ignored outputs/server-production-resources-current-20261024/。

## 受控复用与修正

原 aaf→d717 的25个非docs/workflow路径逐Git blob与当前输入完全相同（含新增文件均不存在），
核完全部路径才复制原 `d7172477b75569165d3a2c1b04ddc58ea24008b4`。
保留当前 main/#120、G3导航、G5和现行Quote验收修复；不复制旧workflow/manifest/摘要，
不整包导入后续排单、完成、物流或成衣出货。

独立静态复核确认原后续23278ffc的CAS重新读取disabled谓词应保留；只提这一行，
并新增真实GET回复屏障，验证目录权限待核期间按钮disabled，放行后一次点击读最新。
caf062d0的撤权Enter用例只前移真实Drawer初始rAF焦点/原生Enter/一POST403/原编号恢复及
安全焦点诊断，不带G6D业务。原240s父级/16s轮询/20s CDP/30s端点预算不变。
清理复用当前stopOwnedChromium：root Browser.close不带sessionId，证据失败仍释放HTTP/PG，
未确认owned退出保留profile，不使用kill后固定等待删除冒称成功。

## 容量缺陷：先复现后修复

审查发现合法HTTP/outbox命令可能小于1MiB、而回执PostgreSQL jsonb::text超过0034的同一上限。
本机真实合成PG/HTTP复现：命令1,048,218字节、真实outbox1,048,352字节、结果1,054,445字节，
原服务返回500；GET为unknown，前端原请求无法编辑，重试仍同样失败。
原两文件红验收24pass/4fail（含父项、后续审计错误计数连带失败），0取消/跳过，完整日志保留。

窄修复在原resource_apply SAVEPOINT内、apply之后检查真实结果jsonb::text字节，覆盖changed及no-op。
超出原1MiB时回滚资源/例外/审计，存小型持久化422拒绝回执；原prior直接重放，其他SQL/审计异常
仍整体回滚。客户端仅接受完整request/kind/hash匹配且422对应静态容量code，裸422/错hash不释放原缓存。
不放大HTTP/SQL/outbox限额、不截断、不禁止原合法字符、不重写0034。

工作态两文件28/28 PASS（8680ms）：实际HTTP422、零资源/例外/审计新增、恰一回执、
原请求POST replay及GET known、原缓存确认后释放、已有大日历no-op明确拒绝、实际可容纳的
1000项例外仍完整保存、原正常no-op/replay与审计失败保护。只是工作态结果，未当作冻结全套验收。

## 行为与边界

四资源为日历→地点→生产组和独立外发厂，稳定身份、版本、启停及同名合法；空库不Seed。
复用现有表格/同页卡片/抽屉和结构化日期字段，正式Server从不挂载Browser聚合normalizer。
既有权限、角色锁序、session owner、原命令恢复、已知拒绝/未知结果区分保持；不改真实账号授权。
0034仅新增空表，接当前0033，不回填、不重写旧迁移、不升级目标；启动仍verify-only。
Server路由只加这三个已有业务页面，不把资源CRUD称为排单/生产闭环。

## 当前验收计划与成本

先完成独立静态复核并冻结源码，再新canonical archive复用依赖/noinstall。
执行四资源契约/客户端/outbox/真实PG/HTTP、角色/用户/空库及G5引用回归；类型/Node实际载入/lint、
双authority构建/原独立产物检查器、当前资源及导航真实浏览器、根非发布与最终发布检查。
新before/after仅作工程对照，不借旧d717/7b结果当当前；新能力在实际验收/冻结证明后才登记。
代码未再变化时复用成功结果，不重复全仓扫描、远端CI或Docker网络尝试。

当前尚无本阶段冻结构建/浏览器/全量/发布PASS，不提前改变258/48能力状态。
原G5的68a/53c9/61e/530结果分别保留，完整Goal active。
#125仍CA草稿，旧STOP与精确4f API例外不由本阶段撤销；Actions=0，不新建累计重复PR。
不自动merge/close/deploy，不读真实凭据/Source，不改现有账号/业务库/卷、旧Browser账本、
3001/50426/59069/62426等环境、备份或已有验收结果，不绑定/激活/调度或退役。

严格before模式只允许显式RESOURCE_UI_BEFORE及完整旧68a SHA，观察三个旧Server资源路由封闭、零资源API/写入和无Browser账本，1440/390仅截图；后台/测试为当前源。after禁止外部静态目录。两种路径都执行owned finally，不借旧构建冒称after。
