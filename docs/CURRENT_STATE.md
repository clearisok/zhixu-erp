# 当前：Issue159候选完成，等待本地人工验收

2026-11-20；main基线636a5ad0d2d1acbe6b2705696e782dea12ee9f00，分支feat/ainuoke-source-deleted。Issue [159](https://github.com/clearisok/zhixu-erp/issues/159)，Draft PR [160](https://github.com/clearisok/zhixu-erp/pull/160)。本轮仅代码、测试、本地实机演示和独立PR；未合并、未部署、未写Staging/Production。

0060前向新增source_deleted/present、确认时间及不可变删除/恢复事件。只有历史完整出现证据加新的认证完整双遍目录、完整分页、同账号/报表/空范围、BillNo唯一关联及id额外核验才转换。旧invisible不回填、未知不自动重试；停止已删除合同自动任务，正常订单及Price隔离/原30分钟机制保持。原业务订单/生产/报价成本/物料/出运/快照均保留。红色订单删除复用原异常列尺寸，不改列宽；独立异常保持。

代码检查点368bfb38783e234684ea0506b58ff97cf37f3c63已精确送达，三项GitHub CI全部成功。完整npm test1026/1026在2fb03344（之后仅CI/文档）；独立release-baseline182/182，显式main基线guard通过；目录/Price106/106、生命周期/升级10/10（含非空成本12.5/生产累计10.125的业务表逐行hash保全）、旧alerts1/1、Source20通过/1 Linux-only跳过；typecheck/lint/前后端build及实际Chromium四桌面/两角色/刷新通过。跳过不算通过，Linux CI另有全套覆盖，版本及历史失败见[任务证据](tasks/active/ainuoke-source-deleted-2026-11-20.md)。

用户解决D盘满后自行清空初始化Docker；未尝试恢复旧本地业务库。已只读导出既有官方PostgreSQL镜像并导入本机，未改远端容器/卷/服务或本机Docker配置。新临时PG/显式DEV Server构建368bfb38的四桌面浏览器重新通过；本地演示使用合成SDK+真实PG+实际构建UI，真实艾诺科请求0、Staging写入0，启动命令npm run demo:source-deleted，运行2小时自动清理自有资源。

真实两单本轮仅只读取证：visible=false、draft、数量10000/8000、历史出现及同账号13/13目录；没有执行真实source_deleted转换。以后需单独部署授权、备份、0060/组件健康及新鲜完整目录沿正式状态机处理，不能SQL回填。同BillNo以不同源id重建仍按原身份冲突阻断，不自动重新绑定。
