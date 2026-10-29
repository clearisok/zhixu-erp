# PR131：正常网络交付及浏览器验收收口

2026-10-29；branch `feat/closing-support-interfaces`；phase baseline `40b1a7f712fce70026b90f3f795e28b691b17de2` clean，main `6479a713e2b80228f008049519ebbd50d10601a8`。本片最终HEAD从Git核对。[原三摘要全文/长度/hash](2026-10-29-pr131-browser-route-recovery/input-state.json)保留旧结果，不覆盖历史失败。

## 已验证的网络与远端事实

用户答复“再试试”后，原有有界交付协调器执行本次恢复。先前直连尝试传输中断、远端仍2fd；随后只读发现Git旧loopback17989已不监听，Windows当前系统代理loopback7888正在监听。该进程采用7888、OpenSSL、HTTP1.1，保持证书校验及原认证；实际上传10861ms、Git exit0、DELIVERED_VERIFIED。工具独立API和PR131均确认完整40b1；没有全局/共享配置、认证或TLS验证变更，没有force或重复PR。

上述端口不一致解释本次旧代理路径不可用，不倒推此前2fd exit1的原始原因，也不证明网络永久稳定。原异常回执和失败保留。安全回执为ignored `outputs/approved-support-flow-20261028/40b1-proxy-7888-delivery-55ceace6-e100-494a-bb86-be03e4edeeb6.json`。

## 40b1 Hosted真实终态

| Run | 检查 | 结果 |
| --- | --- | --- |
| 40719451821 | Release baseline | success |
| 40719451760 | First team access | success |
| 40719451599 | Ainuoke server source | failure |

仅随一次成功上传自动触发，没有手动重跑。source的后端、迁移/会话、SQL/API、quality、显式Server构建均通过；实际Chromium生产资料23/23、排单37/37通过。随后P6共14项12pass/2fail（一个子测试及父级）：`ainuoke-continuous-ui.integration.test.mjs:162`仍把已批准的`/closing-center`期待为禁用页。实际页面正确显示Server关账权限拒绝。余下UI及Python未到达，不能计通过。

## 本片仅修验收，不改产品

- P6保留三条旧订单路径拒绝，另测两条已批准关账路径：受限角色页面拒绝且API403；管理员实际年度页面、两项币种、十二月及API200；均无业务写请求或旧Browser存储。
- 本机继续CI此前未到达的UI，先发现议价恢复测试等待短暂message。源码恢复effect设置message后，列表load的`run`会清空它，但原请求编号仍持久显示。原件7项2pass/5fail（四个子测试连带及父级），没有冒称全绿。
- 只将该测试改为等待稳定原请求编号；丢响应后核实唯一pending原字节、已提交version3，刷新及读取原回执都没有第二次POST，最终版本和117成交价不变。未修改产品的提示、恢复协议、金额或导航保护。
- 独立只读reviewer对两份测试分别复审，无P1/P2；没有代跑测试或读取真实数据。

## 验证边界

复用a198 canonical正式产物（`support-verified-a198d182`），application/UI构建输入未变；后继唯一features差异也是测试。使用owned临时`dist/client` junction、实际Chromium、真实Node与全新自有一次性PG。原静态产物、共享依赖、旧环境和所有既有卷保留；runner只移除自己创建的junction及fixture资源，不安装依赖、不重建相同产物。

实际11组浏览器共119/119，0失败/取消/跳过；逐组时间、日志SHA256和产物身份冻结于[验证摘要](2026-10-29-pr131-browser-route-recovery/validation-summary.json)：P6 15、加工批次8、加工推送8、维护来源7、订单议价7、物料历史9、排序10、成衣出货14、交期14、货款申请9、关账18。未重复CI已经通过的生产资料和排单组。

议价补强的中间轮7项3pass/4fail保留：新断言在HTTP完成前过早读取version，随后显式等待“成功响应已被故意丢弃”标识，再核实version3；最终7/7，15471.4153ms。原失败不是产品价格回归，也未通过修改产品或移除恢复测试取得全绿。两份测试相关eslint/diff通过，临时junction已移除，原产物仍保留。

来源CI仅20→25分钟及两条说明注释：以原40b1文件逐字反向替换证明其他所有步骤、触发、缓存、concurrency不变。实际旧运行15:47:12开始、16:04:46在P6失败，剩余约2.5分钟；本机该尾部通过也需要多组真实页面，合理留余量而非反复等超时。不增加job、不跳测试、不手工rerun；25分钟是上界，不是每次固定消费。

40b1新Hosted release成功；c9完整182/182及原a198 811项目/18浏览器、镜像90e恢复9/9仍保留原source和日期，不重复相同成功大套件。最终commit对精确main发布守卫单独运行；本片不触及guard、manifest、UI或SQL，不借旧head CI宣称新head通过。

## 原目标与发布边界

完整Gate0–8/R继续。唯一PR131仍draft；最终必要检查和复审后申请精确合并，不自动合并或部署。随后冻结最终main镜像/独立持久目标、D105真实首绑/有限续刷及人工核对；staging当前旧7cd，不因网络恢复宣称就绪。

纯配置负控另确认：原本机trial只允许loopback HTTPS origin，直接传`https://staging.weaveops.top`返回`local_trial_origin_mismatch`。需要受控公网origin部署配置，保留本机守卫；不是取消验证。附件经授权应用流转，无需暴露对象存储端口；Linux源码operator至独立DB的实际可达性仍待验证。此项只用合成值，无服务器写入或部署，详情见发布准备清单。

本片真实Source请求/凭据读取/业务库操作/绑定/激活/调度均0；旧真实额度已耗尽，D147具体范围仍需批准。保护3001、50426、65139、全部旧工作树/依赖/卷/备份，不清理资产。网络只读成功或安全交付常设授权不扩大这些边界。
