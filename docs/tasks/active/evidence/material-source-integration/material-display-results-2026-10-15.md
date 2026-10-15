# G5 B2 团队物料排序与事件侧栏：本地验收与复审

核实2026-10-15；GitHub main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5；独立分支feat/material-sort-and-event-drawer，在既有order-effective-attribution工作树继续，起点num_dyc aab97cb8fc5f85dba6c24ccb9cea1dd3f779f228/clean。GitHub实时main已独立API读得同一SHA；开放PR搜索返回108、109、110、111、112。单PR metadata端点一度404，因此本报告不冒称再次核实其最新head/mergeability。未推送B2、未创建B2 PR或Hosted CI，未合并部署。

## 已确认实现

- 面料在前，按每组需求数值排序；这只是临时显示排名，不存储跨单位总量，不改变需求、采购、入库、出运、出库或齐套。辅料按团队关键词第一个字面包含匹配，未命中和同优先稳定保留Projection顺序。
- 系统设置→进度设置→辅料排列；物料页入口在刷新来源左边，手机也可见。管理员和物控维护，七角色共享读取；最多50项、每项40字符，NFKC/trim，拒绝空白/控制字符/重复。
- 0024仅新增空团队设置、不可变actor请求回执和精确preset权限；真实账号/成员关系/业务资料未操作。GET不隐式建配置，不用Browser长期存储。PUT可信session、Origin、16KiB边界、数据库fresh权限、版本CAS、请求幂等和同事务OperationLog。
- 失败/丢响应锁输入，用原请求重试；冲突保留用户输入并显式重读，不静默覆盖。撤权后旧页面也不能写。导航/退出与beforeunload保未保存输入；全局配置更新不覆盖当前dirty输入。
- 箭头只展开颜色/规格表格；右侧Foundation Drawer分别看采购、入库、出运、出库、对账。事件从最新DTO按既有组/需求/事件身份读取，Source失败清旧事实，恢复不自动弹旧侧栏。重复事件和356既有归并算法未改。
- 多余仓沿D133：入库31与额外1分别展示，来源变化1→2→缺失→0替换旧值；旧DTO缺该字段仍未知。理论与实际采购独立，单位冲突不拼总数。对账目前明确未接通，不伪造金额或认定银行付款。
- 新设置页面仅在显式Server snapshot候选中可进，旧Browser菜单不展示。生产/关账等未批准路由仍关闭。

代码证据：features/style-progress/model/material-display-order.ts、server/material-progress-settings、database/migrations/0024_material_progress_settings.sql、features/style-progress/server、material-progress-settings-page.tsx、material-control-tower-read-only.tsx；精确UI影响docs/release/ui-changes/material-display-settings-events.json；批准范围material-display-approved-scope-2026-10-15.md、D134。

## 实际验证与精确范围

|检查|结果|源码/范围|
|---|---|---|
|根项目 npm test|898/898|c705dcc0dcb8f2b9dad6b7c1fbaf3f6f15554a29；包含7展示模型，正式业务源码之后仅改物料移动CSS|
|完整PostgreSQL npm run test:postgres|261/261|c705dcc0dcb8f2b9dad6b7c1fbaf3f6f15554a29；纯一次性PG16/MinIO，未连接业务库|
|设置、0023→0024升级、fresh-start、历史归属/Source历史、客户端|56/56|c705dcc0dcb8f2b9dad6b7c1fbaf3f6f15554a29；含20设置/fresh-start与4可信客户端测试，组合数量不与其他套件相加|
|持续Source回归|70PASS/1既有Windows下Linux条件SKIP|c705dcc0dcb8f2b9dad6b7c1fbaf3f6f15554a29；71项，无新增真实读取|
|独立发布/响应式负向回归|94/94|D134/清单初版范围；最终清单另跑精确守卫，不把负向回归当像素验收|
|实际Chromium最终组合|25/25|渲染b0ecbc08ecc1b8bd9266cc2da1febb3cc532e993 / build20261015-141116，脚本967deb5247823f223cd811aeb14361cab65b8fe0；其中B2为9，既有页头/退出/持续11、多余仓5|
|类型、Server编译、全项目lint|PASS / 0错误0警告|c705dcc0dcb8f2b9dad6b7c1fbaf3f6f15554a29；后续只改已验证CSS/测试/文档|
|Server session snapshot构建|PASS|b0ecbc08ecc1b8bd9266cc2da1febb3cc532e993；build20261015-141116，仅本机构建|
|默认Browser构建|PASS|c705dcc0dcb8f2b9dad6b7c1fbaf3f6f15554a29；build20261015-140939，orderRead=disabled，未实际切换任何演示|
|精确main最小源码门禁|PASS于c705dcc0dcb8f2b9dad6b7c1fbaf3f6f15554a29|11页面、34能力、53UI路径；加入本验收/截图后的最终门禁另记录|

