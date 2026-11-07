# 接力：本机自动同步待启用验收

2026-11-07 12:24，北京时间。新分支feat/local-ainuoke-automatic-sync，起点9d40113aa4b12e2b3699bfe0e303a5d055d04903 clean。用户已明确批准本机617日常自动定时、目录30分钟发现并正式新增订单、隐藏后台服务；不部署staging。见tasks/active/local-ainuoke-automatic-2026-11-07.md和D188。继承发布基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea，未联网刷新。

原617首次接入已完成，原临时数据库容器zhixu-pg-it-d8777f722881保留不可停止。原63051 app及手动worker进程已不存在，不能再报在线。新持久库weaveops-local-postgres已恢复并核对137表、617head/订单和附件/账号/交期；新私密根D:/WeaveOps-Local（ACL仅用户/管理员/SYSTEM）。新库尚未调用真实源站。原私密根、配对备份和数据均保留，见归档状态。

新R=max(有效交期,合同日期+3月)代码、批量组/高频优先、目录自动建单、running只读任务有限重启恢复、持久owner runner、Windows隐藏任务脚本已实施；9日期/预算单元+2数据库新集成、24原韧性/停止回归通过，类型/受影响lint通过。当前617档位258高频/119每日/202每周/38每月，待核对0。尚未安装计划任务/启用真实定时，未实测优化后容量，不能宣称交付完成。

下一步：checkpoint后Server模式构建，将固定Git代码与dist/client打包到D:/WeaveOps-Local/releases/<SHA>，关联现有依赖；创建service.private.json（本机身份、启用配置、SHA、账号指纹、凭据文件路径，不输出秘密），启动install-local-ainuoke-task.ps1。它注册Windows登录/每分钟隐藏IgnoreNew任务，后台使用同一app及runAutomaticSync。配置enabled=true后自然到期才采集，不手动调用刷新伪造定时证据。确认目录完整、真实自动任务/认证/发布/HTTP/页面、30分钟高频积压与重启；更新状态/备份和最终交付。

Runtime密码/数据库URL位于私密文件，不输出不提交。静态构建SHA必须与service.codeVersion一致；原凭据D:/workspace/ainuoke-key.txt通过私密进程读取，不进入命令行/日志。原57404标签是旧模拟页面，真实本机仍使用63051，需在浏览器验收后给出明确链接。Windows需用户登录且Docker就绪后后台恢复，未声称开机未登录即可采集。认证/身份/证书暂停不能自动清除，旧成功事实保留。

[上阶段完成记录](tasks/completed/2026-11-07-before-local-automatic/CURRENT_STATE.md)。
