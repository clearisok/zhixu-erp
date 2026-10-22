# 固定成衣合同核验：报表配置的有界秘密检查

2026-10-22；root唯一writer，既有reviewer只读。Branch
fix/garment-filter-metadata-screening从独立main996dfedc12da3527343cd3ff2aa5eea35497e10e
建立，仅FF至干净输入31cad6f71dced9f1ad399b13dd1b4871d2234abc，保留原始提交。
三份输入摘要逐字节保存在../completed/2026-10-22-garment-filter-screening-inputs/31cad6f7/。

## 前置与本次真实执行结果

- F=31cad6已精确远端、精确main守卫PASS；Source39694581228、Team39694584779、
  Release39694588911均attempt1/completed/success。原一次Execute STOP与零push
  DryRun DELIVERED_VERIFIED两份回执保留；原stderr缺失，原因不推断。旧105失败仍保留。
- 用户批准call_82b77df8b11943008db22015f0c7a1d1的一次C1首页→虚拟C0首页→C1首页。
  三CI通过、clean F及独立远端核对后仅调用一次原工具，开始2026-10-22T00:00:21.957Z，
  结束00:00:27.519Z，FAIL/garment_filter_candidate_invalid/stage=candidate，
  httpAttempts=0/reportRequests=0/requestCounts=not-started。未进入凭据阶段，没有登录、
  报表、DB、绑定、激活或部署。失败即停，不自动重试、不以零请求冒称本次成功。
- 随后root只用既有ACL/hash reader离线诊断已授权的冻结候选，不读凭据或新Source。
  包装ed6f6c4135a535370b161246686d0a3685d5b66feb6e7580adfd87bdd49fc655、原文
  a6c57525659d60995aa4c8c7238ced3e698f7883ca0f8cac6bc26c5b22ffafa1均与冻结值一致；
  schema/tooling/scope等布尔核对全通过，16行/唯一合同/16唯一id，无非法id/billno或款号。
  公开诊断只有计数、布尔和hash，无账号、合同、行内容、金额或配置原文。
- 两个合法编码JSON容器解码后对象深度13，组合遍历深度19；通用inspect深度12抛
  source_invalid，候选外壳安全归为candidate_invalid。现screen16亦不足；外层对象最大6
  不代表编码内容组合深度。这是已验证的本地工具兼容缺陷，不是来源过滤或网络失败。

## 最小修复和验收范围

仅修改固定诊断的Node/Python秘密检查及合成测试。当前对象键投影为null后复用原秘密规则，
逐层检查标量反射、严格编码JSON及重复键，使用明确组合深度64；不在每层再调用更小的递归限制。
资源异常失败关闭，不能伪装成普通括号文本。通用inspect、付款模块、正式extractor、冻结hash、
合同条件和页数/字节/时间/请求预算不变。

先用纯合成深度13/组合19复现，再核对64/65、深层秘密键/反射/重复键、超深失败和失败后无后续
请求。只离线重新解析冻结候选，不读凭据或新Source。Node定向、Python全套、类型/lint/构建、
发布基线、精确main守卫和独立review后单独commit/交付；三CI另行核实，不混用F的结果。

无UI/API/SQL/业务规则变化，不新增能力状态、重复累计PR或真实采集额度。旧环境、账户、卷、
Browser和全部工作树保护。交期UI仍待原具体批准，其他关账问题不默认；完整Goal active。

## 实际实现与首轮验证

scope16834a28，原4个Node/Python实现/测试文件为唯一源码增量。先增加合成深配置用例，旧实现
实际失败；修复后Node17/17（19029.9317ms）与Python全套169/169通过。混合对象/数组/编码
JSON的64/65边界、13层配置、深层秘密键及pw/jwt/session反射、转义重复键、解析资源异常、
超长整数、原普通括号文字与固定候选先于凭据负控均保持。没有降低秘密规则或改共享付款模块。

root只调用原readFrozenGarmentCandidate离线重验：原包装/raw哈希和tooling保持，
FROZEN_CANDIDATE_ACCEPTED_OFFLINE；sourceRequests=0/credentialAccess=none/DB=none。
源码文件hash9f4787667762af57a6fa1ba933b603b8d9c46095e18fd6a1554d18e2292f54cb，
这是工作区源码检查，不冒称已提交版本的CI。类型和Server编译通过；其余lint/前端构建/发布/
精确守卫/独立review及远端CI另行收口，不提前PASS。

完整lint通过；main996工作区守卫PASS（checkedHead16834a286868b095d72b7323cbbb46cdf88b56fc，
11页面/57能力/80继承UI路径，errors[]）。独立静态review无P1/P2，reviewer未执行测试或读取
私密文件。下一步只提交本阶段增量，再以精确源码构建、发布116回归及最终收口；不复用旧CI。

## 最终本地工程

源码a98e4da5bff5b772bea292abdf33bc179a614fd6，clean。原Node红测16项中13通过/3新增失败，
修复及补充大整数用例后17/17通过；Python原18项中2新增失败，完整最终169/169通过。
不是将原红测改称通过。最终类型、完整lint、Server编译均PASS；显式Server前端build
server-garment-filter-a98e4da5-20261022/full sourcea98e、声明时间2026-10-22T08:14:40+08:00，
session/Server/writable/snapshot构建通过，build-info已回读。

发布回归116/116（186116.334ms）通过，无skip。独立静态review无P1/P2，不代表reviewer执行了
测试或读取真实文件。没有重跑全项目927/PG270或UI像素；本阶段无SQL/UI/业务能力状态变化，
manifest268证据/57能力及全部旧记录逐字不变，不为工具修复抬高能力或部署标签。

原冻结候选离线已由原产品函数重新解析通过；这是本地工作区检查，未再次调用CLI或collector，
未读凭据/发HTTP/访问DB。原失败的尝试、回执、公开脱敏诊断与所有本阶段日志保留在ignored
outputs/material-arrival-activation与outputs/garment-filter-screening。当前只待最终文档HEAD
精确guard、安全交付和该精确HEAD三CI；无重复累计PR，不自动合并/关闭/部署。
