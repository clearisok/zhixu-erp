# PR108 预检证据链修复

核实2026-10-14；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；沿用feat/ainuoke-live-demo-readiness，起始8b89de59dd405395da1dde4b6dde5f125141deb9，clean。GitHub评论4261364765指出preflightSha256仅格式检查；复核属实，旧三项CI不覆盖此缺口。

修复：私密包装强制-PreflightFile，Node强制--private-preflight；读取前核验Git忽略输出目录/文件ACL、常规文件、非符号链接、64MiB上限，并按同一文件描述符读取原字节。实际SHA256必须匹配请求；要求完整成功的全量预检、两个成功阶段、Discovery稳定/完整、物料全可见覆盖、唯一标签/合同和计数一致。诊断凭据的来源指纹必须一致；目标label/BillNo/InsideOrderNo必须来自这份预检。历史报告仅用作范围依据，不声称新鲜；本次收集仍独立核查新鲜Discovery及身份变化。

验证发生在collectQuality之前；报告写入preflightLineageVerified=true只有CLI实际通过门禁才添加，纯离线分析不伪称核验。本轮没有重新读取558全量或真实来源，没有数据库/账号/部署操作。旧报告证据不改写。

定向26项通过，含新增成功路径及13类负向情形：假hash、字节改动、失败报告、不完整范围、错账号、无orders、计数错误、重复身份、错label/合同/内部单号、失败stage、非法JSON；每例断言collector调用数为0。typecheck与server:build通过；最终基线/回归/lint和精确远端CI另按交付结果记录。

复审：无默认猜测路径；缺PreflightFile失败关闭；凭据不进入日志；纯分析未冒充已核验。旧PR的通用lineage缺口被补齐；真实旧私有报告可离线重验，不以本修复改变数量/单位/正式计算。更新时机：代码、测试、真实离线复核、PR/CI发生变化。

真实离线复核：已有原始预检文件SHA256 13dc7d3b5ed3afec38bd4d8ce74fe8cba97f3ea77db4ba655df5a03a0701ba4d与历史定向报告19合同请求全部匹配；输出EXISTING_PREFLIGHT_LINEAGE_VERIFIED_OFFLINE。没有来源读取或DB访问。此补充验证原证据，不篡改旧报告。

最终本机验证：26项质量诊断、831项项目回归、85项发布基线回归全部通过；typecheck、lint、server:build与精确main源码门禁PASS。网络诊断default及openssl对照仍传输失败，HTTP/1.1只读对照成功不证明push恢复；本轮保存checkpoint，远端新head/CI仍待交付，不能沿用旧head结果。
