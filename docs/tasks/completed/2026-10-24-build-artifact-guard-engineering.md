# 正式构建产物门禁：隔离工程证据

2026-10-24北京时间。main基线d1dd4f0fcf9992d5c055c7b67b6832b635485680；
本次只读GitHub API重新核实相同。完整G1–G5未完成，不代表合并、部署或人工接受。

## 实际来源及结果

- 分支codex/build-artifact-completeness；已测试干净源
  c721821b3004521f08891a63d002354cf5f2e03b，tree
  166cd9e6ff11adf7f1fa530b22e9792f1fbef1e7。
- 从Git archive新建规范长路径上下文，archive SHA256
  cb9c27eeeb3cd601239b042f4588c6cb97f36b167478db880572ae954c63bee6。
  原依赖junction复用，不安装、覆盖旧dist或触碰Docker/数据库/Source。
- Browser正式npm run build：2026-10-23T16:18:22.175Z–16:18:35.422Z，exit0；
  45静态页面+1回退页、116必需资源通过。公开构建身份精确c721，1条显式warning。
- Server正式npm run build：16:18:40.412Z–16:18:53.187Z，exit0；
  同样45+1/116，0warning。公开Server/session/snapshot及build ID/time仅由合成
  .env.production提供，不借用shell同名键，覆盖独立P2的真实构建输入场景。
- driver末尾HEAD未变、git status为空，双模式总结果PASS。原上下文保留于
  C:/Users/Administrator/AppData/Local/Temp/zhixu-build-guard-lciuzj。
- tests/build-artifacts.test.mjs定向15/15，0失败/取消/跳过，3821.2577ms；scoped lint exit0。
  该路径已进入现有npm test根glob，无workflow修改或新增付费运行。

## 保护及已知问题

门禁在原vinext build成功后校验源静态路由、rendered索引、HTML/RSC、404、Vite依赖
与双侧公开build-info，不硬编码46；缺页/skip/error/残留不完整产物、缺必需依赖和身份
漂移都非零。原CLI别名保护、同一锁定production dotenv实现、私密错误过滤均有反例。

Browser的唯一warning：/system-settings/users预加载assets/admin-settings-PIGc8ys0.js。
plugin-rsc先保存依赖，Vite后删除纯CSS的JS空壳，实际CSS及执行JS均存在。此处只将
非manifest的link modulepreload缺文件显式报告，不造空JS、不修改框架，不宣称404已修；
相同URL若用于script/stylesheet或manifest必需依赖仍失败。未来其他warning未核实前
只称未解析，不能一概归因于CSS-only。

默认404只接受框架精确文本Not Found或完整HTML；缺失/空/任意截断不放行。
属性分词识别完整单/双引号，不能通过title内大于号或data-rel/混合/重复rel绕过。

原ca917 Browser门禁missing_or_invalid_file、9f79 Browser invalid_html均保留，
均在完整46路由后失败，Server未运行；不删除失败或改写为PASS。
9f79保存产物的新checker只读兼容PASS不算新构建。本次c721双构建才是新source真实证据。
dotenv及分词P2已独立复核闭合，最后精确404例外也无P1/P2；最终全diff复审另记。

本片不重跑原954业务、PG、恢复或像素验收；它们的既有source/结果不变，也不验证本片。
必要发布基线守卫/134回归仍待收口，不能以这里的15或双构建替代。

## 可核对证据

ignored目录outputs/server-build-artifact-guard-20261023，原文件及失败context保留：

| 路径（相对该目录） | 原始字节SHA256 |
| --- | --- |
| unit-root-entry.log | 8da36004291afeb6c01b81f392f8e5a7fd365f8e3ba43b537e7bff306a50830f |
| lint-root-entry.log | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| final-c721821b/browser-actual-build.log | a02e0051a0148919b71e50d1fb167531a957ddb8566ea6461548de1c1312016b |
| final-c721821b/server-actual-build.log | d5cba3bb26c6f282e980569a64a1e59ebdbfeea34bbed03e930ee72e780d7955 |
| final-c721821b/actual-builds.json | e36a9ac0203c9d741b7cb7d6d041436df969729520030f3bd11c7613548e3f62 |

## CI与运行边界

#123@cb1658三次手动验证成功不满足PR必需检查，PR仍旧计费失败；这些CI不覆盖新门禁。
本片没有再启动Hosted CI，没有改workflow、检查名、保护或测试门槛。正确PR事件的必要
合并检查留到实际合并点，不批量重跑旧PR。

前f4f工具STOP_AUTH_OR_DIVERGENCE及独立API精确送达两事实保留，不重推旧SHA、不改认证。
本片当前只本地checkpoint，未送达/新建PR，不冒充远端PASS。旧refs、3001及其他入口、
业务库/账号、Browser数据、卷和备份均未修改。无真实采集、target激活/调度、运行切换、
部署、退役、merge或close。

## 收口续记（保留上文发生时状态）

388560首次精确守卫只拒多余的本片UI记录：原分类器不把package.json后置工具门禁
当作UI编译输入，build-pipeline也不是登记页。被拒原文移至同目录
2026-10-24-build-artifact-initial-ui-record.json，迁移前后Git blob同为
77729df6c3e85044745ff20a27dc4aa104939747；不改分类器、页清单或原87个UI输入。
首轮前置FAIL后134未启动，原日志保留，不改写为通过。

随后干净ef08dee1e83e87b7b7fbd6690d890210acab75aa：

- 精确d1dd守卫PASS：11页/59能力/87变动UI输入、errors空。
- 发布134/134、0失败/取消/跳过，333821.0794ms；只运行这一份完整回归。
- 开始/终态HEAD、manifest SHA256及clean完全相同；相对c721的package/checker/test代码
  diff为空。未重跑双构建、15项或旧业务/数据库/恢复。
- 全diff独立审查、错误记录分类复核均无剩余P1/P2，只读审查没有自行运行测试。
- ignored release-result-ef08dee1.json保存完整终态，原守卫日志SHA256为
  f11e22777ee48a2d4a22ee7571dbfe5ec0bc88928b4838fa1d5e0919f00e83ac，
  134日志为515cdc1388e8d685443c2f5bb06b31365fe96a45e4f86db9b885afce2f2589b2。

之后只允许状态文档收口，最终提交仍须精确d1dd守卫和既有交付协议核实。
新分支仅验证引用，不新建累计业务PR；只有直接Git只读预检READY_DRY_RUN/NORMAL、
身份/祖先/clean通过，才一次首交付。新STOP即停、独立核实，不重推旧F或换认证。
这不是新Hosted CI授权使用计划，不刷新#123旧失败状态，不代表永久网络恢复。
