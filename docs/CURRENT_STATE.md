# 当前状态：宁波staging及三合同固定初始化已完成

**当前开发**：main本轮核实仍562fbf07、开始时0开放PR。Gate4候选修正“可信新合同尚未采物料却404”，沿用not_connected和原权限/来源校验。源码92be38f5、证据82bb45be；新增7/7、相关79通过/1既有Windows跳过、类型/局部lint/Server编译及最终基线182/182通过，独立复审无P1/P2。见[最终验收](tasks/completed/2026-10-30-bound-order-material-empty-validation.md)。远端精确交付/唯一草稿PR/必要CI待核实；不自动合并或更新宁波，不新增Source查询。下方为实际已部署事实，不用候选替代。

2026-10-30（北京时间）；产品main **562fbf07f2caccfc9ba0d9c1a8e6a7e58436ee94**，应用d0685f。经明确批准，宁波全新project/空库/四卷/新staging.admin已部署，https://staging.weaveops.top 已切此版本，127.0.0.1:3003；原3000/3002及5旧容器/3卷/6网络保持。实际PG16.15、51迁移/121表、合成报价/附件、重启、独立备份恢复及外部公网session/Origin/TLS验收通过。见[部署事实](tasks/completed/2026-10-30-ningbo-isolated-staging-deployment.md)。

宁波用户另批的三合同固定窗口已完成，见[来源实证](tasks/completed/2026-10-30-ningbo-fixed-source-initialization.md)。PI2608-257/PI2609-039各三轮物料，间隔均超过五分钟，当前分别9/31项、货款18/15行；随后新增PI2606-008，只采成衣16行、全匹配6色。新SO三个、颜色尺码可读；约10分32秒、0重试，操作者exit0，无持续调度。没有采C1物料/货款、原两单成衣，也未填造生产、商业版本或关账。合同9250不等于出货合计，申请不等于银行实付。

新库保留1合成报价/1附件和staging.admin，未复制旧账号/本机SO。有效配置为新runtime/trial.source.conf，只增加payment/garment snapshot读取；原配置保留。外部公网已读回三单、物料当前/历史、货款、出货、交期/生产/月分配展示；当前未采物料的C1物料接口404，不能当零数量。初始化后新dump 947996字节/hash3993468f...已保存，未声称再次恢复此新dump。时效10分钟保持，过期不重采。宁波主机出站公网回读仍失败/超时；外部客户端与浏览器登录页通过，不混作登录后人工验收。

本机原恢复套件7通过/2超时取消及补充恢复、三单历史/旧资产保护继续按原日期保存，没有重跑或改写。完整[Gate0–8/R](tasks/active/server-convergence-gate0-2026-10-20.md)、真实来源/人工业务接受和具体旧入口退役仍继续。未改正式环境/旧业务库/旧账号、未清理或自动合并PR。
