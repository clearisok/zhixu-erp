# D109 HTTP 接入工程证据

核实2026-10-13；main 6395db45bebe572c736cf4137a373e0f816be6c0。仅本任务独立worktree，起始9ebdf3b/clean，后快进PR98 main；本证据在工程checkpoint提交后由manifest绑定该Git blob。后续结论使用新文件，不覆盖冻结版本。

已实现：精确原HTTP origin及显式policy、双语言校验、readiness指纹和如实传输标签；私密交互入口复用固定只读probe，密码隐藏/不存文件/不走argv或env，90秒子进程限时、错误闭集输出。无UI/SQL/生产路由/默认开关变化，无真实账号变更、业务DB操作或部署。

## 本机已执行验证

| 检查 | 结果 | 范围/限制 |
| --- | --- | --- |
| typecheck / server:build / lint / build | PASS | 完整前端及Server构建；最初新增测试字面量类型拓宽已修复并重跑typecheck；一次误用build:server脚本名失败后按实际server:build完成 |
| npm test | 810/810 PASS | 根级回归，不代表全部独立UI/PG套件 |
| test:release-baseline | 71/71 PASS | 最终实际main守卫须冻结绑定后另行运行 |
| Python unittest discover | 64/64 PASS | 新增精确HTTP/无批准拒绝、私密TTY、禁止密码回显降级、闭集错误/超时、真实子进程拒绝非TTY与额外参数 |
| test:ainuoke-readiness | 9 PASS / 1 SKIP | Node精确HTTP/策略/目标指纹负向；Linux文件权限分支Windows skip |
| test:ainuoke-server-source | 20 PASS / 1 SKIP | 既有来源采集/合成PG，LinuxCLI分支skip |
| test:ainuoke-continuous | 29 PASS / 1 SKIP | 既有首次绑定/调度/候选路由，LinuxCLI分支skip |

Ubuntu CI要在最终远端head实际补验Linux分支；本机skip不计pass。旧Quote扩展UI历史8失败及父测试失败未处理，本轮无UI修改，未重复声称全项目全绿。各本地log在ignored outputs/http-*.log，稳定结果在此Git证据。

## 复审范围

- 已批准地址不含可变DNS、端口/路径/用户信息；无policy与错误policy拒绝，Node和Python都独立判断，stdin保留policy。
- 原固定报告catalog、无重定向/ambient proxy、普通HTTPS校验不变；配置支持不绕过绑定/写入CLI的DB身份、操作人权限和预览确认。
- 私密入口无需保存密码，非TTY和getpass回显降级拒绝；未知worker错误/stderr不外泄；子进程90秒超时关闭。只输出固定报告计数，首合同空物料明确只对该范围。
- 用户回传真实认证/首页可读见user-probe.json；不与合成测试混算，不标全量、激活、业务验收或部署。
- PR98已合并但174a7e5本地状态补充未送达；在本分支接续PR102 merged=true及旧修订证据绑定，旧提交保留，不重写旧现场证据。

结论：当前范围未发现阻断代码问题；可进入远端CI和合并前复审。没有新PR自动合并或环境执行授权。真实全范围、四流代表单与连续运行仍待后续Gate。
