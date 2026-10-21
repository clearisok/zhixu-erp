# Git成功输出分类修复：源码验收与交付事实

2026-10-21，root整合记录，既有reviewer只读复审。范围见[原任务](../active/git-delivery-success-classification-2026-10-21.md)。

## 精确源码与测试

- main独立API仍为996dfedc12da3527343cd3ff2aa5eea35497e10e。任务分支codex/git-delivery-success-classification从main建立并显式FF干净d6；无继承dirty。
- 最终工具源码664fb5f8ae2248a83aff1ba5a623dc22ba2da664包含e6fbb892f68b1d14710e383deafb1605e6d94dfd及前向TLS告警修正。与d6相比，app/components/features/server/database和发布清单逐字不变。
- 原red64中53通过/11失败（134767.0109ms）、首修green65/65（138380.601ms）、追加告警red2中0通过/2失败（3604.5087ms）均保留，不覆盖失败历史。
- 最终Windows工具66/66、0失败/取消/跳过，142597.9358ms，含真实PowerShell入口；syntax/定向eslint通过。e6显式基线116/116，305613.6671ms；664f最终对精确main守卫PASS，11页面/51能力/63条累计UI路径、errors=[]。
- 不借这些工具结果冒称业务/SQL/UI重新验收，也不修改原243证据/51能力或d6应用工程事实。

## 一次交付与仍然停止的动作

原工具及已批准的进程级配置仅push一次。回执为STOP_AUTH_OR_DIVERGENCE、continueLocal=false、retry=false，同时remoteStatus=EXACT_HEAD_VERIFIED、remoteSha=664fb5f8ae2248a83aff1ba5a623dc22ba2da664。

新增安全诊断确认这次push进程exitCode=1、category=authentication_or_divergence、timedOut=false、5266ms。随后唯一独立GitHub API核对返回同一完整SHA；未重推、未换认证、未修改共享Git/proxy/TLS配置。原文没有保存，具体非零原因仍未证实；networkMode=NORMAL只是本次分类输出，不证明永久网络恢复。

这不是前版健康零退出关键词误判的重复证明；不能放宽真实非零拒绝或TLS身份保护。远端已接受精确提交是已确认事实，Git远端写入保持停止是行动边界。没有执行回执中的恢复命令。

## 精确提交CI与独立复审

在独立核实的原提交上只启动一次[Release baseline 39543987486](https://github.com/clearisok/zhixu-erp/actions/runs/39543987486)，head_sha=664fb5f8ae2248a83aff1ba5a623dc22ba2da664，completed/success，attempt1。

实际日志：发布基线116/116（27610.650442ms）；Git工具66项中65通过、1项Windows PowerShell入口在Ubuntu跳过（6211.672234ms），0失败/取消。守卫checkedHead=664f、errors=[]；workflow_dispatch的historySha是664f、changedUiFiles=0，该检查不替代前述本地对main的完整63路径检查。

既有reviewer只读复核代码、回执、独立exact和实际CI日志，无新增阻断。不重新派发d6 Source/Team、不创建重复累计PR，也不合并、关闭或部署。

本机ignored证据：outputs/git-success-664f-delivery.json、git-success-664f-ci-dispatched.json、git-success-664f-ci-status.json、git-success-664f-baseline-ci.log；原失败/green日志分别保留。此后状态归档为独立本机文档checkpoint，未再次上传，不冒称664f CI验证归档后的HEAD。

## 下一业务边界

Gate7成衣实际出货定义问题已发送、尚未收到回答；物料出运、计划完成量不替代成衣出货。Gate8加工服务产值、完成变化引起的关账stale和历史CNY工价处理仍待决定。完整Server收敛未达成，不标记目标complete或擅自暂停。

保护3001/50426/59069/62426及旧数据/卷/工作树/Browser；62426仍Gate1源8175。不修改真实账号/业务库、不新增真实来源查询/绑定/激活/调度、不安装依赖、不做资产退役。
