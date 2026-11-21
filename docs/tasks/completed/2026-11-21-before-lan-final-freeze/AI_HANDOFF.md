# 当前：Staging LAN 长期稳定化实施中

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**。用户认可第一阶段架构并明确授权低风险持久化，继续feat/staging-lan-direct / PR164，不合并。Phase8起点5ad87d91181ed37cec762e4e8aba3539aa486610/clean。窗口原生持久路由已实际双store验证，服务器networkd单/32脚本已上传/Dry Run，待用户sudo执行；两端重启尚未验证。新证书重载/监测代码已测试，尚待真实部署。原11容器（含LAN）before身份已保存，不重建原app。

服务器66.69及客户端83.51均DHCP，尚无地址保留证据；实际服务器DHCP MAC12:ff:e0:00:88:4f。Docker历史演练桥80.0/20覆盖办公室83段，不迁移/删除旧网络。Worker真实PG心跳及15:42新成功已核，非仅container running；不改配置/采集。详细根因、用户授权、测试、精确路径及剩余条件见[第二阶段任务](tasks/active/staging-lan-stability-2026-11-21.md)。

Git本地仍5ad87起步，远端92e83343082c1251000944b6e791e8a4a3e68445，main10b9；进程限定7888正式Dry Run READY_DRY_RUN，未推送，不称送达或长期网络修复。完整Windows发布套件已重新运行，结果待完成；不借旧CI。公司DNS/路由器/allow及共享服务器重启均未改，告警接收端及设备入口已询问。前一阶段事实/样本/失败保留在[原摘要](tasks/completed/2026-11-21-before-lan-stability/AI_HANDOFF.md)和[原现场任务](tasks/active/staging-lan-direct-2026-11-21.md)。Token/私钥禁止输出；新合成草稿/附件保留，不改正常订单。先做具备权限的安全操作，再汇总具体高风险审批。

Phase8 **908417bef3e0e4e67d5da2263feca68235e1cc38**已正式DELIVERED_VERIFIED，Release baseline/First team access/Source CI全部成功。Phase9新LAN自动恢复、公网隔离、证书实际重载/监测/cron保全、旧图CRC根因和8MiB合成文件双向hash已实测；新增独立公网只读CI待跑。Windows双store持久化已核，服务器sudo及两端重启/重连仍待；客户端TUN/WiFi自动测试被审查blocked by policy，未绕过。维护与公司DNS/设备/回滚方案见[长期维护手册](ops/staging-lan-stability.md)，不能称整个公司部署或重启验收完成。
