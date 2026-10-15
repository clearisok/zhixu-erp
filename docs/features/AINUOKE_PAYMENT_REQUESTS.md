# 艾诺科货款申请来源观察

核实2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。GitHub为实时事实源；源码、字段/业务含义、授权、真实验证或UI验收变化时更新。当前为D135–140隔离工程候选，未合并/部署、未正式接通财务来源。

## 业务边界

6086941是独立货款申请明细，不是银行实际付款或织序商业价格。Num采购量、OutStoreNum本次申请出运分配、bgNum报关量、kpNum开票量各自保留；不与6087050的同名出库字段混用。不同数量本身不是错误，同一采购量可能在分批记录中重复，不能逐行求和恢复采购总量。

金额均保持原始十进制文本，不用JS Number舍入、换汇、推默认币种或扩大样本公式。cgGoodsAmount、PayAmount、GoodsAmount的合同币种确认须绑定精确证据；其余字段不继承该币种。未知预付/审批日期、单位、币种不补0/个/CNY。首批旧两行确认不自动传播到新capture。

原报表50字段（含id）在features/ainuoke-payment-requests/model.ts统一维护，旧server字段导出保持原顺序；字段名存在不是映射认可。当前没有可直接视为6087050需求ID的标识；不凭名称/规格给选中物料自动匹配财务行。API和页面是合同级来源观察，不是物料对账结论。

## 服务端

纯模型payment-request-snapshot校验精确账号/合同/三字段见证、最多200行/2页/完整两遍；旧首页v1/page1不扩大。0025仅新增逐SO默认关闭目标、不可变原页/投影和单调CAS发布指针，零回填；既有物料Source开启不启用财务目标。

内部prepare固定可信Source链接、原owner/有效SO、账号、归属与目标版本、预期发布代际及采集前时间；publish复制固定输入后重新检查数据库权限和范围。同一已接受内容重试返回原发布，不同内容竞争只能一方通过；不向旧别名发布、搬动历史身份或引用。读取从原页重建并检验完整投影，不只信一个hash。

GET /api/v1/sales-orders/:uuid/payment-requests仅Session/正式SO UUID；默认runtime不开启，独立ZHIXU_AINUOKE_PAYMENT_READ=snapshot还须已明确启用的精确DB目标。无HTTP写入/启用/读取凭据入口，不读CCT/报价内部成本，不调用上游、Browser或缓存回退。fresh DB权限沿order.view/ainuoke.view/style_progress.read；加工不适用、历史别名不重定向。真实过滤/分页、采集器和实际发布均仍有独立Gate。

显式wire v1包含观测时间、最早页到期和evaluatedAt。空状态不携带行；observed只是观测时点事实，不表示实时或银行付款。最早页十分钟失效后服务端隐藏明细。归一证据包含财务目标、原owner/当前SO引用快照和指针的全量hash，不把它们当生产执行/冻结账目，不省略外部覆盖或独立审批。

## 只读客户端与现有侧栏

客户端固定同源GET/no-store/redirect:error，32MiB流式上限，严格schema、SO/逐行合同、页/行/数量/单位一致性及不推付款状态。精确数字只作文本；不求和、不默认币种或单位，不使用Browser存储、重试、任何来源写入或凭据。

在既有对账tab内复用Foundation、原Drawer和只读表格，明确合同级/未关联当前物料/申请非实付；每页10行显示全部来源记录，逐行展开独立数量/金额/业务字段与本次来源页行。不能以该展示把重复行归并为稳定财务分录。物料列表、原四流、导航及正式数量不变。

只有打开该tab才读取DB；关闭/换tab取消，订单/身份/权限变化立即隔离旧响应；失败不保留旧金额。最早页剩余寿命根据服务端evaluatedAt和整段请求/解析延迟保守计算，使用浏览器单调时间；到期隐藏明细，恢复可见/焦点时清旧状态重新查DB，不触发上游采集。

## 验收与真实启用

恢复tasks/active/ainuoke-payment-read-panel.md。本阶段150项客户端/原探测与实际一次性PG/API回归通过，类型、Server/显式Server UI串行构建、完整源码lint通过；新财务UI9/原物料UI9项实际Chromium通过，六宽度/七角色、展开字段、过期/撤权/取消及精确数字已验。源码cefe951d、build20261015-231629；新截图及receipt另存，非像素人工验收。后续root898/898、发布基线94/94、默认Browser构建及精确main守卫已通过（11页/41能力/56累计UI路径）；当前dist最后是默认Browser（quote/master browser、orderRead disabled）。此前存储证据按c235ca6e/931492af/b75bc7a9原阶段阅读。

真实读取额度已用完，当前无新增真实查询许可；不得凭本地代码、wire complete、目标verification hash或自动Goal继续推定授权。需要单独核实真实过滤/分页、具体SO/合同清单、备份与迁移/写入/激活范围。UI功能范围已批准不等于新像素人工验收；不操作宁波18443/18444、真实账号/业务DB或现有演示，不自动合并部署。
