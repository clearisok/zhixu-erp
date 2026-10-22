# 成衣固定核验的恢复准备

2026-10-22；root唯一writer，既有独立reviewer只读。GitHub main重新核实为
`996dfedc12da3527343cd3ff2aa5eea35497e10e`，#120–127仍为原head的开放草稿。
从main建立`feat/garment-filter-recovery`，仅FF干净、已精确交付输入
`632c62c069869dbf618d976240790cc2d44232b4`，没有继承dirty或改其他工作树。
原客户端的1ed CI继续使用原固定run，不重启；本切片不依赖待批准的覆盖面板。
两套成衣诊断的源码与已验收377a3c9e逐路径相同，尚未改动真实读取范围。

## 问题与最小恢复方案

原D1933冻结私密文件在已核对的31个工作树原精确路径未找到；不等于全盘不存在。
不能从摘要重建原字节或替换FROZEN/hash。原单次核验已消费，0HTTP不代表自动获得重试。
本阶段只准备合成工程，不读凭据、原私密样本或上游，也不写业务库/target。

独立代码审查建议：新固定入口顺序复用原D1933首页probe和C1/C0/C1 filter collector，
不重写Python固定队列。候选来自本次新采样，严格完整首页/唯一合同/见证/账号指纹通过
后才启动第二段；实际私密文件hash作为新身份。CLI不接受候选、合同或hash替换参数。
旧FROZEN、CLI和既有证据保留。工程预算拟为最多2次登录+4次报表（6HTTP），每报表
4MiB、报表累计16MiB、每登录另限4MiB，共享单调180秒deadline；不重试/翻页/DB/激活。
这份新真实范围尚未授权，工具完成本地测试、复审并明确范围后再请求一次具体批准。

## 分阶段范围

1. 先检验旧probe的深配置与编码JSON秘密筛查；如合成复现误拒/漏检，局部复用已验证的
   组合深度64筛查，不放宽通用inspect、付款模块或固定查询。旧过滤工具行为必须回归。
2. 再组合现有collector/validator/private writer，保持两段失败及未知计数、总deadline、
   同账号和新文件hash；首段失败不启动第二段，写入失败不继续，不自动重采。
3. 新私密CLI/launcher、合成反例、类型/lint/构建、发布门禁、独立复审和远端CI分别收口。

第1步允许修改两套成衣诊断的局部筛查接线及对应Node/Python测试，不修改原查询、预算、
FROZEN常量或worker固定序列。第2/3步单独记录实际源码和验收，不提前宣称已实现。
没有应用HTTP API、SQL、权限、UI或业务口径变化；不创建重复累计PR或自动合并/关闭。
3001/50426等旧入口、卷、账号、Browser及工作树保护。完整Goal未完成，原关账问题不默认。

## 第1步实际修复与结果

旧Node probe实际红测2/2失败：合法对象深13误拒、编码JSON秘密字段/反射及重复键未抛错。
旧Python13 tests有5个编码秘密/重复键subtest失败，均为合成运输，0真实Source。
局部复用原合同screen后Node31/31先通过；Python171首次仍有1个错误，来自重复键异常类型
未归一，现通过固定码转换为既有UpstreamSchemaError，未放宽负测异常类型。

补充硬边界时Node32首次31通过/1失败：严格JSON本身的64层限制先返回invalid_evidence，
测试误要求structure_limit。现分别固定断言JSON层和编码组合层两种已有静态码，不改产品去
伪造统一错误。最终Node32/32（26284.2356ms）、完整Python172/172（2.314s）通过，无skip。
类型、完整lint、Server编译通过；没有新前端构建、DB/API/浏览器像素、真实读取或部署。
红测/首次绿色错误/最终结果分别保存在`outputs/garment-filter-recovery/`，不覆盖成PASS。

独立静态复审无P1/P2：依赖单向、无导入采集副作用；秘密、组合深度与固定码保持；
旧FROZEN、请求队列/预算、CLI与launcher范围不变。reviewer未执行测试或读私密文件。
产品范围为3份Node/Python接线与2份测试；通用inspect和付款模块未变。
契约见[固定诊断](../../features/AINUOKE_GARMENT_DIAGNOSTICS.md)。第2/3步组合入口仍未实现，
新2登录/4报表方案仍未获真实执行授权；不能用本阶段筛查通过替代合同过滤实证。

前一客户端的原三CI现已全部成功，见[精确终态](../completed/2026-10-22-delivery-coverage-client-ci.md)。
它们属于1ed而非本修复，原watch观察超时后没有重启工作流；不借旧CI给新源码报PASS。
发布116、最终精确提交门禁及本修复的远端/新CI尚待，不提前声明本Gate完成。

## 第2/3步工程输入

