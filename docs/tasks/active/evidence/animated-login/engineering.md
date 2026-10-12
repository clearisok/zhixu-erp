# 正式动画登录工程证据（冻结快照）

核实日期：2026-10-12；main db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e；任务 feat/animated-login。GitHub 是实时事实源。此文件冻结后不原位刷新；新状态写后续证据，manifest 追加新 ID。

## 已确认事实
- GitHub API 再核实 PR99 merged=true，merged_at=2026-10-12T09:27:54Z，merge_commit_sha=db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e。
- PR100 open/merged=false，head ba6ec973c4e7c5d884505990cb1db2e1d5861de7；未纳入当前 main 或本登录分支。
- G1 5b55488cefdc47255302f6e043e5c65b18ba2878；最终生产页面源 G1b 0095b0e8448dfd336cf479ad82927b3f11fd9cae；既有报价测试的登录重定向适配 e0c5e4d900c991220a6e168a04bffdca0648c0ea。后续仅测试/文档/基线变化，不改变截图对应生产代码。
- 生产构建 buildId=20261012-191217，gitCommit=0095b0e8448dfd336cf479ad82927b3f11fd9cae，quoteAuthority=server，masterSettingsAuthority=server，identityMode=session，quoteWriterMode=writable。
- 用户指定参考 https://github.com/katavii/animated-login；核对 master 62f0b80c7694c3dfe07b39c7a85bdd832ff4bb15 的页面/角色源码。在线演示浏览器访问超时，未伪称在线截图对照成功。参考树无 LICENSE，API license=null；采用独立 CSS/React 实现，不复制其模拟 token/localStorage 登录或引入其依赖。
- /login 独立页面；仅受支持的正式 Server 业务页匿名访问会回跳；API/session/RBAC、业务 allowlist、真实 DB/账号不改变。当前实现与部署分别记录。

## 用户决定
2026-10-12 用户要求“要有正式的一个页面……路由……log in……我希望我的登录页有趣一点”，随后明确 katavii/animated-login。改版授权只覆盖登录页，成品视觉与业务人工验收仍未进行。D-107 中保留原话；未授权部署或合并。

## 隔离验证
| 检查 | 结果与边界 |
|---|---|
| TypeScript / lint / server:build | PASS |
| Browser 默认构建 + Server/session 显式构建 | PASS；静态导出含 /login |
| test:server-auth-frontend | 112/112 PASS；包括回跳攻击/循环与会话权限服务 |
| test:animated-login-ui | 10/10 PASS；真实 Node API、临时 PostgreSQL、私有 Chromium；错误密码、重复提交、429/断网、实际登录、HttpOnly、深链、退出失败、恢复失败、响应式、reduced-motion |
| test:team-access-ui | 5/5 PASS；六角色合成账号、管理权限/持久化/移动页通过 |
| root regression（初次） | 808/808 PASS；新增基线夹具断言与最终门禁以交付记录/CI 为准 |
| 扩展 Quote 全浏览器回归 | main 与候选均 69 PASS / 9 FAIL（8 子场景 + 父测试），见下方，不声称全项目 PASS |

截图全部来自上述生产构建与合成数据：login-1440.png、login-1024.png、login-768.png、login-390.png、login-320.png、login-password.png、login-error.png。已人工进行工程图像检查（不等于用户人工验收）。五宽度无横向溢出，控件点击区 >=44px，蓝色按钮计算样式与真实 CSS 加载一致。路由 CSS 限定 zx-login，不改变业务 CSS 顺序。

## main 对照发现
在独立临时目录从 git archive db30 导出未修改 main，以同样的 Server/session 构建和原测试运行；与候选失败集合完全相同：
1. linked processing / distribution 两个共享条款确认场景，等待“客户确认工价”超时。
2. 后续 linked PV 切换、币种漂移、XLSX/日志、409、network 五项因前置 fixture 权限/状态级联失败。
3. 无 estimate.view 导出等待“已生成并提供下载”超时。
根因仍待独立定位；未根据失败擅改报价业务、商业权限或 UI。结果和源路径见 quote-regression-comparison.json；两次都有 disposable PG/Chrome cleanup PASS。旧导航 helper 不允许 /login 重定向的首次失败已修正，不混入上述 A/B 对照。

另发现既有完整 UI harness 默认覆盖历史截图；已恢复本轮生成的历史增量，默认输出改至 gitignored outputs/quote-pr91-second-acceptance，保护冻结基线。未替换旧基线图片。

## 发布/复审边界
本登录能力 implemented=yes，isolatedTest=passed-historical；merged=false，humanAcceptance=not-run，sourceActivation=not-applicable；宁波/18443/18444 未部署、未变更。旧环境 sourceSha/imageId 只沿用历史观察，非本次复验。
代码范围内未发现新增鉴权/路由阻断；建议在成品视觉验收和当前 SHA CI 通过后合并登录 PR。全项目 Quote 扩展回归仍存在上述已复现的 main 问题，不能宣称全工程/上线 Gate PASS；与 PR100 组合后重跑业务流。
更新时机：新测试/视觉验收/合并/部署/真实来源事实改变时追加证据和新 manifest ID。
