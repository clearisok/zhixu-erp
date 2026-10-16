# Gate5 既有页面分支的独立交付收口

核实日期2026-10-16；main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。Phase baseline：原worktree内 `feat/material-sort-and-event-drawer@c54a2234cfe7920ff4023d9cab56345bde455a7a`，开始时干净，见本机忽略的outputs/gate5-delivery-baseline-20261016.json。不新建工作树、不重写原提交、不重复PR；源码/基线/CI/授权或人工验收变化时更新，GitHub是实时事实源。

## 已确认范围与问题

已有用户批准的页头小返回箭头、业务/工厂款号、去重复说明、面料显示排序、团队辅料关键词设置、颜色规格展开、事件侧栏、多余仓独立列均保留，数量/单位/事件身份/采购价/齐套计算不变。Quote保存后退出重试与D130更强准备恢复保留。原工程证据及截图保持各自完整SHA，不覆盖旧hash。

PR113精确f9f22f0d已交付且三CI绿，含本页面分支之后的财务存储/面板/受控采集依赖；不能拿它替代本分支的独立交付。本分支仅到0024，尚无0025财务快照，事件中的对账保持未接通，不假造金额、付款或跨报表物料匹配。

已有累计分支的Hosted CI实证暴露两个问题：升级测试预期停在0023，及登录测试寻找旧“退出Server”按钮。本分支同样存在这两处遗漏。设置客户端/后端与物料显示浏览器测试已本地完成，却未全部纳入Source CI；物料浏览器验收要求完整源码SHA，CI还需显式传github.sha，避免构建自动推断短SHA。

## 本轮仅测试、CI与文档修改

- 显式审定当前23个SQL文件（1–12、14–24，13原本保留未发布）。新建和升级断言共用此固定清单，仍逐项比较文件名/顺序，数据、权限、历史、幂等和空账本断言不减。没有根据实际目录动态生成预期，也没有改SQL或生产migrator。
- 登录测试走既有用户菜单→退出登录，继续验证退出失败后重试和会话恢复。
- Source CI补入设置客户端/后端及既有物料显示浏览器回归；显式github.sha只标记测试构建来源，不改变authority、默认能力、路由或真实Source。
- 精确构建元数据影响记录见docs/release/ci-build-impact/gate5-exact-source.md。没有改app/components/features生产文件，无新UI设计或像素批准声明。

## 依赖与当前验收

G1–G4原始最新提交7ef6e665/e3cebb48/4da3590b/4c59d974均保留为祖先。#109–#112均已在这些精确head三CI通过并完成COMMENT复审；它们尚未合并，不用其CI代替本候选结果。独立页面PR须精确送达后唯一创建为草稿，披露未进入main的依赖，不自动合并。

本Phase已实际通过：升级/设置94项、完整PostgreSQL261项、发布基线94项、TypeScript类型、全发布源码lint及main精确守卫（11页/35能力/53继承UI路径）。日志为本机忽略的outputs/gate5-delivery-upgrade-regression-20261016.log、gate5-delivery-postgres-20261016.log、gate5-delivery-baseline-20261016.log、gate5-delivery-type-20261016.log、gate5-delivery-lint-20261016.log和gate5-delivery-guard-20261016.log。原c54工程的17设置/客户端、33浏览器、root898与两authority构建仍只证明其原时点；本Phase最终完整SHA构建、登录/物料浏览器和Hosted CI须继续独立核实，不预填通过。

第一候选b9a1251059931a748d7830b7b8f4f23c97dbf6f5的Server编译和完整SHA UI构建build20261016-102701通过。浏览器18/19：登录全部9项子断言及物料全部8项子断言通过，但登录父用例在Windows临时profile的Cookies文件删除时EBUSY失败；原失败日志保留。收尾修复只等待该测试拥有的Chromium子进程close（上限3秒），并为已验证属于临时根目录且有专用前缀的目录执行有界删除重试；不杀用户浏览器、不减业务断言、不改页面。新候选仍须实际重验，不能将18/19称PASS。

修复源码d0146e4beac4b647b171f01cd92d2913f227295c/clean的完整SHA Server UI构建build20261016-103022、登录/物料19/19、cleanup定向lint、重新执行基线94/94及精确main守卫全部通过。构建为quote/master server、session、writable、orderRead snapshot，仅隔离fixture使用。日志outputs/gate5-delivery-repaired-{ui-build,browser,baseline,guard}-20261016.log与gate5-delivery-cleanup-lint-20261016.log；没有更新冻结PNG/receipt或宣称新人工像素验收。其后的提交仅登记这些结果，实际送达head/Hosted CI以唯一草稿PR核实，不拿旧CI代替。

## 决定、建议与待确认

用户批准D121/D133/D134页面与业务规则，并批准持续分Gate工程交付；本轮沿用这些决定。AI技术建议是先按#109→#110→#111→#112收口，再对齐页面PR和#113，避免直接合并累计大分支。新像素人工验收及具体Source/写入/启用许可仍分别待确认。2026-10-16用户另行批准的一次财务两合同只读核验已在独立Source工作树通过：12/9行、两遍一致、1次登录加4次报表；这不使本分支获得0025、财务面板或持续采集能力，来源字段映射仍未整体验收。

本分支所有测试仅合成账号、工具自建随机tmpfs PG和新临时浏览器；不包含上游读取或凭据访问。前述另获授权的Source私密进程自行消费本机凭据，Codex只核对脱敏结果及受保护报告，凭据不进入聊天或Git。真实账号/业务库、Source首绑/激活/续期、四单过期窗口、宁波/18443/18444与部署均未操作，不自动合并。
