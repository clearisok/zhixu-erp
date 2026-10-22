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
