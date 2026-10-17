# 恢复点：价格协同 Phase1

main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；工作树order-commercial-versions/zhixu-ainuoke-api，branch feat/order-commercial-versions，clean起点e3cebb48622e39cf2d31ca82bce4a3f971c973ee。当前增量只属于批准Phase1，无继承dirty。旧摘要/接力完整归档tasks/completed/2026-10-17-price-coordination-before-g2.md。

确认解析器已统一CCT存在优先/否则PV确认；订单使用关系不能让价格消失。现有CCT空值仍阻断回退/第二写入。列表含商业采用历史以发现使用关系，但金额来源不依赖SO；XLSX当前采用统一规则，历史仍原快照。新来源集成回归已覆盖零、空CCT、无创建SO的CCT与无CCT已有SO。

用户批准的后续顺序：在PR117前向整合本提交，完成0028颜色身份/商业版本及报价唯一来源；再独立议价PR、加工/导出交互PR。D145全文范围见tasks/active/quote-order-price-coordination-2026-10-17.md。本阶段不改旧迁移、不触真实演示/凭据/数据库，不合并部署。

下一步完成相关回归、lint/build/root/基线，checkpoint并前向绑定DECISION_LOG，精确门禁后通过原交付工具一次推送/核实，更新唯一PR110；随后与当前clean PR117合并时只协调摘要。价格操作从不回写报价确认或其他订单。

Phase1源码0c971f74201fea0d84ea3c1a145aae10dae2e5cd已checkpoint；42项相关/6项原CCT、root824、typecheck/lint/Server编译/前端构建通过，D145已前向绑定，精确main门禁PASS。基线需在绑定后重新完成；第一次与绑定并行运行读到旧清单而报文档漂移，未降低检查。

Phase1补充14项独立商业采用回归通过，修正无CCT时使用PV通道的旧测试断言；源码功能未变。基线78/78在c658绑定后通过。一次正常交付传输失败，远端仍e3cebb4，NETWORK_DEGRADED，不在后续重复推送。
