# 6086941 第三/四次尝试、分页协议与Windows编码修复

核实日期：2026-10-15。GitHub main：064e3afaf7d08b3cb62907d4402f97d9c292f1e5。
最终修复源码：362f81ba704ab792eff102cf121301deee4998f0；分页/私有拒绝证据源码：186249f73aa64c9a7970f65b8919af2c9dfeedde。
本文件是冻结工程证据，不是财务业务验收；后续变化新增附录，不覆盖本文件。GitHub为实时工程事实源，更新时机为源码、真实授权/回执、PR/CI或正式映射变化。

## 已确认事实

| 实际尝试 | 工具提交 | 结果 | 可证明范围 |
|---|---|---|---|
| 第一次单次授权 | fc314ce061075d9033cd07bde73fff36dd0fe5f2 | 约5.55秒，payment_probe_failed / collection | 通用失败，无worker计数，不能推定登录/报表结果 |
| 第二次单次授权 | 244b3d07ab618497874780690682f38d04e80d34 | 约6.23秒，payment_probe_invalid_metadata，validation，2HTTP/1report | 登录及基础报表分页解析通过，元数据校验阻断 |
| 新两次授权的第一次 | 537d6711cc3b50c8b680012946055fb2676558e8 | 约6.75秒，payment_probe_invalid_evidence / collection | 无worker计数，不能还原具体返回 |
| 新两次授权的第二次 | 186249f73aa64c9a7970f65b8919af2c9dfeedde | 约5.58秒，同一通用错误 | 无worker计数，不能据此声明业务映射或当前条数 |

四次均未形成业务JSON报告；新两次授权已2/2消耗，停止真实读取。没有第二页、Discovery、DB、首次绑定、激活或部署。真实原文未保留，不能声称已还原最近两次的具体响应内容或确切失败字节。

## 根因调查与已解决的工程问题

1. Node/Python分页规则不一致可复现：Python支持去空白ASCII数字串及dataCount缺失时dataList.total，原Node严格比较原始类型，且错误允许分页字段缺失。186249统一可接受表示，仍拒绝null/空白/布尔/负数/小数串/指数串/不安全整数；0仅保留现有请求分页哨兵，不填业务未知为0。
2. 诊断错误过于笼统：现分开封套、时间/hash、响应/行数、总量/分页、元数据、worker编码与JSON错误；只输出闭合静态码，无上游异常文本。
3. 失败原文丢失：仅在封套/字节/hash/深层秘密校验通过时保留rejected私有报告；保留不代表来源映射通过。原文仍受ACL、Git ignore、独占写入和文件hash保护，PS再查路径/ACL/hash；敏感、hash错、超限、伪造或不可安全解析响应不保存。
4. Windows进程编码缺陷已独立复现：本机Python pipe stdout/stdin为gbk、preferredEncoding cp936、utf8Mode0；实际CLI输出含未转义中文的合成报表，在旧实现触发ERR_ENCODING_INVALID_ENCODED_DATA。旧样本中文藏在ASCII转义的内层JSON中，遗漏该边界。362f81b只将IPC JSON封套改用ASCII转义，Node恢复同一Unicode原文，UTF8原文hash和业务数值文本不变。此缺陷与最近两次阶段一致，但没有原始字节，不把相关性冒称逐字证明。

没有修改HTTP响应、报表目录/持续采集范围、正式Adapter、TotalNum/cgnum/num_dyc语义、金额/单位/汇率计算、SQL、UI或数据库。

## 本轮合成验证

- 47/47 Node：实际Python CLI在GBK下含原文中文、Unicode/hash保真；异常UTF8/JSON、固定范围/预算、真实PS私密包装器/ACL、rejected证据writer、秘密反射与错误包拒绝。
- 87/87 Python；完整typecheck、定向eslint零警告通过。Server build以同目录本轮日志为准。
- 186249精确源码阶段：94/94基线回归，main守卫PASS（11页/36能力/53项继承UI路径）。后续仅编码边界及定向回归/文档更新；最终发布manifest守卫单独记录，不冒称94项在每个后续文档提交重跑。
- 没有新截图或人工视觉/业务验收。早期40/87、45/87及原37/83报告保留原时点。

## 用户决定、建议及待确认

用户决定：固定首页每次最多100行/4MiB/120秒，一次登录一次报表；本轮最多两次已用完；不自动循环或扩大范围。旧AGENTS规则被用户撤销，文件未删，但该真实读取次数是独立用户限制，不能据此扩大。

AI建议：先冻结本次可复现修复与测试，再经一次新增同范围授权自行执行私密工具；成功后离线核验字段/列元数据、行id粒度、单位/币种及合同/采购/出运关联，才提出独立正式接线。若仍失败，按精确静态码及可安全保存的证据离线处理，不盲目重读。

仍未确认：当前真实返回总条数、49字段映射与元数据形式、id稳定性/重复粒度、OutStoreNum分摊来源、单位/币种、审批/实际付款含义。用户提供100行公式仍是候选样本观察，不是全量约束；不认定GoodsAmount为银行已付款，不将Num跨物料/单位求实物总量。

远端：再次API核实main未变，开放PR仅108–112；本分支尚未交付/无Hosted CI。此前Git分类是github.com:443 TCP连接失败，尚未认证/TLS；未改共享配置。全部原工作树/提交/私有证据保留，真实四单窗口已结束且未重启；不改真实账号、宁波、18443/18444，不自动合并部署。

## 本机合成/门禁日志校验值

- outputs/payment-envelope-baseline.tap — 3cb64fb3d7f9ecab7d206fe20d45898840869c65cfb6d6ae3fe0cf7143e43dbe
- outputs/payment-envelope-baseline.log — 406d80fc7e4a2d3fc1cd04dae89a4ae97daae8d9988c477efcd96df6f53d3a34
- outputs/payment-encoding-before.tap — 42c6480cc9764468ce099bc4ecc2fad373e5024dcf052dbc74d10465bbd15c8f
- outputs/payment-encoding-node-final.tap — cb9ac9d90c4171bab9a5b25cf5c600b313ac78fe82d995a1297b8c44c8efd91b
- outputs/payment-encoding-python.log — 9cd3aca882094f38475a838b561cb187642ea65a491f31c051fa7fc0138f1c5a
- outputs/payment-encoding-types.log — 302304dae6dfa71f31211837c732c0510177504fe6b5063786b269c5e1fef2ec
- outputs/payment-encoding-lint.log — e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
