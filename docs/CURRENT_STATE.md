# 当前状态
核实日期：2026-10-12；GitHub main / 本任务基线：db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e（PR99已合并）。GitHub是实时事实源；旧状态见[前序归档](tasks/completed/2026-10-12-continuous-source-predecessor-state.md)。

- PR97六角色与PR99默认关闭Server Source已合并；真实账号、Source、部署和人工业务验收仍未完成。
- 当前[PR100](https://github.com/clearisok/zhixu-erp/pull/100) / feat/ainuoke-continuous-material-display：首次订单绑定、显式串行调度、原P6三页接线已实现，默认disabled；见[功能](features/AINUOKE_SERVER_SOURCE.md)、[任务](tasks/active/ainuoke-continuous-material-display.md)、D106。合成验收不等于真实上线。
- 复用UUID/编号/6087105/物料算法，首绑预览双确认、整批事务与审计。调度只刷新已绑定订单四流；新增合同及既有主镜像/颜色增量刷新尚未实现，不自动接管旧账本。
- 原P6布局/CSS保持；snapshot候选只接通订单列表、执行详情、逐订单物料；未支持入口disabled，Server缺UUID不回退Browser。30秒读取按用户/权限隔离，失败或陈旧不显示旧判定。
- 新发现并修复DATE读回偏移，DB日期未改；Shanghai/UTC/Los_Angeles回归已补。本地root809、PG261、发布门禁70及真实base校验、P6浏览器8项通过；工程head e495173bffab010103110f738bb0d991ed2b5d57三项CI通过（Linux Source21/continuous30/UI8/Python54）；后续文档head状态见PR。人工验收仍未完成。
- D105宁波上线条件保持：真实艾诺科四流持续按单展示后再上线。安全通道、范围/速率、私密凭据、连续运行、独立账本/存储、外网入口、备份恢复、人工验收仍待独立Gate；现在不用提供密码。
- PR98现场证据仍有价值，旧Quote-first时序/schema摘要过时；建议对齐main/D105后再合并，本轮未合并98。宁波/18443/18444未修改，旧环境观察日期不前移。
- 复审建议合并工程代码，无未修复P0/P1；完整Docker镜像因依赖安装超15分钟取消仍未验证，保留上线Gate。新PR不自动合并。分维度见[能力快照](release/baseline.json)。临时本机演示只含合成数据，不属于真实部署。

更新时机：main、PR、来源、权限、环境、测试和验收变化。
