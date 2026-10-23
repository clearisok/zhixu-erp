# Gate7E 单SO成衣受控采集与原子回执

2026-10-23，Asia/Shanghai。root唯一writer，既有审查者只读；完整G1–G5目标不变。

## 已核实输入和范围

- 当前main be9aaa3f4efa232e1451075a355f0ce42e35a69e，本轮独立API重读相符。新分支codex/server-garment-collection-control从main建立，再FF精确累计验证49dc50df82c28a23ab4242de6c51ae0e5b04bca4；开始树干净，无继承dirty。
- 前轮是progress：#127批准合并；#120/#123/#125九CI及49dc本地134+88、一次精确送达和Release39909321129 attempt1成功，复审无P1/P2。原结果保留各自范围；本轮是新后台工程，不借旧结果。
- 复用已有0040 immutable observations/store、fresh身份、物理归属锁序及固定过滤核验。独立预审已识别缺少采前durable started、正式worker及成功终态原子联动；本阶段补齐该内部链路。
- 真实固定额度已用。没有读取凭据/私密报告、新Source请求、目标激活、scheduler、真实库迁移、环境操作、merge/close PR。3001/50426/59069/62426等和Browser/对象/卷/旧工作树/不可变0c镜像保持。

## 实现和验收契约

1. 重建完整C1/C0/C1过滤证据，仅本账号/合同完整首页；目标hash、可信SO/原物理owner、颜色、target和DB指纹绑定。hash不构成人类许可。
2. 1个SO、1个actor/request；started COMMIT确认后调用唯一worker。1登录/2报表、两遍首页100行、4MiB响应/8MiB报表、180秒、零重试。未证明的分页/零哨兵/混合同/两遍变化拒绝。
3. 网络不持锁；原发布检查/CAS保持。snapshot+颜色+head+审计+成功回执一个事务；终态失败回滚，未知只核对原请求，不回收started。
4. 0043追加空技术表；原42及旧表/来源/订单/价格不改。两个SO引用纳入归一完整指纹，未授权归一执行。
5. 回执只安全标量、计数或unknown，按fresh权限读取，重建身份和封闭字段；后续head或permit过期不改历史。

## 当前执行事实

- 31/31定向通过（16677.0159ms、0skip）；181 Python通过（1.895s）。更早14/26/30中间结果和失败日志留在ignored outputs/garment-collection-control-20261023，不替代本结果。
- 首轮Python发现total>100仍完成第二遍首页，已改为首遍停止并重验。最初TS窄化错误已修；根全量typecheck还误扫既有ignored旧镜像context，旧文件原地保护，后续用精确Git archive外部context验全量，不改tsconfig或删缓存。scoped lint仅未用准备时间告警，改为显式clock校验。
- 原publisher同步捕获输入、锁序、CAS、历史重放保持，新增caller-owned primitive。非空0042升级逐旧public表全行JSON字节不变，旧publication仍可读；0043空、重复migration幂等、正常verify-only保持。
- 精确9fc Git archive外部context的全量类型/lint/Server和显式Server UI构建通过；没有安装依赖，已有node_modules仅只读junction。该构建的13项真实Chromium回归通过（37960.0029ms、0skip），六宽度和原角色/过期/历史边界保持。没有页面/样式变化，新的浏览器像素批准不在本范围。
- 9fc源码的952项目通过（656922.3078ms），270 PG/API通过（292183.5075ms），85原成衣观察通过（45460.8512ms），33归一执行引用回归通过（35977.9668ms）；均0fail/cancel/skip。以上结果有自己的源码范围，不冒充后续修复全量重跑。

## 独立复审与前向修复

冻结9fc的只读复审发现1项P2、无P1：最后异步范围读取可能等到许可过期后才调用worker。在独立精确9fc临时context新增负测，确实多调用一次worker；另一个断言复现原发布已回滚、失败终态COMMIT丢回执却报告publicationRolledBack=false。红测总23项、20pass/3fail（含父测试失败），保留原日志，不将其解释为三项缺陷。

root在全量952完成后才修改主树：worker前再次fresh，回滚确认保存为独立事实，不被后续committing变化覆盖。补实际第二DB actor的fresh权限、foreign receipt/permit拒绝，以及成功发布丢回执不能声称回滚的断言。修复后33/33定向通过（17460.7503ms、0skip），Server编译和两文件scoped lint通过。SQL、worker预算、Python、公开GET及UI未变。修复后精确源码checkpoint、冻结证据/发布134、新CI及最终复审继续，不把旧9fc完整QA改名。

最终源码d99282fa41788a385d94e91bf7f26a318dc7c0ac已独立复审无剩余P1/P2；精确d992 archive的全量types/lint/Server和显式Server UI构建全部退出0。[不可变工程报告](../completed/2026-10-23-garment-collection-control-engineering.md)区分原9fc、最终d992和之后发布/远端范围。接下来只追加冻结/能力、跑134与explicit be9守卫，安全交付验证引用并核实新CI，不改业务源码。

## 后续与完整目标边界

代码checkpoint后用精确源码外部context完成充分验收；冻结新工程报告/D158/feature证据并追加能力分维度记录，不改原295证据和58能力历史/批准/截图。最终精确be9门禁、一次验证引用交付、Source/Team/Release实际CI与复审。依赖仍未合并，不创建重复累计业务PR，不自动merge/close或部署。操作者入口与真实target/新读取范围仍另有具体批准；多页实证、跨次事件、覆盖v1、关账三项、50426切换/退役待决不默认。
