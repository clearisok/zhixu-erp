# 精确 main 持久空目标与 Linux Source 工具收口

2026-10-29，承接[main镜像/受控Origin](2026-10-29-main-image-staging-profile.md)；工程源 **5c8cb8037376288aa71043e799a057e21f1b985d**。本片只准备新本机目标及原操作者可运行条件，不读取真实凭据/Source，不部署宁波。安全字段、原件hash及失败分类见[最终本地回执](2026-10-29-main-image-staging-profile/final-local-validation.json)。

## 最终本地发布检查

首轮 `npm run test:release-baseline` 捕获了前向元数据冻结前的清单，而摘要已指向新main，因此真实manifest正控报告EVIDENCE_WORKTREE_DRIFT/STATE_BASELINE_DRIFT。失败保留，不报通过或产品回归。清单固定到be4f102249ad108d374cf26ddf97052f50b68e0f后，运行相同两个文件、仅改TAP报告格式：**182/182通过，0失败/取消/跳过，540371.8678ms**；HEAD、clean及五份输入hash全程一致。最终提交另核精确main守卫，不再次运行未改动的业务/浏览器大套件。

三份归档原CRLF blob长度/hash已实际与input-state核实；目录三文件属性仅保留原字节及声明cr-at-eol，独立复审关闭P2。原593条清单证据、所有能力/部署/来源/用户接受维度未改变，仅新增两项工程证明及main锚点。

## 新持久目标：READY

- 项目 `zhixu-quote-trial-main-4e7c5853f7`；目录 `D:/zhixu-server-convergence/main-empty-5c8-4e7c5853f7`；入口 **https://localhost:54315**。不是50426切换或宁波部署。
- 采用main5c8精确80ff应用镜像和canonical目录21份ops文件。默认local、session、Secure cookie及固定loopback入口；自签证书没有安装到系统信任，也没有越过浏览器警告或宣称用户接受。
- 新建五服务/四named volumes/两个不重叠网络，均健康；default internal `10.253.240.64/28`，gateway ingress `10.253.240.80/28`。仅网关发布127.0.0.1端口，DB/app/MinIO不公开。
- 原check→prepare-local→init→objects-init→start各一次，restart一次READY。121张public表中111非技术表全部0，51项迁移/原0051、0052保护/新技术身份在重启前后相同。只新建local.admin技术管理员，未修改真实或旧账号；Source profile为0。
- 原目标工具返回canonical DB fingerprint **ba8a0fb77709d7314f0258a383112ad6ceb5e5985e2b9a95f619dc500aa22360**。它是原数据库运维指纹，不能冒充尚未生成的Source账户/目标permit scope hash。

## 原 CLI 的 Linux 源码运行条件

实际检查确认 compiled CLI 的help不能证明业务命令可运行：原payment/garment入口明确要求实际执行路径为干净源码TS，且验证Git HEAD、原blob和clean。没有修改、旁路或弱化该守卫，没有另建collector。

准备完整main bundle并离线检出3308 blobs；bundle169369552字节、SHA256 **f81855ed56e3e3ff69aa5ce508fc92601f730a5329391cef7389174de7d2fe16**。独立工具依赖层从已缓存精确Node基础及main package-lock构建，npm生命周期脚本禁用；安装仅在新Docker层，未安装宿主依赖或改全局设置。应用80ff不改变。

最终工具镜像 **sha256:b7e8fa82f4a24053d6e64ffc7a8045a534a59208d35a1a93b11255dec701ebe0** 内含不可变Linux Git checkout，UID1000；标签明确operator-only，不可作为应用候选。运行使用read-only rootfs、cap-drop/no-new-privileges、仅/tmp临时写入；没有Windows源码bind。原源码守卫、两个help及payment在完成Git校验后拒绝合成非法输出均通过，烟测network none、无凭据或真实job/DB。

随后只连接上述新目标的internal网络，匿名stdin传入新建测试库凭据，未进argv/env/日志；在 `BEGIN READ ONLY` 中核对实际库/用户、51迁移、新local.admin和0 Source profiles，实际3308源码blob再次逐项hash校验。没有真实凭据或Source调用、业务命令、绑定、目标启用、正式生产/价格/关账操作。此结果证明私有连通性，不冒称真实operator业务成功。

## 保留的准备失败

所有旧失败原件仍在本机，不覆盖为成功：bundle只有remote ref时首次clone空；本地显式fetch同bundle纠正，无GitHub重试。初始FROM config-ID写法误解析为registry名、未到apk/npm；改用已核验缓存名称、前后ID与层前缀绑定。Windows bind烟测30秒和诊断90秒超时保留，Linux内部checkout成功，不能据此确定旧超时的所有根因。新忽略recipe的加号续行及root/UID1000初始化冲突分别修正；后者先停止Git，再匹配新目录/文件UID1000，以同用户初始化，不增加共享safe.directory或关闭身份验证。最终Linux层构建无网络、未重复apk/npm。

只读连接helper误用了UI虚拟status字段，按实际0001/0032改为active/archived_at后成功；未改产品schema。此前所有失败均为本片准备/检查工具，不能记成产品通过或真实Source故障。各阶段原74容器/201卷/37网络身份状态不变；仅新增本目标资产，未清旧环境。

## 接续边界

1. 当前配置增量的最终本地守卫、精确远端、唯一草稿PR和必要CI/复审分别核实；用户只批准合并#131，后继PR不能自动merge。
2. 准备D147具体新目标/两合同/请求总量/期限/停止执行单供批准。合同索引读取覆盖当前账号，颜色和四流仅两合同；6086941仍独立，6086979须先唯一证明C1，不猜或重用旧额度。实际Source-specific指纹在获准读取本机凭据后，由原服务生成核对。
3. 新工具仅属于main5c8，profile晚于80ff；最终main变化后重新冻结对应候选，不能给旧镜像换SHA。真实首绑/有限续刷和人工核对、公网TLS/Host/cookie/附件尚未完成，staging不具备晋升条件。
