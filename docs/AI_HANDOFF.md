# 当前恢复点：6086941 Windows编码修复已验收，真实核验次数已用完

2026-10-15；GitHub API再次核实main064e3afaf7d08b3cb62907d4402f97d9c292f1e5，开放PR仅108–112。当前feat/ainuoke-payment-request-probe；B2另一树68ac1fc9f839ebfc894d39377dac221e7f65566b/clean保留；旧21da670及全部私有报告未改。

新“最多两次”授权已2/2执行：第三次537d671/clean约6.75秒、第四次186249f73aa64c9a7970f65b8919af2c9dfeedde/clean约5.58秒，均FAIL payment_probe_invalid_evidence / collection，无worker计数、0业务JSON报告。此前两次单次授权亦已用完。不再自行追加真实请求；若新授权仍仅固定6086941首页100行/4MiB/120秒，一次登录一次报表，无第二页/Discovery/DB/绑定/激活/部署，凭据仍私密进程消费。

确证本机Python管道默认GBK而Node严格UTF8；实际CLI含原文中文的离线测试在旧实现失败。先前合成样本内层已ASCII转义而漏测。已将IPC封套ASCII转义，解码后原始Unicode与原UTF8 hash不变；增加worker_encoding/json_invalid区分。此前分页数字/total协议、精确证据错误和安全rejected私有留存修复仍保留，未放宽业务通过条件。当前47Node/实际包装器和GBK CLI、87Python、类型/定向lint通过；186249阶段94基线与精确main门禁通过，最终SHA与门禁收口见冻结新附录。正式业务字段映射、币种、财务含义、关联粒度和UI仍未验证/接线，不认定实际付款。

用户撤销旧AGENTS执行指令（未删文件），无需旧Git恢复额外审批；不扩大真实范围。Git诊断定位github.com:443 TCP连接失败，未到认证/TLS，实际push0；没有共享认证/TLS/代理修改、重复PR或自动合并。

独立fix/quote-logout-save-retry在旧server-quote-to-order树65566527b15c1ffd78715389d7c34db0e867b300，原a0e60e4保留。两处保存/退出保护已复现并最小修复；13项真实浏览器/一次性PG、112前端认证/持久化、类型、构建、lint通过，精确main门禁PASS；无UI改版，待独立文档/远端收口。

真实四单窗口已12/12结束，不重启；未改真实账号/业务DB/现有演示镜像/宁波18443/18444。GitHub实时事实优先，本文件随代码、授权、证据或远端状态更新；Goal继续。

当前编码修复源码362f81ba704ab792eff102cf121301deee4998f0，冻结新附录[第三/四次与IPC证据](tasks/active/evidence/ainuoke-payment-request-probe/third-fourth-attempt-ipc-2026-10-15.md)记录于5a24f37909f7057cf323032ba1f632a700b38d52；最终精确main守卫待本manifest提交后执行。此前186249门禁结束时工作区已有本轮编码自有改动，checkedHead只代表Git HEAD，不冒称当时clean；最终clean门禁另留结果。
