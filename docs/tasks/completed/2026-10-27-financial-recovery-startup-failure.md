# Gate8F修后演练：恢复后启动失败，诊断未闭环

2026-10-27；test source 774264574191801147e2151b2b77ef5dc4d30f93，image source仍为22fe4e84f08441f6a0c849540871e56b44d8aa9f；image ID sha256:ad6cf01f17e34f0dc6cf2523f6526bbf440f67abaafa100e76e84f41121ea31e。修后3089blob/0overlay精确归档，生产TS/SQL/ops/依赖当时未变，未重建镜像。[首次TDZ失败](2026-10-27-financial-recovery-first-attempt.md)继续保留。

唯一修后全流程451177ms，9项7PASS/2FAIL（含父项），0取消/跳过。非空领域及财务输入、重启/冷重建、离线DB和对象备份通过；独立恢复子项在最后trial start处抛owned_command_failed。按源代码顺序，恢复后启动前public表/sequence比较、对象恢复及完整性检查已返回；但未完成启动后的领域/API读取，未输出最终DOMAIN诊断，不宣称整套恢复PASS。

source项目zhixu-quote-trial-it-f3920b6a71五容器、recovery项目zhixu-quote-trial-recovery-f3920b6a71三容器均已停止；卷、备份、私密输入全部保留。恢复项目尚无app/gateway。独立核对此前55容器/183卷/29网络的所选身份/状态元数据及276旧ref，changes=[]，不是业务内容或完整状态审计。

一次单独有界原工具start于2026-10-26T21:22:54Z执行，6289ms、code1，无timeout/overflow/spawnError；只收到trial_operation_failed_review_config_or_safe_service_logs，未出现COMMAND_SUBMITTED/READY。该尝试已用完，不把它改写为尚待执行或自动重试。配置hash、镜像身份、check均已单独核对；客户端终止不等于Docker事务回滚。

只读网络清单为32项，其中30个bridge子网覆盖172.17–31/16及192.168.0–240/20，恢复项目仅default、缺ingress。Docker info DefaultAddressPools返回null；有界backend/init日志没有匹配错误。默认池耗尽是有根据的推断，尚不是已证实根因，不能据此修改全局Docker配置或清理旧网络。

已确认的诊断缺口：trial safeFailure和harness通用错误丢失底层分类。后续仅补安全固定分类及负向回归，精确checkpoint/审查后才单独记账一次同目标诊断start；不重跑备份、初始化或全流程，不直接调整IPAM。纯代码回归的PASS不能代替现场原因或恢复PASS。

## 原件SHA256

本机outputs/financial-recovery-corrected-20261027：

- runtime-result.json：54ec42dab80de56e2e1dbd53b9cf1a7828adef5331db35edbc16a0615b6e0c17
- runtime.log：0b389208db74af4413665f53da71cbb4284921ba32d3a5cd1ab490ca40ed0680
- preservation.json：3db3b4aa27d2dcea78c1a1063babf37fcc1ed1bc952bc49f9d277ee7c42cfcb6
- resume-start-result.json：d1fe43eabaec71b04c4ff64c750a62d352bf0c39c23268618e3a1a9d5938eed2
- network-readonly.json：e60f931b990069f0953ecdfc25819eab10784865969dacf39d0b19d6fbe82cfc
- daemon-readonly.json：c0046513d2b8e11257127a29adc7ccc209269de6d0bb299a88880589fc9950c0

main869ee84dd0b31de6161011e4aa560678b244a64d沿用同日核实；Git/ref STOP根因另行UNRESOLVED，网络容量线索不解除Git停止条件。0新Hosted/远端写/真实Source/旧账号或业务库/merge/正式部署/切换/退役。UI具体批准pending，68能力不提升，完整Goal active。
