# PR178 局部优化 Demo（P1–P4）

本机入口：[6233-937](http://127.0.0.1:5177/order-center/server-detail?id=02b75c2f-8dc1-414a-bfc5-3411bc636072)。最终页面实际构建c856f35f1caa073c829976c829513f6e941d44df，后续证据/文档不改变该渲染源码。旧[运行指南](order-workbench-demo-2026-11-27.md)原日期保留；本文件前向替代其构建及本轮验收部分。

本次没有PR Preview/部署。入口需本机进程运行，使用现有SSH别名weaveops及已运行应用zhixu-quote-trial-i174-v2b-app-1的正常认证GET。凭据/session只在远端进程内存，不输出/落盘。浏览器非GET在本机403，原真实保存流程用独立合成库验证；不要把只读Demo不能保存当作原业务能力删除。

关闭后，在本分支工作树PowerShell运行（已有依赖及SSH访问）：

```powershell
$env:NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY='server'
$env:NEXT_PUBLIC_ZHIXU_IDENTITY_MODE='session'
$env:NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY='server'
$env:NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE='writable'
$env:NEXT_PUBLIC_ZHIXU_ORDER_READ='snapshot'
$env:ZHIXU_GIT_COMMIT=(git rev-parse HEAD).Trim()
$env:ZHIXU_BUILD_ID='order-workbench-'+$env:ZHIXU_GIT_COMMIT.Substring(0,8)
npm run build
npx tsx scripts/order-workbench-readonly-demo.ts --ssh weaveops --container zhixu-quote-trial-i174-v2b-app-1 --port 5177 --static dist/client
```

源应用不存在或GET失败时保留待核对，不恢复数据库/启动采集器/修改远端配置。关闭本地进程即可停止Demo。

体验：桌面关注行；无重复说明的交付计划及重新读取；物料16/15/12项（来源超过时限时明确上次来源），未知齐套率；展开上次来源10项待入库及单位；查看物料跟进/历史；手机自然换行与物料定位；原维护、三页签、颜色矩阵、价格历史及技术详情。仅自购项进入摘要，记录存在不表示完成。具体接口时点与[本轮工程截图](../../release/evidence/order-workbench-refinement-20261127/engineering.md)分开记录；人工验收、合并及部署待用户。