从干净checkpoint `64de5c060e68d28ee8525b1e6b6418f4428143a4`继续；其精确main guard PASS。
单push返回STOP拒绝分类但独立API exact，未重推；原工具随后零push只读DELIVERED_VERIFIED、
Git read exact。两回执分别保留在outputs/garment-filter-recovery，不推断网络永久恢复。
旧摘要与证据收口独立静态复审无P1/P2，不代表新组合工具已验收。

新增固定恢复协调器、受限CLI/PowerShell launcher与合成测试，正在工程验收。CLI只有新动作、
凭据文件及私密输出三个参数，无合同、候选/hash、页码覆盖；精确数值runtime/干净提交/私密目录
先于凭据读取。候选严格选择后写入、核对新hash并受保护读回，才继续C1/C0/C1；旧FROZEN不变。
每阶段独立已知/未知计数，未知第二阶段不清空第一阶段下限；共享单调deadline涵盖落盘/读回。
launcher只传文件路径，不读取凭据，并从自身启动计时180秒、超时终止进程树。
尚未执行新真实请求；本段不是新的真实执行授权或最终测试结果。

## 第2/3步当前验收

初始新9项纯Node通过；初次typecheck发现path/match控制流未收窄，改为明确never函数声明后
types通过，没有通过强制类型断言跳过。加入真实私密writer/hash读回与Windows launcher合成
凭据/宽ACL/dirty测试后11/11通过（20898.7951ms）；新旧三套合计43/43（51736.1023ms）、
完整Python172/172（1.940s）、完整lint和Server编译通过，无fail/cancel/skip。随后仅为Linux
无outputs父目录的干净checkout补上recursive mkdir，平台范围与测试结果另行核实。
没有前端/业务DB/API/浏览器/真实Source测试，初始类型失败单独保留。发布116正在执行，
组合工具独立静态复审及最终精确源码/交付/CI尚待；不提前报告最终Gate通过。

独立审查提出P2：外层180秒Kill先于内层终态时会丢第一阶段已知计数/候选回执。现新增最多3个
安全阶段帧与1终态，外层只使用完整换行且校验后的帧；超时保留exact、把未终态not-started降
为unknown，重新汇总已知下限。不扩大Source时间，终止后只做本机回执核对。首次新增超时测试
13中12通过/1失败（25218.8319ms），实际只到测试shim的箭头对象字面量语法错误，没有运行
180秒或发HTTP。已修正fixture并增加无采集的语法/参数前检，完整180秒用例正在重新执行。
不能把旧11项通过当作这个P2已验证关闭；原失败保留。

首轮发布测试99项90通过/9失败（300059.1665ms），原因均为新D157尚未登记前向文档版本的
EVIDENCE_WORKTREE_DRIFT。405摘要曾误将总数差额17写成响应式未运行；原日志实际R1–R20及
子规则全部通过，差额为父断言失败后未进入的后续嵌套检查。此处前向更正，旧提交/日志保留。
按RELEASE_BASELINE_GUARD先提交新决策
字节，再追加supersedes记录，旧ID/hash不改、不删，不修改截图或弱化测试。当前清单仍284/58，
新前向冻结及最终发布测试尚待。

## 405源码最终验证与前向冻结

产品/决策checkpoint `405d3e01a76b2c5dd1efd91a9a13a98d8a2f277a`已干净保存。P2代码经独立静态
复审无剩余P1/P2；主控另实际完成180秒Windows合成超时1/1（183736.6554ms，总184321.2265ms）：
保留候选2HTTP/1报表/文件hash，后段unknown，合成worker树确已停止；超时后约3.7秒只做本机
ACL/hash核对，无Source请求。旧失败没有换成PASS，reviewer未执行测试。

随后组合三套测试完整45/45通过（232290.6899ms，无fail/cancel/skip），日志文件名含fast但
name-pattern实际没有排除完整名称中的180秒用例，因此按实际完整45计，不报44或仅快速检查。
Python172/172（1.940s）、最终types/full lint/Server编译通过，无业务DB/API或新前端验收。

清单仅追加D157文档版本至285/58，新ID `decisions-garment-filter-recovery-20261022`，同路径
supersedes原D156验证记录，recorded/rendered均405，SHA256
`b4c5f921780e58b79216d34f346566e11029a6fd9e15ee5c22349f11648de1a2`。
独立证据复审核对原284记录、其他字段、能力和截图逐对象不变，无P1/P2；旧D156/blob链保留。
前向冻结后的发布测试仍在执行，精确最终guard/送达/新CI另行记录，不能沿用64de/1ed回执。

前向冻结后实际发布116/116通过（347796.3971ms，无fail/cancel/skip），
`outputs/garment-filter-recovery/release-forward-final.log`与原99/90/9失败分别保留。
本地工程PASS；最终精确commit guard/送达/Source与Team及Release新CI仍待，不自动建立重复
累计PR、合并或部署。正式合同过滤实证、真实范围许可及完整成衣Source仍未完成。
