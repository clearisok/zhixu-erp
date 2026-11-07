# 接力：本机自动同步已运行，完成容量收口

2026-11-07 12:50，北京时间。分支feat/local-ainuoke-automatic-sync，起点9d40113aa4b12e2b3699bfe0e303a5d055d04903 clean；固定业务/静态运行SHA bb0cc79f1fa12cbb6f1586dc5036633a28a02c1d。继承main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea，未联网/CI/staging。当前dirty仅本阶段文档/基线和backup-local-ainuoke.ts，勿误认为旧业务dirty。

用户本轮授权本机617日常自动定时、目录30分钟发现并正式新增订单、独立后台；无需逐批询问。D188 R=max(有效交期,合同+3月)，258高频/119每日/202每周/38每月；D187自购和厂供分开不变。原tmpfs容器zhixu-pg-it-d8777f722881绝不可停/删，旧privateRoot仍是归档数据，不是运行配置。

当前root D:/WeaveOps-Local，service.private.json指向固定release，runtime.private.json含秘密勿输出。持久容器weaveops-local-postgres、volume weaveops-local-postgres-data。当前app PID15000、watchdog45816（WmiPrvSE父进程，不属Codex作业），HKCU Run/WeaveOpsLocalAinuoke经start-hidden.vbs隐藏登录启动。TaskScheduler被OS拒绝，不再重复；未做Windows重启验收。登录且Docker就绪后恢复。service-status.json含617orders，读取必须先选择字段，勿输出整份约90k tokens。

12:34:53启用，12:35:05自然排362任务，12:49:29完成196高频/0失败。当前2登录：初始1＋受控app重启1；持续owner跨组复用。原362任务全保留、重启前60成功不变。首自动PI2607-053 HTTP200、11自购、用户手工确认页面一致；浏览器工具被安全策略拒绝后没绕过。原57404为旧模拟，真实63051。D1992自然新增AIS2611-0401两笔入库182/100，需完成HTTP核对。

配对备份root/backups/pair-1794026722288异库恢复通过，617order/head、1804snapshot、217queued、5running、2附件；原库保留。脚本scripts/backup-local-ainuoke.ts仅导出一致性只读快照及新临时库恢复，0源请求。最新manifest为latest-backup.json。迁移52CRLF差异通过prepare-local-migrations按原ledger精确字节校验，不编辑ledger或执行迁移。

后续：用已存在的outputs/it-material-demo-20261106/automatic-capacity.ts做一次读库快照，勿重跑baseline/prepare/runtime-start或再次手动采集。观察258首池全部完成（预计12:54，须实际证据）及13:05后的第二自然周期同owner、目录30分钟。容量脚本存root/capacity-latest.private.json和samples。业务diff脚本已修正为reportId＋sourceRowIdentity匹配，结果root/automatic-business-diff.private.json；不要用修正前未定义identity的大段输出作事实。新增HTTP证明可沿原automatic-http-proof.ts读取正常业务接口，但不要覆盖首自动证明。保持只读账号POST403。

完成当前状态/任务/接力，先checkpoint文档与备份脚本，再以前向新记录更新baseline冻结SHA（3条local-automatic-*目前未提交，可以指向新checkpoint）。旧证据不可覆盖。11新增＋24原回归及type/lint/build已过；不重复未受影响的182测试。最终源码门禁基于已核实main SHA，记录本地commit；本轮不push/CI。认证/身份/证书暂停不能自动清除。后台持续运行，达到配置＋真实定时/HTTP/用户页面＋恢复/容量验收后可结束，不能让Codex对话成为长期worker。

详见[任务](tasks/active/local-ainuoke-automatic-2026-11-07.md)、[当前状态](CURRENT_STATE.md)。
