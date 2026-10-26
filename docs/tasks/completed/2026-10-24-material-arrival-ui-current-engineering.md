# 当前 Server 物料分批到料与逐批物流工程证据

2026-10-24；产品源码 `a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad`，tree `6892e1848d6892316eb57b4491b5c39da7b07d2c`；比较main `e01a11952b648024c0bd6bf4259de429374981e2`。只证明该源码的一次性合成工程结果，不等于合并、部署、Source激活或用户接受。

## 受控范围与修复

从clean557ce的0039后台继续，原689afa→f287仅15产品/测试/package路径：14输入一致、package手工追加；随后窄取61e9/a290/14a三个状态hunk，并复用14a→72d0原子activation测试，额外order-material-summary仅暴露完成信号。source共25路径，不整体导入旧分支/清单或旧QA。0034–0039、store PG字节保护和Source reader原样保留。

原卡片、分批Modal和历史Drawer接通独立Server owner；Source/人工预计到已存Hub/Actual分别展示。每批复用唯一物流算法和最早未取消排单采用地点，缺失/停用/歧义明确提示，不猜默认仓、不搬旧计划、不改单位/金额/排单或实际产出。请求先写读回actor/tab临时槽再POST，known同身份/摘要才释放，unknown/pending只核对，明确原ID重发；来源失败保留计划与锚定历史。

四项P2在冻结前修复：loading期间禁止旧scope入口；同步inFlight防双击抢lease；来源自动完成后重读、暂停旧建议并保留草稿；客户端1000颜色硬限与合法后台事实冲突。后者实际工作态red1fail8500ms（1001 read旧array分支），仅两处颜色数组上限对齐已有1MiB响应后green1/1 8964ms；新冻结97集合再次包含1001实际HTTP保存/回执/读取/历史，以及1200来源可读/preview后known422/replay、零新业务残留。8192/24576 SQL限制未放宽。

## 精确源码、驱动与检查

产品archive SHA256 `65ee4546cc20e65b171fbf585ec51e2596dd9b261c34c565d2108ae8ce3daa24`，canonical context `C:\Users\Administrator\AppData\Local\Temp\zhixu-material-arrival-ui-nzr4si\context`。before本轮实际Chromium读取已批准e2cf旧产物（10:06:22Z build），有full SHA与before-only路径保护；不伪称重建旧产物。

初次after16/16实际通过27377ms，日志另存after-initial16；为补真实浏览器触摸而非仅mobile metrics，测试专用checkpoint `abf3bf774124934b9372586d079308a120d6980d` 仅driver和两状态文档。driver archive SHA256 `314592182747b0b0c0f8a65121dca8f7d18bf20983ee8d1cf3bcd52037c58be8`，context `C:\Users\Administrator\AppData\Local\Temp\zhixu-material-arrival-ui-touch-OneYeO\context`；复制未变a0c3 Server产物，定向lint PASS3644ms，after17实际重跑，其余成功未变范围复用，不冒称全部重跑。

| 检查 | 结果 | 进程耗时 |
| --- | --- | --- |
| typecheck | PASS | 21953ms |
| server-compile | PASS | 10313ms |
| compiled-app-load | PASS | 1409ms |
| lint | PASS | 37830ms |
| root-nonrelease | 811/811 | 17692ms |
| arrival-ui-and-regression-api | 97/97 | 112321ms |
| before-ui | 3/3 | 13403ms |
| after-ui | 17/17 | 28256ms |
| material-display-ui-regression | 10/10 | 19190ms |
| navigation-ui-regression | 18/18 | 19592ms |
| browser-build | PASS | 11073ms |
| browser-artifact | PASS | 2737ms |
| server-build | PASS | 10181ms |
| server-artifact | PASS | 2587ms |

所有上表结果0fail/cancel/skip，测试计数包含父节点。14个相关文件97项与97个根文件811项为本次实际执行；before3＋after17＋物料显示10＋导航18共48项浏览器。初16不是额外独立能力，不加到48中。与后续发布134分阶段记录，不预写其PASS。旧Source Linux专用CLI在Windows跳过的覆盖仍待后续必要Linux CI，不因当前97无skip而冒称关闭。

双模式各45静态页/1fallback/114assets；Server零产物警告，Browser仍有既有users模块preload提示1（具体新hash见browser-artifact.log），非新增路由/权限/运行态通过。没有安装新依赖或访问旧目标。

## 浏览器与视觉

六宽度1920/1536/1440/1280/900/390；1536按DPR1.25，390按mobile metrics。每宽实测Modal边界、文档无横向溢出、footer可见，历史Drawer边界和表格本地滚动；JSON保留before6条几何、after6条Modal几何及1条独立触摸记录。390额外通过CDP touchStart/touchEnd实际打开/关闭历史，目标可见、无业务写入且版本不变；这是浏览器模拟，不称真实手机人工验收。

