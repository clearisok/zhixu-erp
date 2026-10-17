# 价格协同阶段实施记录

main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5；批准范围仍为同目录quote-order-price-coordination-2026-10-17.md，原冻结文件不覆盖。

## Phase3：统一订单议价

起点feat/quote-order-sale-adjustments / clean 4013e3ec3abaf34551fe82e5dcedbac343279546。0029只存操作与逐单尝试/回执；成交价仍是0015/0028商业版本。每单原子、批量部分成功、fresh售价权限、CAS指纹、原请求核对/继续、报价上下文改配及三处统一历史已实现。

12项定向（含旧统一价历史、权限撤销、并发幂等、真实COMMIT后回执丢失代理）与4项实际Chromium（单单隔离、刷新恢复、历史/只读和390/1440弹窗）通过。类型、Server编译、相关源码lint与显式Server构建通过。仅一次性合成库，没有已有演示或真实数据操作。全项目/发布基线随整合收口。

## Phase4：加工协同与选择模式

起点feat/processing-quote-push-and-selection / clean 5b948be9978a2ce6577618dd2a36cb38d7d74342。0030追加回执，0015/0016/0027不重写。复用现有Quote repository事务写、CCT确认校验、0016批次登记/确认/消费原语。加工投影/保存保护、纯工价XLSX/汇总、更多选择与可编辑推送完成；多色商业使用查询同步修正，避免空header误报旧来源不完整。

当前81项领域（含升级原数据保护、源/色/CCT/议价/加工）及14项加工实际Chromium通过；此前来源/议价10项浏览器保持，新增“受理前失败原命令重试”继续最终验证。类型/相关lint/显式Server构建通过。全量Postgres、全项目、完整lint和默认构建等最终收口中，不能沿用为本head已PASS。所有fixture均一次性合成库；不触碰62316/62326、真实账号/业务库、宁波或18443/18444。

分支交付按#110确认来源→#117来源颜色→新增议价→加工与选择整合。多色引用及迁移ledger修复须前向回补#117/议价分支后，再收口整合分支；不把累计分支直接建议一起合并。网络首次已NETWORK_DEGRADED，只继续本地，不反复推送。

完整Postgres首跑251/260；发现并修正经销ZIP必须在批量开始前核验售价权限（不能降为逐项200失败）、加工旧quotedGarment不再重算的旧测试口径，以及权限目录66→67的明确数量断言。19项相应回归重跑通过；完整PG最终重跑待整合固定源码。源码lint另修React props局部变量，排除生成/private outputs数据，不改变生产逻辑或读取其中业务报告。

## 最终整合验收（2026-10-17）

从clean 5ca54e2dfba3c88164f6b2eb7f9c3cdbecb9f160收口，完整项目898/898、Postgres261/261、专项领域81/81、实际Chromium26/26通过；类型、完整lint、Node编译、默认Browser与显式Server构建通过。完整PG源码为87f08395，之后仅有来源body上限8192→262144（1000项仅预览回归通过）、Modal布局、既有JSX属性顺序与文档/测试更新；没有重写旧0015/0016/0027。26浏览器与898项目在最终整合5ca54e2d上运行。最终发布证据绑定及94基线再核对在后续独立checkpoint，不能把历史Hosted CI视为本次新提交CI。

PR117布局修复da46cdeb70e3785a760d6381c2e4974a57668a2a，议价02e1eca080d91bf878bee9deb3817067e60bf90f，Phase1 e70deacfe446088677aa3d96e998436b730cb7af均为整合祖先。详见completed/2026-10-17-quote-order-price-coordination-engineering.md。
