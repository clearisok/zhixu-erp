# Gate2当前接力

2026-10-14；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。分支feat/order-commercial-versions父提交Gate1 b5c7eb89dc25c397ebf342baa0607705abc80c89，初始clean。Gate1独立工作树已完整收口，用户普通PowerShell交付回执待返回；不要改其head或重复建PR。

当前Gate2仅schema/实施基线开发中，未验证，见tasks/active/order-commercial-versions.md。发现报价无SO时确认写PV、有SO时写CCT，候选必须区分并锁精确来源版本。订单读取最终不得回退共享current；旧订单CCT PATCH需收紧。0015新增版本/head不回填真实价格，尚未执行。

继续：候选/采用事务、独立读模型与权限、旧路由切换、历史只读切换预览、负向合成/HTTP/浏览器/回归。CCT/加工/归一/页面后续仍依计划。全部禁止真实账号/DB/部署/Source扩大；依赖node_modules junction同Gate1，不删除共享目标。完整Gate1证据在tasks/active/evidence/order-identity/gate1-results.md。
`nGate2基础checkpoint：0015不可变商业版本/head已在一次性PG验证；commercial-source.ts区分CCT与未关联Quote确认、精确decimal/零/未知、币种冲突和归属校验。6项定向及server:build/增量lint通过。尚无采用事务/API/旧读取切换，不冒称Gate2完成。
