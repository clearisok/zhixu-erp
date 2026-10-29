# 最终main、C1接纳及成衣首页兼容修复

2026-10-29；比较main `e11b3c3cbd1dcf751b6fa5cb16e9323fdc67ac9e`；分支 `codex/garment-collection-first-page-proof`。本文件区分既有发布结果、获准真实操作及新增离线工程；最终提交、远端/CI按后置回执核实。

## 已完成的发布及本机结果

- #133 merge `8da5644cb5f3202955b39224065fbab5aea3f4b6`，#132 merge即当前e11。原提交历史保留，双父/tree核对，二者各三项首次CI成功，没有重跑。
- e11应用镜像 `sha256:442b1cc28b36f363937c041d073688d2faadc4cd0dbc23da64ca28730ef15f5a`，源码工具 `sha256:5568fcfa9691027ea23404c030d72154327cd5b00ebd0c8d3addcb8e0c684b65`。3327 tracked blobs和51迁移hash核对；确切镜像非空恢复9/9成功。初次TAP解析器不识别Node24符号的问题已离线对原日志校正，没有重跑测试。
- 本机 `https://localhost:54315` 更新为e11，五服务健康，DB/对象四卷保留；121表业务/账号摘要对比相同，管理员bootstrap时间及用户序列变化单列。其他86个容器未变。新兼容代码尚未进入该镜像。
- 发布包 `D:/zhixu-server-convergence/release-main-e11b3c3c-5741a960` 仅本机；应用归档SHA256 `ea9d19568dc9804fcd8bc6b7d7128a85b38af6070609e3db06847b1adeb83b04`。不包含凭据、Source原文或数据库dump，没有宁波传输/部署。
- 更新前备份dump SHA256 `dbe55504e57837adba3651f7324c0b44be9fee6b30c8c9de4db40eae89fe583e`，已验hash/目录但该具体dump未单独restore；它早于下述C1接纳。浏览器仍需用户处理本机证书/人工验收，后台CA检查不能替代。

原ignored回执：`final-main-local-experience.json`、`final-main-isolated-recovery-reconciled.json`、`final-main-release-package.json`。历史基线/失败见e11中的原PROJECT_INDEX/CURRENT_STATE/AI_HANDOFF及其链接，未删除Git记录。

## 本次获准真实C1窗口：部分成功，已停止

原固定 D1933/C1/C0/C1 证明（2登录4报表6HTTP）已确认PI2606-008，16行两次相同hash，C0为空。后续人类单独批准本机C1接纳及一次采集，不能合并两次额度。

首次selected collector完成1登录26报表，预览为6颜色9250件，但运维包装错误地将 `usable` 与另一层 `SIZE_MATRIX_VALID` 比较，停止且当时未建SO。人类明确批准只复用保留结果，在原TTL及截止前恢复，不重新查合同。

恢复通过原addOrders创建唯一SO `0535a7a6-0ad4-4ed3-99c6-1ee1dac5e60f`（PI2606-008、D1933、6颜色9250件），原两单在出货采集前摘要未变；成衣target v1启用成功。出货命令 `d6d2ace1-4c19-4dc5-bbf5-8bc1d7a584f6` 实际1登录1报表后完成为 `not_published / shipment_observation_page_mismatch`，未请求第二遍，未发布快照。C1本窗口合计2登录27报表29HTTP；失败后停止，不借未消耗预算继续。

SO/target保留，不删除、回滚或换UUID自动重试；没有新增物料、货款、生产/报价/商业或财务命令，没有持续调度。建单可能形成的默认月份计划不是收入确认。失败响应原文未保留，原正式失败回执和私密报告均保留，不能据错误码声称新响应一定0/0。

原回执：`outputs/c1-admission-current/original-stage-receipts.json`，私密原件卷 `zhixu-c1-admission-b7dfe388ff-reports`；不入Git/发布包。

## 离线修复及实际验收

新增[完整首页兼容契约](../../features/SERVER_GARMENT_FIRST_PAGE_COMPATIBILITY.md)。legacy v1严格不变；新v2绑定transport实际请求和序号，Python/Node独立校验，只接受完整≤100行的1/100或成对0/0。原始分页/hash保留在存储与公开trace，客户端严格兼容；不是修改原报表元数据。

历史字节回放发现另一真实字段缺口 `createTime`；仅补私密白名单，不输出/当作outdate，未知键仍拒绝。原16行字节（两页SHA均 `2a6f38c17f5567c01cd1d6b0f3899c24bcb5ccb268ca722ed68c415c358d6ee9`）已通过Python→Node纯离线夹具回放，无Source/DB/发布；期望请求声明为合成夹具，非新执行证据。第一次未知字段失败保留。

实际已运行：Python全155通过；Node初轮30，新增客户端45通过；一次性PG发布/历史/并发/撤权/丢回执/容量41通过，新增v2跨层reader→client正控通过；类型通过。后续新增createTime负正控和v1历史ID golden按最终候选再验，最终完整定向/构建/lint/发布守卫与CI待后置结果，不能套前轮PASS。独立只读复审发现的客户端拒收P2已修并加跨层回归，余项无P1/P2；建议的旧ID golden已补。

## 下一步与部署边界

集中完成修复候选验证与唯一草稿PR，不重复触发已绿CI。新修复不在#132/#133合并批准内，未经明确批准不合main或替换当前e11运行镜像；新Source读取同样需具体次数/范围批准。

完整Gate0–8/R仍进行中。原两合同有订单/颜色尺码、三代物料四流及两货款快照；C1当前只有新合同/颜色，成衣发布未完成，没有它的物料或货款快照。真实生产、实际价格/关账人工业务接受没有被合成测试代替。宁波现有应用/卷/路由未改，公网TLS/Host/Origin/cookie/附件和发布范围仍待批准与验收，不能宣称全闭环或staging已就绪。
