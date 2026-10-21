# Gate7B：成衣6086979合同过滤核验工具

2026-10-22；root唯一writer、既有reviewer只读。上一Goal轮次为progress：Gate7A后台、三CI及文档交付完成，最终acfed2d091297c9fb587680a29ca6932892fa8ea远端精确/工作树干净；不把完整Goal缩为该切片。

## 基线与范围

- 独立API核实main仍996dfedc12da3527343cd3ff2aa5eea35497e10e，开放草稿#120–127均保持原head。新分支codex/garment-contract-filter-verification从该main建立，再仅FF至完整acfed输入，保留原始提交。
- 原三份根文档逐字节保存在../completed/2026-10-22-garment-filter-inputs/acfed2d0/。无继承dirty，其他工作树/运行环境不动。
- 本阶段准备独立、默认不执行的只读工具；不做正式收集器/target激活、DB写入、页面或关账。D152/153及全部已有业务/金额规则保持。
- 新真实读取尚未授权；D1933/D1935单次额度已用完。工具测试只用合成输入，不读取已有凭据、受保护原文或真实Source。

## 核验设计

真正执行前另有固定范围授权。候选身份只从已冻结D1933私密报告的精确hash提取；不接受任意合同/报表/页码参数。复用原可信origin/传输政策、stdin凭据、受保护报告目录与只读transport，无Catalog注册、Bridge/自动调度或HTTP写入口。

请求顺序固定：合同C1首页100行 → 固定虚拟合同对照首页 → 同合同C1首页复读。最多一次登录、三次6086979报表、每报表4MiB/报表累计12MiB、登录另4MiB、180秒、无重试或翻页。C1两遍必须非空、reportedTotal<=100且整页完整、每行精确合同、原样保留数值并一致；对照必须零行。超过首页范围就明确停止，不能宣称完整分页或扩大许可。

该证明仅约束当次账号、指定合同、明确is查询及完整首页两遍，不证明全账号/历史取消/稳定事件/所有合同；校准证据不等于来源激活或业务快照。Num/outdate口径不再询问或改写。

## 验收及交付

检查完整请求队列、请求/字节/时间上限、无网络重试、错误安全分类、账号/合同/报表/字段/元信息/页号/总数/重复/精度/两遍变化/空对照、私密文件hash/ACL/符号链接、真实子进程边界及未知结果。只在自有合成临时文件中验证；不碰现有DB、3001/50426/59069/62426、18443/18444或Browser。

实现前必须读实际probe、lossless解析、private IO/PS wrapper和对应测试，不复制第二套来源/业务价格系统。完成后定向/Python/类型/lint/相关回归、精确main守卫及独立复审；每重要Gate独立commit，送达/CI另核实。沿用Gate0只交付验证引用，不新建累计PR或自动合并部署。完整Goal继续，三个关账业务待决项仍待原问题回复。

## 本地实现与首轮复核

- 初始文档baseline为0e4c519e7392c2443c5bebb7551af0c81701bcff，工作树干净；本阶段仅下列工具/测试/文档增量，没有继承dirty。
- 新增固定诊断Node/Python/Windows launcher；复用payment-private-files的打开前后ACL/owner/inode/size/hash检查、原私密writer和BoundedPaymentTransport。不新增表/API/Catalog/默认开关/业务UI或价格系统。共享exact-source-json只前向提取payment既有reviver，payment原解析语义保持。
- Node13/13、Python全套162/162、原payment合同19/19已实际通过；含原生数字、GBK实际worker→Node、产品CLI候选失败先于凭据与自有合成entry的真实launcher成功私密落盘/ACL/hash。Python另直接运行有界Transport配内存HTTP stub，核实1GET/3POST顺序、4MiB读取上限与失败锁闭。不是执行了冻结真实候选，也不是端到端真实采集PASS。
- 首轮typecheck为fail函数局部narrowing报错，改函数声明后通过；Server编译发现ES2022不支持toSorted，改拷贝数组sort后通过；lint首轮发现测试局部module名称，已改名，完整复验仍在收口。没有放宽类型/ES配置或跳过检查。
- 独立只读review发现普通括号文本被误当JSON(P2)，已补Node/Python正例/嵌套重复键与秘密负例并修复；最终静态复审无新阻断（reviewer未重跑测试或读取真实数据）。12MiB口径已澄清为三份报表累计，登录响应另4MiB。
- 初次项目901/910及发布90/99中的9失败均为EVIDENCE_WORKTREE_DRIFT：本阶段临时给已冻结D153添加技术进度。该行完全移回本任务/feature，DECISION_LOG恢复与原blob一致，没有业务/架构新决定或历史hash变动。原失败日志保留，正在重复完整检查，不把原失败冒称PASS。
- 完整项目、发布116及最终类型/lint/构建/精确HEAD守卫、commit/远端/CI结果继续下段追加；此处不先报远端PASS。
