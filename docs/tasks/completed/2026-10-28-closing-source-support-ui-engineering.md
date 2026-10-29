# 来源复核配套界面：实际工程验收

2026-10-28；输入153c04a4627f6d78febd79e153d11d7e5cc0cd38，产品checkpoint **d32912cf7483f42fd42dc28799531c0b1e7fb52d**，main基线6479a713e2b80228f008049519ebbd50d10601a8。具体用户批准见[原记录](2026-10-28-closing-support-and-pr130-approval.md)及D177。

## 已执行事实

- 整单来源复核已接在关账调整行更多/来源待复核；复用D175无金额display及原月份命令，不建立新数量账本或来源采集入口。逐色减少须显式选开放片段；新增量待分月/未分配，冻结/原价格/生产保持。
- 32项模型/draft/display/controller测试、最新非增量类型检查及相关lint通过。
- tracked源码归档3236个blob逐一核对，构建为显式Server/session/writable/snapshot；构建source为d32912cf7483f42fd42dc28799531c0b1e7fb52d。原归档受Windows CRLF影响的尝试在构建前被hash检查拒绝；仅在该子进程关闭换行转换后精确通过，未更改Git共享配置或依赖。既有依赖锁仅有CRLF字节差、规范化内容一致，无安装。
- 实际Chromium和全新owned合成PostgreSQL **11/11通过**：整单不受外发筛选截断、逐色新增、预览后来源竞争durable拒绝、两个真实已提交回执丢失后仅一次POST+原ID读取、刷新/撤权、锁定、390px布局。10个子场景加1父测试。
- 本轮先有一次浏览器FAIL：旧测试在应用捕获fetch后替换共享delegate，首次未实际丢包、再次创建client后形成递归；网络证据仅有原调月POST，无来源POST。改为启动前安装稳定代理和明确丢包计数后，实际两个请求各丢一次响应并通过，业务代码未随该测试修复改变。
- 最终harness SHA256 **c06de1a1e98dcdf09ef91ec8fab32cabf7595a4aab0ff559a630a76eaa0eff2c**；截图SHA256 **b67119733d8a4ee64ed72e5ec4b892cac3ec0d203a88c91c0b31926e28ade4c4**，新路径[整单来源预览](../../release/screenshots/closing-source-support-20261028/source-complete-order-preview.png)。原失败/新日志在本机owned outputs/approved-support-flow-20261028，测试另生成outputs/closing-adjustment-ui-current-20261027/browser-1793156808433；不是对私密旧outputs仍存在的声明。

## 限制

本片只是来源配套UI验收；执行方匹配/漂移恢复和报价USD采用界面后续。新actual-main发布守卫真实FAIL，旧post-base文档链需精确整合见证，不能冒称最终Gate通过；工具修复由独立审查者只读复审并补负控。无新Hosted CI/远端写、真实Source、既有账号/业务库、正式部署/切换或用户业务接受。旧演示及其输入保持。
