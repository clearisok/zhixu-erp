# 当前独立预整合：Git上传预算与main562

2026-10-30；分支fix/git-delivery-upload-budget，保留原始c91d904d与已核实main562的历史。本片只有交付工具/回归及文档增量，不改变产品、SQL、UI或运行环境。四处冲突仅为共享状态/基线文档，已按main原件和旧工具历史前向保留。具体冻结、原79项复用边界及待验收见[本片](tasks/active/git-upload-budget-main562-forward-2026-10-30.md)。这是本地预整合，不是PR就绪、远端交付或合并/部署。

业务修复[PR135](https://github.com/clearisok/zhixu-erp/pull/135)的a6667877已三项CI通过，仍等待明确merge批准；宁波实际运行main562，已批准的三合同有限初始化完成、无持续调度。当前工具片不复制未合并PR135的源码/状态文件，不重复其测试或CI；最终发布门禁/交付等待确定最终main基线后集中完成。

以下为本片核实main562的原状态，保留其时点和限制，不据此覆盖后续宁波事实。

# 当前状态：最终main已就位，C1接纳成功、出货兼容修复中

2026-10-29；比较main **e11b3c3cbd1dcf751b6fa5cb16e9323fdc67ac9e**，分支codex/garment-collection-first-page-proof。#132/#133已按具体批准merge commit，原历史保留；当前新兼容修复尚未合并或部署。

e11应用442b1c及源码工具5568fc已冻结，确切镜像非空恢复9/9；本机https://localhost:54315五服务健康、原四卷保留，其他环境未变。发布包仅本机，没有宁波传输/部署；浏览器证书及人工接受仍待。各失败、校正、hash与备份范围见[本片证据](tasks/completed/2026-10-29-garment-first-page-compatibility.md)。

获准C1窗口已停止：PI2606-008已创建唯一SO，6颜色9250件；target v1已启用。原两单在出货采集前摘要不变。成衣读取第一遍后因page_mismatch完成not_published，未第二遍/快照；本窗口2登录27报表29HTTP，不重复合同查询、不借剩余额度自动重试。失败原文未保留；旧同合同证明0/0不能冒充本次响应。

离线修复只对原有界完整首页增加实际请求证据及成对0/0兼容，保留原文hash/两遍一致/≤100/时效/旧v1标识。保留报表还暴露createTime私密字段缺口，定点补齐、不输出或替代outdate。工程与剩余验证详见[契约](features/SERVER_GARMENT_FIRST_PAGE_COMPATIBILITY.md)和本片，最终候选/CI不借前件结果。

完整Goal/Gate0–8/R继续：原两单已有物料四流/货款历史，C1尚未发布成衣且未采物料/货款；真实生产、商业采用和关账人工业务接受不被合成测试替代。新修复merge、新真实读取及宁波发布分别需要具体批准。没有修改旧账号/业务库、持续调度或删除旧资产。前件原状态完整保留于e11的Git及[原窗口](tasks/active/real-source-acceptance-current-2026-10-29.md)。
