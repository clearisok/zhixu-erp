# 当前恢复点：6086941逐行确认和离线观察模型

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。当前feat/ainuoke-payment-request-read-model从原诊断33ccad55454568acbba9909109d23cf20bd7139b/clean开始，沿erp-followup-governance工作树。B2@68ac、诊断33cc、Quote小修d9bf及原refs/私有报告保留，不新建工作树/重复PR。

D136已记录最新用户确认：两个精确样本OutStoreNum是本次申请物料出运分配、单位个，采购CNY且申请金额沿对应采购合同币种。其他98行不能默认CNY。原私有报告d500982d3b6ba1b2cf408db4e626e4097d93c3570852398e3b911be98cbb80ae不变。

Python纯离线extractor和Node纯Projection保留精确数值文本、missing/null/blank/0/负值、各数量金额；id未核实为稳定分录，不去重或求和。人工确认绑定来源指纹/时刻/raw hash/页/行/完整行hash/采购合同；变化或矛盾不沿用。没有API、DB、Source catalog注册或UI解锁；确认只由可信集成层提供，不接受客户端自报。

100行离线通过，0HTTP/0DB。原受保护目录中的新私有确认SHA212481539bf342aef5899658199bf20d95e76331a3c3d32983a1a0e768c60e02，观察SHA db33b5a9fa782cbd6117e6d2b706632fa7a76f5aa7479286bb386b5298bc6518。公开仅别名/统计/hash，不把真实单号/品名/数量金额入Git。

12观察Node/47诊断Node/96Python、类型/Server编译/全源码lint（排除继承outputs私有生成物）通过；本阶段root与94发布回归、manifest绑定在最终Phase收口。最终checkpoint看git log，交付前核对clean/main/精确门禁。

下一工程：固定合同过滤与完整分页、跨时间稳定明细键/作废修正、可信采购币种关联→持久快照/当前有效SO/fresh权限→原事件侧栏。首页不是某单完整对账；申请字段不等于银行已付，不新增付款公式。

所有真实读取次数用完；最新回答只确认含义，不扩大读取/写入范围。不要再请求6086941/Discovery/材料、读取凭据、重启四单窗口、改真实DB/账号、部署或自动合并。新真实验证先备好固定范围再确认。

Git NETWORK_DEGRADED，最新AGENTS恢复规则适用，不自动恢复/换认证。main未变；PR109精确1fcc三项CI成功/可合并，110–112及108独立，未获新合并授权。新branch未远端、无新PR/Hosted CI；恢复命令必须用最终完整SHA，只给一条。
