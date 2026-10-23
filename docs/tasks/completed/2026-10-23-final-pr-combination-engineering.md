# 最终PR历史组合工程验收

2026-10-23，Asia/Shanghai；root唯一writer，既有独立审查者只读。完整G1–G5目标继续。本记录只证明本地组合工程，不证明GitHub main合并、目标部署、用户接受或真实Source激活。

## 精确源码与保留范围

实际main为d1dd4f0fcf9992d5c055c7b67b6832b635485680。原候选1962d7bff59d29e718673f49a6c2a24a30ac061a先通过精确main守卫、一次正常push，随后独立核对SHA、tree66a0fc94与父e7b3一致。#123 head cb1658d97485bbf6c529660fffb50215548fffcd、#125 head ca05d3e75d3b28be44184a5ef645c9f24e6f38d3均open draft，未合并。

从main建立codex/server-final-pr-combination，FF1962，普通merge保留两PR完整历史：

- 4d41e5d90bc6c7dfe29ff355d5941fb7b1c904a8，精确有序父1962/cb1658；33f5c2ed追加DECISION见证。
- b14f79fb47e607ba55268916fe9f10023141df3f，精确有序父33f5/ca05；d08613d00d181e35f4ce8b592dfc0a776f1c19e3追加DECISION/CLOSING两条见证。
- 验收冻结于d086，tree=f3a4e3345681742807822606c0632e644deba1c2。清单318证据/59能力；756个父证据对象逐项相同，除追加证据外所有字段及能力状态与1962完全相同。没有旧ID/hash、截图、批准或运行维度改写。

两次各有两个merge bases，没有选择一个冒充唯一基线。第一笔五冲突为三摘要、manifest和来源测试；保留1962更强的逐字段/精确金额隐藏负测。第二笔五冲突为三摘要、manifest和BUSINESS_RULES；保留原D147空数据/CNY销售产值和USD工价决定，不推定其他关账规则。

与1962相比唯一非文档变化为team-access-ui.integration.test.mjs，blob精确等于CB的原修复：首次真实GET屏障、owned Chromium关闭/pending清理、直接临时目录边界。不扩大等待预算、不循环click。产品、SQL、UI、构建和ops输入完全不变。两个受保护旧本地refs仍为ebe4cb16/4cf19e82；既有运行态未移动。

18份新父摘要/manifest/规则[按原Git字节归档](2026-10-23-final-pr-combination-inputs/)，四份规则档案末尾原空行保留；20项staged原字节比较通过，限定排除这些冻结空行后其余diff检查通过，未篡改历史消警。

## 实际执行验收

| 检查 | 实际结果 | 范围/耗时 |
| --- | --- | --- |
| 精确d1dd发布守卫 | PASS，11页/59能力/87继承UI路径，errors=[] | d086；不是浏览器或部署验收 |
| 发布负向/响应式回归 | 134/134，0失败/取消/跳过 | d086，575747.8533ms |
| 完整类型、Server编译 | PASS | 精确Git archive；Node24.16.0 |
| 四文件scoped ESLint | PASS，max-warnings0 | 实际合流/关联测试 |
| 浏览器保护及域恢复保护单元 | 21/21，0失败/取消/跳过 | d086，406.6662ms |
| 订单来源/颜色/金额权限PG | 9/9，0失败/取消/跳过 | d086，一次性PG，5980.3877ms |
| 显式Server/session/snapshot实际构建 | PASS，46路由生成/0跳过 | 下述规范长路径对照 |
| 角色/用户/日志真实built Chromium | 8/8，0失败/取消/跳过 | 原测试未改，22345.579ms |

发布测试前后HEAD和manifest保持；清单SHA256=db85afb352762913f08eee2513d42456d4d9735e6200ceb7891fcb7caefbd5be。外部archive SHA256=ab33f1c10cdf6ec2e9276703463622ca8f92cbf21a33b486c4a40e1c73955da5，与Git d086绑定；依赖为既有node_modules只读使用的junction，没有安装。构建ID为server-combined-d08613d0-20261023，buildTime=2026-10-23T10:56:01.721Z；不是新Docker镜像。

不重跑未变化产品的全部952/270等旧套件，也不将它们算成本次通过。8项含父测试与7个子项，不称8个独立屏幕或人工像素批准。原三态命令恢复9/9仍属于65545 driver/原357镜像，不冒充本组合又做了一次恢复。

## 保留的失败与安全修复

第一处是ignored验收驱动读取已安装tsx的bin时假设为map，实际为string；在API启动前停止。类型、编译、lint及21单元已通过。只修正本机驱动，从未执行的API/构建步骤继续；没有修改产品/测试、重跑已通过步骤或安装依赖。原停止记录和日志保留。

随后首次短路径构建虽exit0，但45路由预渲染失败、仅404生成，原builtUI在登录前1/1失败、尚未进入子项。日志中的useServerSession缺失Provider有实际产物证据：同一个源Context被长路径别名与根内相对路径编译为两个独立模块，RootLayout注册的Provider和Boundary hook使用不同Context。不能通过增加等待、放宽权限或删断言处理。

使用同一Git archive、依赖target、完整env/构建ID/time和直接Node vinext命令，在fs.realpathSync.native(tmpdir())下另建全新自有长路径context；仅改变路径身份。新产物只有一个Context、Provider与hook同源，46路由全部生成，原8项浏览器测试通过。产品/测试字节、全局TMP/代理/TLS/认证/依赖配置均未改。短路径失败dist和日志仍保留；结论限于本次对照，不表示框架已永久修复。

后续Windows外部构建应先用native realpath规范化根目录，并核对预渲染结果与实际HTML，不能仅凭vinext退出0认定有效。独立构建产物检查是后续工程机会；本阶段未修改正式构建流水线。

## 复审、交付与边界

既有审查者分别核对双父/证据图、756父对象、18归档、旧refs、源码等价和长路径控制，未发现P1/P2。发布134终态由主控核实，不用静态复审替代实际执行。

本地原始结果在ignored outputs/final-pr-combination-20261023：baseline/combination-scope、release/result.json、qa的原失败与21/9、canonical-control的46路由与8项结果。原1962精确交付回执在outputs/garment-command-recovery-20261023。原文日志、生成物不随PR上传。

#123/#125的新CI因账号付款/支出上限被拒绝启动、0steps；用户确认尚未处理。不重跑/修改账单、不冒称代码失败或CI PASS。本冻结尚未观察最终文档HEAD的远端结果；随后仅一次交付验证引用并独立核实完整SHA/tree/父，不建重复累计业务PR。没有其他PR合并/关闭、真实Source/凭据/私密报告读取、现有账号/业务库修改、调度、环境切换/退役或部署。
