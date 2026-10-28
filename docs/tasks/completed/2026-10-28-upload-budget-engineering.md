# 单次Git上传预算：独立本地工程证明

2026-10-28；fix/git-delivery-upload-budget；工作树git-delivery-preflight。本轮GitHub连接器重新核实main6479a713e2b80228f008049519ebbd50d10601a8，完整对象本地可验证。从该base创建独立任务分支；复用前工作树clean、无运行进程依赖，旧cb1658及其ref保持。初始baseline在outputs/upload-budget-20261028/baseline.json；旧三份状态逐字/hash保留在[输入归档](2026-10-28-upload-budget-main-input/receipt.json)。

## 问题与变更

主整合分支此前a027的一次真实push在31008ms由既有runCommand默认30秒预算终止，未证明远端送达；精确一次许可已用完。本片不再次上传、不读取认证，不通过文件API重建原commit；也不把延长预算当作永久网络修复。

仅将唯一push调用传入显式180000ms常量，并让原git helper向run依赖传递该预算。原默认30000ms保持用于所有证据读取/预检；原单次push、fresh本地状态、祖先校验、独立远端核实、错误分类/STOP、脱敏、原件与恢复输出保持。不新增CLI/environment放宽入口，不改变全局/common-dir代理/SSH/TLS或认证方式。

## 实际检查

- 新预算用例先运行红测：旧代码向唯一push未传预算（undefined），因而不满足180000ms合同。超时注入的预算断言被既有总捕获安全转成STOP，原红测记录保留，不称业务功能失败。
- 修后`git-delivery-state.test.mjs`与`git-delivery.test.mjs`完整 **79/79 PASS**，153246.3653ms；0失败/取消/跳过。包括真实临时bare Git仓库和PowerShell入口、超时/已记录或无ref、仅push延长、真实一次上传/精确回查、认证/证书/拒绝/分歧和dirty保护。
- Node两文件语法与定向ESLint `--max-warnings 0`通过。仅工具MJS和测试变化，没有应用/SQL/UI/依赖变化，不重复关账产品构建、811项目或18实机测试。
- 独立只读reviewer核对实际增量与负控，无P1/P2；其未运行测试，不代表增加真实交付次数授权。
- 在精确checkpoint `a859b44cff57b7a5e7b4f42e6f6348d8d44ce266` 上，完整发布回归 **144/144 PASS**，727061.2761ms，0失败/取消/跳过；精确main守卫 **PASS**（基线6479、11页/66能力/0个UI路径、errors为空）。只绑定本工具分支实际日志，不借用主整合分支不同guard源码的182项结果；随后仅补本结果文档。

新raw仅在本工作树outputs/upload-budget-20261028：baseline.json、budget-red.log、budget-green-full.log、budget-lint.log、budget-main-guard.log、budget-release-tests.log。没有GitHub token/Authorization/Cookie/代理密码、真实业务或raw网络trace进入Git。

## 清单与边界

发布清单仅将baseline和verifiedAt对齐本轮真实main；504个旧evidence对象、页面/能力/status、截图与全部其他内容逐对象保持。只更新本独立分支任务状态，并保留原工程日期、hash、失败和限制；不将本分支旧业务界面误认为主整合关账候选。

主关账产品仍在7bf3/feat/closing-support-interfaces/d243a65df9000fc6dc2a85fe8e8252c1031fe109，实际演示a198、52251。本片没有其合并、重新上传/PR/Hosted CI、Docker运行变更、既有用户输入/账号或业务库、Source、正式部署/切换和资产退役。普通网络恢复常设授权保留，但a027明确一次push的额度已经消耗，不能复用。

整体Server收敛Goal继续；本地工具通过不等于远端已送达、推送一定在三分钟内完成或原Git退出1全部根因已解决。
