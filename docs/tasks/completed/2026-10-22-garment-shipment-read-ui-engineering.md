# Server成衣出货只读接线：隔离工程证据

2026-10-22，Asia/Shanghai。D147批准Server收敛及成衣出货工程；D152固定6086979的Num/outdate，D153固定观察不跨次累加。用户确认业务字段不是本页面的人工验收。唯一实现者root，既有独立reviewer只读。没有真实Source请求、业务库/真实账号修改、来源激活、调度、旧环境升级、部署或合并。

## 精确范围与源码

- 独立main基线：996dfedc12da3527343cd3ff2aa5eea35497e10e；从其建codex/server-garment-shipment-read-ui后仅FF干净2612输入，原三根摘要逐字节归档，开始文档441edd。
- 公开契约/客户端：1630c19ddd278a2026157ad092b337a11522b643，干净且精确HEAD发布守卫PASS。纯函数从原观察模块原样提取并保留re-export；source/schema/权限/默认开关不变。
- 初UI应用3452efba13bb716160ee5892a71e37fd62c96750；等待与compact修正43989d1acf0c48e6244640d6f1d8a58736893136。
- **最终应用4066b00a2532cbd5572bcd4ef8a5fe7c8453edff，build20261022-022801**；quote/master=server、identity=session、orderRead=snapshot。真正production构建和私有Chromium，不是静态mock页面。
- 第一切片六个model/client/store/API/原观察/PG测试文件经Git差异核实，从1630到最终4066字节不变。后续文档/清单提交不是重新构建应用。

## 实现事实

订单详情新增默认收起的成衣出货Card，使用原Foundation；当前桌面表、移动记录、历史Drawer。历史窄面板逐笔Card同时显示单据、Num、outdate、原单位、采集时颜色及独立单据/进仓日期，避免横滚才能看数量。长数量字符串允许折行，不转Number或求和。没有新路由、全局CSS、生产完成/调价/关账入口或Browser业务存储。

公开DTO只允许17个数量/日期/身份来源字段，拒绝额外金额/备注。独立客户端核对订单/合同/publication、行与两遍trace、原数量日期投影；这是响应校验，不是授权、密码学或上游执行过滤的证明。16MiB+64KiB传输上限、64KiB历史摘要，超限取消流，不截断。边界测试是16MiB理论传输构造，不冒称该最大构造已被真实PG jsonb::text和原input发布接受。

expiresAt只取observedFrom加**原快照**freshness_ms，target新策略不延长旧记录；客户端单调时钟扣除读取耗时，到期只标历史、不发新请求或清空模型。unknown/invalid/zero/negative不混淆，outdate未知不回退FDate/indate/今天，负数不解释冲销。空观察不表示取消或未出货。

当前与所选历史模型分开。打开历史先本地GET核对当前可信绑定，再读摘要/精确publication；过滤后空页仍按游标继续。游标支持完整正INT；详情失效不回退当前或另一张订单。实际session对象、layout epoch、开关、publication和请求序号构成owner；关闭/切单/新会话先失效，再处理迟到响应。401/403、身份变化或来源停用隐藏整个出货区块，显式重新读取才恢复；默认503只影响本区块，不阻断订单详情。

## 实际验证

并非所有检查在一个SHA执行，下表注明事实与适用范围；源码不变的继承关系已核实。

| 检查 | 实际结果 | 范围与证据 |
| --- | --- | --- |
| 出货纯契约/客户端/PG/HTTP/0039升级 | **85/85，29641.6381ms** | 包含44个修后客户端检查，只有自有一次性PG；相关六文件到4066不变 |
| 默认continuous来源回归 | **70通过/1既有Windows跳过，46531.9634ms** | 新fixture的garment选项默认false；不是安装Linux环境消除跳过 |
| 最终出货built浏览器 | **13/13，25015.259ms** | 精确4066/build20261022-022801，独立reviewed输出目录 |
| 原P6/七角色built回归 | **14/14，54774.8721ms** | 同一4066真实构建，原断言未删除；包括既有物料轮询/失败恢复/报价退出保护 |
| 类型、lint、Node构建 | exit0 | 最终UI内容typecheck/lint；4066后server:build亦通过 |
| 应用构建 | exit0 | 3452、4398、最终4066分别显式构建，最终build-info匹配完整SHA |
| 完整项目 | **927/927，247596.6037ms** | UI阶段运行，代码/视觉随后微调；最终新证据后的重跑另记阶段任务 |
| 发布负向/响应式 | **116/116，246258.2954ms** | 当时254证据/53能力；不是后续新增清单的验证结果 |
| 精确1630源码守卫 | PASS，11页/53能力/78累计UI路径 | 最小源码/证据门禁，不等于像素/部署/用户接受 |

最终13项built包含12个子阶段及父项：