before2PNG/1JSON、after16PNG/2JSON共21新资产；root实际view_image查看其中8张（before桌面/手机及最终driver的桌面/手机计划、历史、触摸历史和来源变化警告），未发现布局阻断。不是用户人工认可，不覆盖所有像素。

实际覆盖缺Hub、精确多单位部分安排、双击单写、dirty导航、自动Source更新保留草稿/暂停建议、同HTTP错误的完成信号、加载中readonly原子入口、lost reply刷新核对/mismatch保留、unknown原UUID重试、Drawer关闭与A→B→A晚200/401、Source失败保存/历史/明确清空、readonly和Browser/商业端点隔离。

## 交付与边界

所有账号/订单/Source样本/排单/Hub/历史位于自有随机一次性PG、loopback与私有Chromium。新driver确认自有进程退出后才删profile；不探测或终止用户浏览器。没有真实Source读取、凭据、账号/业务DB/卷、绑定/激活/调度或目标升级。3001/50426/59069/62426、Browser业务存储、备份及旧结果保持。

NETWORK_DEGRADED，本阶段push0/新PR0/Actions0，无自动merge/close/deploy。Goal仍active；0040/41出货、0042交期、关账与环境替换另行验收。发布134、最终clean精确main守卫及最终复审随后单独记录；本报告不预判。

## 资产清单

- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/before-before-material-1440.png` SHA256 `d5034265c862c8b117570f0ae8e5cf87f43f7fbeed6fbbcfa1b100f9704155a2`；rendered e2cf2bb4397a656b58cfab8388049bd84559527e；1440×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/before-before-material-390.png` SHA256 `a417ed356270b26f66664ef3f60ba4ce32f58c7173c71389dc80834b503c4660`；rendered e2cf2bb4397a656b58cfab8388049bd84559527e；390×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/before-build-and-checks.json` SHA256 `43efcffa6ad291f1a4576a4437d871bda3a3c400195a608e7f06ca80e0e147db`；rendered e2cf2bb4397a656b58cfab8388049bd84559527e
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-build-and-checks.json` SHA256 `f98f554481bf5003e4c67f829b43f2a2758de80b75e85f2d2abbdcbbb3e03895`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-draft-source-changed.png` SHA256 `47a5b7541d6ff0e57b5ae743ce4f63ac5b59f788f1656675ad4cb0a07abc88bc`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；764×485
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-explicit-clear-history.png` SHA256 `8731b2189f3341445b5f5798f5464c1a2cf79b8a1128c848aba85c05d18e1587`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1440×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-history-1280.png` SHA256 `0ca80a60195cf92d846d03d648c0a3ca54b9ef3c03b39545108b93296deef5b1`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1280×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-history-1440.png` SHA256 `70a3e4840324c44e1e84cd856345339c6fa1c2a1e4729607c4bc3bb68d388cdb`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1440×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-history-1536.png` SHA256 `851ab2fc49642d2cb7abd07b78577c330a29205f0d35c98bac4c2b287364a574`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1920×1250
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-history-1920.png` SHA256 `e7a92b5c22ac135cd1eca6b0249350c397abfdee53988c545f7dff294a5b0f17`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1920×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-history-390.png` SHA256 `0452feef80d358a99f2f826dafc248e139f1ac0ba4b51d67171b6b3689e40d2d`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；390×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-history-900.png` SHA256 `47cca5c8723bc98683b06388b53c090a7d1dc2fe835254e2d81c1c577058be4c`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；900×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-planner-1280.png` SHA256 `dd9ea3bfb30d201e7b49c53fdd10c7a2cb7672bffa3801b1728ebabf447917a8`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1280×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-planner-1440.png` SHA256 `63ef674647120b70cdeb83608d0181072712df59473d642f291d9c1012b58c7e`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1440×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-planner-1536.png` SHA256 `48797ca17216614c87a2d7769b2f05c28614bec6395085123b19a4651c056a3c`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1920×1250
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-planner-1920.png` SHA256 `5732bb0be1e59f0f8331b4c1998f39bbbe5d350e9f9620e8c014bb69446eb493`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1920×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-planner-390.png` SHA256 `dc27d313b487f191016192831857e2a150dc1f94cfa262746b63d363b9c3c51f`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；390×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-planner-900.png` SHA256 `cb8d97d806f2f6dfa7790fcea455a55caae14d57a719024fd647165fde790c14`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；900×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-receipt.json` SHA256 `01a60c8534e27a85096f2cfd6633a79aed7d7c776f64d46f0790dd51a0f65fc3`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-source-unavailable-history.png` SHA256 `973b96bd92f39479fb27d5586a0f36f969434964265a612d2fcb2198c4429337`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；1440×1000
- `docs/tasks/completed/evidence/2026-10-24-material-arrival-ui-current/after-touch-history-390.png` SHA256 `003079a96f955b6739de7ce436d71eac76f05a90081dcd82730f613979f98a0e`；rendered a0c3d164265aa4cdc79dc5d8676d9f0559eb8fad；390×1000
