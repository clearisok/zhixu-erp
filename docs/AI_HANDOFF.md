# 恢复点：价格协同 Phase1

main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；工作树order-commercial-versions/zhixu-ainuoke-api，branch feat/order-commercial-versions，clean起点e3cebb48622e39cf2d31ca82bce4a3f971c973ee。当前增量只属于批准Phase1，无继承dirty。旧摘要/接力完整归档tasks/completed/2026-10-17-price-coordination-before-g2.md。

确认解析器已统一CCT存在优先/否则PV确认；订单使用关系不能让价格消失。现有CCT空值仍阻断回退/第二写入。列表含商业采用历史以发现使用关系，但金额来源不依赖SO；XLSX当前采用统一规则，历史仍原快照。新来源集成回归已覆盖零、空CCT、无创建SO的CCT与无CCT已有SO。

用户批准的后续顺序：在PR117前向整合本提交，完成0028颜色身份/商业版本及报价唯一来源；再独立议价PR、加工/导出交互PR。D145全文范围见tasks/active/quote-order-price-coordination-2026-10-17.md。本阶段不改旧迁移、不触真实演示/凭据/数据库，不合并部署。

下一步完成相关回归、lint/build/root/基线，checkpoint并前向绑定DECISION_LOG，精确门禁后通过原交付工具一次推送/核实，更新唯一PR110；随后与当前clean PR117合并时只协调摘要。价格操作从不回写报价确认或其他订单。
