# Server收敛：正式构建的产物完整性门禁

2026-10-23，D147/G3既有工程范围。root唯一writer，原独立审查者只读。
原G1–G5仍active；本阶段不修改业务、页面、框架、数据库、Source、环境或部署。

## 问题与基线

已有[组合工程记录](../completed/2026-10-23-final-pr-combination-engineering.md)第42行
证明短路径下Provider上下文分裂时，vinext build返回0但45路由预渲染失败。
此前长路径对照修复了验收运行条件，没有给正式`npm run build`增加失败门禁。
实际package.json仅运行vinext；Dockerfile.server、CI和正式脚本沿用此命令。
本片只在原构建成功返回后核对产物，不改框架实现、不以旧构建冒充新构建。

main已独立核实为d1dd4f0fcf9992d5c055c7b67b6832b635485680。
从该main新建codex/build-artifact-completeness，明确FF已验收的Goal依赖
f4f8f61e7535bd678f8dfcf3e22143747b6e03c1；baseline clean，原分支/提交保留。
此前STOP_AUTH_OR_DIVERGENCE与独立远端精确送达两事实仍保留；本片不重推旧SHA。

## 最小实现

- 正式build先原vinext build，再原目录只读产物检查，检查失败时整个命令非零。
- 从当前app静态page文件推导路由，支持普通目录/route group，不硬编码46。
  当前output:export、App Router、trailingSlash=false契约保持；新动态/parallel规则
  必须显式评审，不能悄悄省略。private目录不作为路由。
- 原vinext-prerender索引中每个当前页面和404必须唯一且rendered；缺失、skipped、
  error或不明路由均失败，即使磁盘残留旧HTML/RSC也不放行。
- HTML/RSC、404、Vite清单及其chunk/css/asset依赖必须实际存在且非空；检查
  路径和大小有界，不读取框架私密server配置、不写产物或重试构建。
- client/server公开build-info必须一致，并匹配本次authority、identity、orderRead、
  显式源码/ID/time及默认Git身份。成功只说明静态构建产物完整，不代表Provider、
  浏览器行为、API、数据库、Source、部署或用户接受都已验证。
- package.json是本次唯一构建接线变化，原Docker/CI自动沿用，不改检查名或测试范围。
  V0精确路径记录描述无可见UI变化；不引入V2/V3设计或覆盖截图。

## 验证及资源边界

使用自有合成目录覆盖不完整/残留产物、缺页、跳过、错误、缺chunk、身份漂移和真实CLI
非零；不复跑已通过的数据库、恢复或未变业务套件。首次9/9合成检查通过；首次scoped
lint仅因未用import失败，原日志保留；移除import并固定CLI夹具完整环境后，9/9定向
与scoped lint均通过，0失败/取消/跳过。真实构建和最终复审尚待，不扩大通过范围。
随后补CLI目录别名负控。独立P2指出vinext子进程先加载production dotenv，父shell的
默认期望会误拒合法Server构建；现复用锁定框架同一个loadDotenv及优先级/展开，在env
副本中解析，只投影公开字段、不改变父环境或输出其他键。补dotenv-only、shell覆盖及
身份漂移后12/12与scoped lint通过；独立复核P2已闭合，无新增P1/P2，未读真实.env。
实际Browser及Server构建各使用新自有规范长路径上下文和既有依赖，不安装依赖、
覆盖旧dist或重建Docker镜像；最终结果按实际source/日志补充，不预报。

## 2026-10-24续：真实失败与非执行预加载边界

干净ca9174c2abe125c03904f4af060c13f14c2fd45b在新规范路径archive实际执行正式
Browser build：vinext完整rendered46页、0skip，但新门禁以missing_or_invalid_file非零。
按fail-fast未启动Server构建，不能称双模式通过。原context、日志及actual-builds.json
保存在ignored outputs/server-build-artifact-guard-20261023，原失败不覆盖。

唯一缺文件是users HTML的link rel=modulepreload所指admin-settings-PIGc8ys0.js；
实际manifest仅保留admin-settings-BGl_0nf5.css，CSS和页面执行JS均在。
锁定plugin-rsc先保存chunk依赖，Vite后删除纯CSS的JS空壳，SSR仍由旧依赖生成预加载。
独立只读复审核实此链，未证明缺少运行JS；没有有据的小范围配置修复。
不造空JS、不移除CSS、不修改框架，原预加载404仍是已知问题，未做浏览器修复验收。

门禁范围明确为必需静态产物：只有属性解析确认的link rel=modulepreload、未被manifest
声明、文件确实不存在的href可报告unresolved_modulepreload warning。相同URL作为
script、stylesheet或manifest依赖时仍FAIL；data-rel、title中的文本、混合/重复rel
不能冒充。每份PASS摘要包含warningCount/warnings，不宣称零404；未来其他未解析提示
不得自动归因为CSS-only。原缺页/依赖/身份保护不降级。

首轮13/13/scoped lint通过；独立复审另发现HTML属性中合法的引号内大于号会截断
标签、漏查后续src/href的P2。现分词保留完整单/双引号内容，补script/stylesheet负控及
预加载正控，14/14定向与scoped lint通过，0失败/取消/跳过。先前日志保留，新日志另存
unit-quoted-tag.log和lint-quoted-tag.log。新source两模式实际构建、
最终发布门禁及独立复审仍待，不借用ca917的失败或前f4f成功冒充。

#123@cb1658的验证是独立对象：team39978341735、baseline39979177113、source39979170713
三次workflow_dispatch已success。但官方及实际API确认手动事件不满足PR required checks，
PR仍显示旧pull_request计费失败，不能称PR全绿或可合并。这次事件选择未达到补齐PR检查
的目的，保留结果但不冒充所需检查。为避免本轮再重复付费，不立即重跑整套；真正准备
合并时必须在正确PR事件补必要检查，不能伪造状态、删旧记录或降低保护。
这些CI不验证本片尚未交付的新门禁。其他PR不运行；本片本地优先、不另派Hosted CI。

原环境、3001、50426及其他入口、现有账号、业务库、179旧卷和备份保持。
不自动merge/close、正式部署、Source读取/激活/调度、退役或默认关账待决。
