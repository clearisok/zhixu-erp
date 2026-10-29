# 关账配套候选：获准单次交付及代理端口核对

2026-10-28；clean输入a0272a44be9c0f5961bbc2de51477a996815af57，feat/closing-support-interfaces。用户明确批准对该精确SHA执行一次Git写入例外，最多一次实际push，精确送达后才创建唯一草稿PR和必要CI；不合并、部署或动真实数据。本记录仅保存已发生事实，不扩大此次次数或目标。

## 已验证事实

1. 交付前既有GitHub连接器及修正后Git读取均确认main为6479a713e2b80228f008049519ebbd50d10601a8。a027精确发布守卫PASS（12页/68能力/38个UI路径），完整182、项目811、实机18与分源限制见[验收收口](2026-10-28-closing-support-final-validation.md)。
2. 初次既有工具停在预检，pushes=0：Git exit128/uncertain_transport，命令行API失败；连接器读取可用。只读对照发现Git实际使用本机17989代理，该端口TCP connection_refused；没有代理前台/核心进程，仅已有clash-verge-service运行。
3. 从本机已安装应用登记核实C:/Program Files/Clash Verge/clash-verge.exe，后台启动该现有程序一次（窗口隐藏），未安装、未修改认证/节点/共享Git或证书配置。其核心verge-mihomo实际只监听127.0.0.1:7897，证明与Git保存的17989不一致。
4. 仅在新交付子进程使用GIT_CONFIG_COUNT的http.proxy/目标GitHub代理覆盖及HTTP(S)_PROXY=本机7897。只读对照Git成功读取当前main，命令行API成功返回目标分支matching-refs空数组。未写全局/common-dir配置或保存新代理凭据。
5. 沿用同一既有工具/精确SHA，实际push **一次**；工具在31008ms触发固定默认30秒等待上限，pushCategory=timeout。工具的独立API/Git核实均未成功，状态LOCAL_PASS_REMOTE_UNVERIFIED、retry=false；没有第二次push。
6. 随后仅一次独立连接器核对返回“该分支无可解析commit”（422），没有可证明的远端a027目标。不创建PR、不运行Hosted CI，不将网络读通描述成推送可靠或永久恢复。

现有a027之前历史Git退出1的全部根因仍未证明；本次明确证实的是本机代理未运行/旧端口失配，以及本次上传被工具30秒时限中止。不能据此断言增加超时就一定成功，也不能以读取通过解除所有旧安全停止。

## 原件与恢复点

私密脱敏回执在outputs/approved-support-flow-20261028：support-git-delivery-authorized.log（预检0）、support-git-diagnose-authorized.log、support-existing-proxy-launch.json、support-proxy-process-comparison.json、support-git-delivery-process-proxy.log（实际push1）。无token、Authorization、Cookie、代理密码或raw trace写入仓库。

实际发送目标仍a027；本记录之后若有文档提交，不冒称已经发送新HEAD。精确授权的一次实际push已用完。本轮没有新PR/CI/合并/部署、真实Source或既有账号/业务数据库操作。此前仅PR130的已完成merge授权保持原边界。

后续可先离线评估既有交付工具的有界上传时间预算，保持单次push、fresh本地证据、远端祖先关系与独立SHA核实；不得以绕过预检、文件API伪造commit、换认证、关闭证书或无限重试解决。新的实际上传须有可适用的明确次数/目标授权，不重复消耗本次许可。

当前实机仍为a198产品的[独立合成体验](http://closing-current.localhost:52251/closing-center?year=2027)，用户输入和所有旧环境保持。临时演示不等于持久正式切换。完整Server收敛Goal继续，远端待交付不能误写为产品测试失败或整体完成。