六宽度1920/1536(DPR1.25)/1440/1280/900/390实际页面覆盖：标题/30px返回、两按钮可见及顺序、卡片颜色规格收展、侧栏边界、表格内滚动、方向键/Escape/精确焦点恢复。设置页六宽度无溢出、关键词输入可用。七角色逐账号验证同份配置；仅管理员/物控可编辑，内部CCT/Quote成本没有新请求或泄漏。未清理既有Browser数据。

新PNG：docs/tasks/assets/material-display-2026-10-15/下7张及receipt.json；7张经AI目视复核，手机设置入口已可见。图片为合成数据，未覆盖旧路径/hash；人工像素认可仍not-run，不能代替真实业务验收。UI截图固定源采购金额为fixture值，不从合成数量反推采购金额公式。

## 发现和修正（失败回执保留于本机ignored outputs）

1. 新合成行漏6087050:sha256前缀，被原Source完整性守卫拒绝；修fixture，不放宽守卫。
2. 新设置页缺manifest page id，被UI_CHANGE_PAGE阻断；新增implementation-only页面并修精确impact引用。
3. 测试选到其他卡片表格、并误以raw行顺序代替Projection顺序；改为第一卡片及初始化真实Projection顺序断言，产品不变。
4. 完整PG首轮236PASS/6FAIL：所有差异均为旧明确migration列表漏0024、权限65→66；前向维护预期后完整261通过。根首轮897/898为旧导航源码精确条件预期，保留原约束并加入受控新入口后898通过。
5. AI实际截图发现Foundation手机隐藏首个页头action；仅物料页覆盖为完整动作行，并增加真实几何可见/顺序断言，最终25通过。焦点恢复按Foundation既有下一帧行为最多1秒等待精确原按钮，不改Foundation或焦点目标；早期23PASS/2FAIL回执保留。

## 复审结论、未完成与安全边界

主执行者脱离实现步骤复读实际权限、事务、来源/单位、React scope/refresh与默认关闭路由，未发现本B2范围新增P0/P1。此为工程复审，不冒称另一人或外部独立验收。

本地工程可交付；当前不建议直接合并累计分支。必须保留108及109→110→111→112、G5 A/B1与num_dyc依赖。PR应到main并Draft、明确自有delta；依赖合并后再对齐最新main/门禁/Hosted CI并审查，不直接合入整条累计历史。真实目标、迁移、账号、Source范围和激活均需独立Gate，不能把本地PASS当上线许可。

恢复交付已按本轮用户授权对G5/num_dyc尝试，均在预检失败，实际pushes=0；只读OpenSSL对照成功也未使目标核验成功。没有改全局Git/TLS/代理或认证、关闭证书验证、反复push、用文件API伪造commit。G5 af9b746、num_dyc aab97cb8均保留精确本地checkpoint；B2最终head由后续manifest checkpoint报告。

仍需：远端交付/草稿PR/CI，依赖与合并授权；新像素人工验收；6086941独立只读来源/身份核验及财务接入。报价保存后退出失败的重试边界另作独立小修复，不夹带排序算法。本轮没有新HTTP采集或凭据读取，既有四单2小时窗口仍截止，不延长；不修改宁波、18443/18444或现有真实演示。

回退以受控构建关闭新设置写入口并保留0024/配置/请求回执为原则；不删除已有SO、来源、价格或流水，不承诺直接换旧镜像。真实升级/回退演练与人工验收须另行授权。本文件是2026-10-15知识快照；源码、main/PR、验证或授权变化时新增前向证据，GitHub仍为实时工程事实源。