1. 默认收起不请求出货；明确展开后精确Num/outdate、独立日期与0/负/未知/无效状态。
2. 1920、1536@1.25、1440、1280、900、390六尺寸，区块/历史在视口，文档无横溢出。
3. 原策略过期及target变更保留记录，不改生产/财务事实。
4. 当前空观察与旧非空记录独立；1440和390历史逐笔卡均验证完整量日、无横溢出、Drawer在视口，并分别截图。
5. 过滤空历史页依非空游标继续。
6. 404/错误publication不回退其他记录。
7. MutationObserver在layout关闭后立即释放旧401，不能注销当前会话。
8. 真实登录A→B→A后，旧200/401不能更新/注销新A。
9. 单调期限到期保留当前记录，且不新增GET。
10. **注入403**验证前端清理；真实target停用验证隐藏和显式恢复。403注入不冒称实际更改角色撤权；后端fresh grants/撤权验证来自PG/HTTP套件。
11. 默认未接通503局限出货区块；无出货POST或Browser业务存储。
12. 七个既有合成角色使用真实session/API核对当前grants与页面可见/实际读取，不含金额/备注哨兵。

独立复审无剩余P1/P2。reviewer未代主控运行测试；工程记录只称上述实际观察。没有开发StrictMode双effect实测，也没有新真实合同过滤/Source全量/生产关账或用户人工接受。

## 失败及修正历史

初次typecheck两处窄化错误修正后通过；误调用不存在的build:server停止，核对package后实际server:build通过，未安装依赖。复审发现两处String(enum)会误接数组，改string前置并加数组/嵌套数组四负例。UI初次lint一项effect依赖warning修正后通过。

3452首轮built的11子阶段通过，最后角色循环在新导航瞬间body=null失败，父项也失败；只修harness null-safe/fresh-document等待，不改业务保护。4398完整13通过；实际查看截图后发现窄历史宽表可读性不足，4066改原Foundation逐笔Card并补显式1440/390断言，完整13再次通过。旧初始/4398日志与图片保留，没有覆盖PNG或改hash清除失败。

详细原始工程日志位于ignored outputs/garment-read-gate7c；最终生成物位于ignored outputs/garment-shipments-ui/4066b00a2532cbd5572bcd4ef8a5fe7c8453edff-20261022-022801-reviewed。以下四图逐字节复制到新路径，拒绝覆盖。

## 新截图证据

已实际查看四图，量日完整、窄历史无需横滚找数量，手机底部关闭操作保留；仅合成工程检查，不是用户视觉接受。

| 文件（evidence/2026-10-22-garment-shipment-ui） | 尺寸 | SHA256 |
| --- | --- | --- |
| current-1440.png | 1440×1000 | 80e40a39cb13c323d69980661a6e8973e0c5f09be96473095623445b50311d08 |
| current-390.png | 390×1000 | a9c61633933a40e83c4c0c325e110468d764191a9909c14fc17b3f6ad39db491 |
| historical-detail-1440.png | 1440×1000 | f7885ac55a4eb006f25016e15fe7104279ea942971c365473ba9e7035cb1b027 |
| historical-detail-390.png | 390×1000 | e20dce6e4a35d3099a5711702662771df3f267c6bf7b6c0f59c12988c63ae766 |

V2局部交互记录server-garment-shipment-section.json引用D147/Gate0的已批准Server化/成衣出货范围；没有改导航、框架或全局密度。旧254证据、53能力和全部原PNG保留，后续只前向增加本工程记录。

## 交付及剩余边界

GitHub main在本阶段独立API核实996；Gate7B精确38499498068acc31f2d1b7e76ca2f27572721bf4的Source39644366031、Team39644375067、Baseline39644382880均终态success，**不是本Gate7C的CI**。

此前一次push仍为exit1/STOP_AUTH_OR_DIVERGENCE，尽管384代码经独立API exact；根因unknown，不因只读TLS正常宣称写通道恢复。当前Gate7C只本地checkpoint，无新远端写入/PR/CI，按Gate0不创建重复累计业务PR。最后精确HEAD守卫、清单绑定与未来交付另记阶段任务，不把未完成步骤预写PASS。

真实C1/C0/C1新增额度已询问但未收到答复；旧D1933/D1935额度不能复用，未读私密候选或凭据。本次Num/outdate业务确认不扩大读取、绑定或激活许可。正式收集器/失败操作记录、全量过滤/分页证据、跨次稳定事件/取消及财务采用仍分别交付。

3001/50426/59069/62426、其他受保护端口/卷/账号/Browser和工作树均未启动、停用、升级或清理。没有真实数据迁移、部署宁波/18443/18444、自动合并或关账。完整Goal继续active；关账三项原业务待决仍保留，不默认同意或反复询问。
