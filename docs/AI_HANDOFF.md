# 恢复点：构建完整性与PR事件边界

2026-10-24续；root唯一writer，既有reviewer只读。codex/build-artifact-completeness从actual main d1dd4f0fcf9992d5c055c7b67b6832b635485680新建，再FF明确Goal依赖f4f8f61e7535bd678f8dfcf3e22143747b6e03c1；baseline clean。完整G1–G5仍active。

本片package.json原build后强制产物检查。ca917/9f79真实Browser均46页完整，先后被CSS-only预加载及默认纯文本404拒绝，原失败保留、Server均未启动。新规则仅非manifest的link modulepreload缺文件显式warning；实际script/stylesheet/清单仍FAIL。框架默认/404精确Not Found例外，普通页面/截断不放行；dotenv、quoted >两P2均闭合，最后例外独立复审无P1/P2。tests/build-artifacts.test.mjs移入原npm test入口，15项/lint通过；新source两模式正式构建及发布门禁仍待。9f79产物只读兼容PASS不是新构建。新source先clean commit，再新自有长路径archive/原依赖各构建一次；不覆盖原失败、不安装/重建Docker/重跑旧DB。预加载404仍已知，不能说修好或零404。

#123远端CB cb1658d97485bbf6c529660fffb50215548fffcd、main未变。team39978341735、baseline39979177113、source39979170713三workflow_dispatch success，但不满足PR required checks，PR仍旧pull_request计费失败；不称PR全绿或可合并，不再派本轮付费CI。真正准备合并时使用正确PR事件。ignored outputs/pr123-merge-ci-20261023保存API、事件绑定及唯一watch证据。#121/#122是CB祖先，#124在#125，CB/CA互不包含；不重做CB未变本地测试。

前f4f原工具STOP与独立精确SHA/tree/父并存见ignored outputs/goal-next-audit-20261023-c54baa4d/final-closure.json；不重推/force/改认证。原134/9及全部旧Goal事实见[前态归档](tasks/completed/2026-10-23-build-artifact-guard-inputs/AI_HANDOFF.md)，按Git f4f逐字保存；manifest仍331/59。当前首字节比较STOP仅因checkout CRLF，必须证明Git diff空且LF规范化相等，不能忽略未知hunk。

保护所有旧环境/账号/业务库/Browser/卷/备份，3001保留；无50426切换、Source额度/target/调度/部署/退役。关账三问、coverage-v1、真实来源、多页/稳定事件和人工接受不默认、不重复询问；先完成当前构建质量缺口。
