# AI handoff
核实日期2026-10-12；main db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e（PR99已合并）。
独立分支feat/ainuoke-continuous-material-display，初始clean无继承dirty；[PR100](https://github.com/clearisok/zhixu-erp/pull/100)已创建，未合并。工程head e495173bffab010103110f738bb0d991ed2b5d57远端精确核实，Source/team-access/baseline三项CI SUCCESS；后续仅文档收口，最终head CI以PR为准。
本地root809/809、PG261/261、发布门禁70/70及真实base check、type/lint/双build通过；Linux Source21/21、continuous30/30、P6浏览器8/8、Python54/54。证据：[任务及复审](tasks/active/ainuoke-continuous-material-display.md)、[冻结截图](tasks/active/evidence/ainuoke-continuous-material-display/engineering.md)、[功能](features/AINUOKE_SERVER_SOURCE.md)。
复审无未修复P0/P1，建议合并工程代码；不自动合并。Docker builder成功，runtime依赖安装超过15分钟未完，已只取消本次构建；完整镜像未验证，是上线前Gate。
默认orderRead/Source关闭；仅已绑定订单四流持续更新，新增合同自动建单/主镜像和颜色增量未实现。真实凭据、安全通道/范围、连续运行、人工验收和宁波部署均未做。
本机合成demo脚本已跑，demo.*六角色/临时PG自动两小时结束；不含真实数据。PR98有冲突及过时Quote-first顺序，先对齐main/D105再考虑合并，未授权合并98。
用户本轮禁止真实账号/数据库/部署，新PR不自动合并；后续先取得具体真实激活授权，凭据私下配置。旧恢复点见[归档](tasks/completed/2026-10-12-continuous-source-predecessor-state.md)。更新时机：main/PR/CI/来源/环境/验收改变。
