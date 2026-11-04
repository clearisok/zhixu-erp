# 接力：宁波准备完成部分，真实详情来源失败待定位

续作D1：用户要求定位并复测；新增封闭错误分类、仅私密操作者开启的白名单逐请求诊断，正常协议/15秒请求超时/180秒预算/零重试不变。169项Python通过；尚未使用该诊断发真实请求。下一步固定原失败5合同、1登录80报表180秒诊断，随后冻结新的高频/全量隔离测试范围。见[续作](tasks/active/ainuoke-request-diagnostics-capacity-2026-11-04.md)。

D2已推进：a94aa254诊断镜像6f2c8d0b，Linux169/Node协议13通过。原5单一次真实诊断成功：1登录36报表37HTTP，无错误、最慢物料971ms，旧故障不可追溯为具体类别；不冒称解决。新的247高频恢复库正在跑，exec session87721，远端/home/jackson/weaveops-catalog-diagnostics-20261104/campaign-frequent/result.json与trace-*.json实时更新，本机outputs/ainuoke-diagnostics-capacity-20261104/frequent.log。不要重复启动。结束后核对故障/未知；只有无来源故障才启动已准备的全量新库campaign.py full，不复用旧603队列。容量操作者每批5、单次30分钟、固定剩余预算和无重试；此前make.py capacity不可复用。所有原始source仅远端私密目录，不打印collector.json或任何完整环境。最新结果以前向本段为准。

D3后继：高频已247/247全过，618801ms，51登录1857报表1908HTTP，零失败/重试；summary已冻结artifacts/ainuoke-diagnostics-capacity-20261104/frequent.json。全量正在运行exec session77373，远端campaign-full/result.json，本机full.log；不得重复启动或同时跑其他来源测试。远端同目录summarize.py full只在finishedAt存在时执行一次，随后取summary白名单而非raw capture。计时scope608，目标30分钟/单批5。高频新两证据表实占95.4MB/轮，按每日48轮估4.58GB/日；是代码重复完整目录导致的已验证风险和线性推算，不是一天实测。先完成全量，不自动扩大到去重改造。guard在17bd6797通过；最终文档提交后仅补精确守卫，不重跑169/13或已通过182回归。

D4最新：全量第一轮已结束（session77373完成），100成功/5失败/503未测，明确复现6086103第二次目录校验第13页timeout 15022ms，详情请求均成功。803报表22登录，回执已冻结full-first-failed.json。不是5个数据缺陷；旧原始失败页不可追溯。仅catalog模式请求等待改45秒、总180剩余截断/零重试/旧模式15秒不变，170Python通过。下一步构建精确45秒操作者，Linux170后仅跑一次新full45恢复库；最大123登录9800报表，与已用74/2696合计197/12496；若再失败停止，不无限加时或重跑。高频247仍为15秒配置实际10分18.801秒，full45覆盖其中247，不必另重复高频。原full/frequent的终态库和证据保留，不能重复旧脚本。

2026-11-04；分支feat/ainuoke-full-catalog-followup，产品候选bae837a152cb223039afc94fa06c571b3ee8328e。main基线沿用此前已核实cb5cc29baa49ed7115fdb6c9506b6a80356936ea，本轮未刷新远端。本轮仅备份、独立恢复/前向升级、候选镜像构建/私网启动和有界容量实测；没有正式切换、main合并或真实账号修改。先读[本轮报告](tasks/active/ningbo-catalog-capacity-2026-11-04.md)；[此前接力](tasks/completed/2026-11-04-before-ningbo-capacity/AI_HANDOFF.md)保留本地工程与失败/修复证据。GitHub单次交付失败后未重推，无PR/新CI，不复跑成功的工程测试。

正式宁波f21c96c1、镜像0bc513c4、51迁移、3SO/2报价/2附件。旧worker从11月2日12:14北京时间暂停，已只读查明discovery_changed；最后成功12:08:09/run0d04e2fe，累计190成功。旧cron仍在、状态保持PAUSED，不擅改状态重启。

备份20261104T075135Z-7898850c宁波及D:/WeaveOps-Backups/ningbo-trial异机验证通过，121表/2对象；恢复到独立weaveops-catalog-capacity-20261104项目，121表逐一匹配，0053/0054仅副本应用。测试容器已停止，卷、镜像、回执保留。正式库、旧3000/3002及原资产不变。

候选精确3422 Git blob。Windows git archive换行改变48旧迁移被拒，已用cat-file原字节修正；没有改旧迁移或账本。操作者镜像a4e975add946，应用最终镜像sha256:6081a3de95a2ad1ef0578605ec334db1877a7421a09ecb6d028c1cebf9b978bf。health/build-info 200来自d01ca882；最终仅改created标签，RootFS列表完全一致、七项发布身份一致。附件IO禁用，不冒称完整附件运行验收；未部署正式栈。

目录608：247高频/120每日/191每周/50每月。首个目录包装回调错误已纠正且保留失败，第二轮完整目录4.348秒；第一组5单29报表/22.677秒后source_unavailable，成功0/失败5/排队603。来源错误后停止，不能报告30分钟吞吐通过或超时不足。两轮总3登录/81报表/84HTTP/0网络重试。副本同步控制已关闭，603测试任务不可迁入正式库。不重复执行manage.py capacity，也不能用同一失败回执当新额度；下一真实诊断须固定范围和剩余额度。

本机ignored outputs/ningbo-catalog-preparation-20261104/final-review.json、app-image-final-result.json及ops脚本；宁波同名/home/jackson目录仅本人可读。原始来源只在私密review目录，不输出。计时包装v2通过只读bind使用，正式产品源码仍为bae837a1。下一步补安全报表ID/页码/耗时/错误类别诊断，明确失败环节，再分别测全量首轮与247高频稳态；保持串行及每批预算，禁止靠并发/重试掩盖问题。正式服务替换与备份安静窗口协调尚未安装或验收。

曾误输出来源配置敏感字段，已向用户说明，后续输出均白名单；不在Git/报告保存其值，建议轮换密码，未自行修改。所有后续命令不得直接cat/打印collector.json、完整Docker环境或秘密配置。
