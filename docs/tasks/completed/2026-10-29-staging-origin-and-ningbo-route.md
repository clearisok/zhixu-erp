# staging Origin 协议与宁波 Tunnel 准备核对

2026-10-29；应用源 main **5c8cb8037376288aa71043e799a057e21f1b985d**、镜像 **80ff7e5318e0f9345cdb63715d2c6e6f4eb2087dc34527abc942056e39d85ff8**；运维配置源 **015dec7409e6109b9adbd638624d28dfd6ebc7f0**。二者分别记录，不把后继配置冒称已进入 main 镜像。本片没有产品、SQL、权限、UI 或依赖变更，没有 GitHub 上传、CI 重跑、合并或部署。

## 新增实际协议验收

使用独立合成 project `zhixu-quote-trial-protocol-5b16a665dd`，入口 `https://localhost:56810`；新目录、新五服务、四持久卷及两个不重叠 /28 网络。原 prepare/init/start 各一次。请求在验证 localhost CA/主机名的同时发送 staging Host/Origin，模拟 Tunnel 至本机网关这一段协议，不修改 DNS、hosts、系统信任或公网路由。

十项实际断言通过：配置区分公网浏览器 Origin 与 loopback 探针；HTTPS 健康；匿名访问拒绝；loopback/foreign/null Origin 拒绝且不签发 cookie；缺显式写请求标记拒绝；正确 staging Host/Origin 登录；host-only Secure/HttpOnly/SameSite=Strict cookie；授权空订单读取；错误 TLS 主机名拒绝；注销清 cookie 并撤销会话。最后只读确认订单、报价、Source profile 均为 0。十项中的相关断言合并计数，以机器回执为准。

**保留收尾失败**：原适配脚本在十项通过后调用 trial 未支持的 `stop`，未停止服务。原失败回执不覆盖，SHA256 `beb49f82fe331a53174140b1008dc8911ebfeafa43629c1b932e22caa79562a1`。按现有模型、镜像/config hash、五个服务归属精确校验后，仅停止本 project 五服务；容器、四卷和证据全部保留，未重跑协议。收尾前后真实两合同目标的五服务 ID、镜像、启动时间和运行状态一致。最终状态为 `PASS_WITH_DOCUMENTED_OPERATOR_FINALIZATION`，不是原命令无失败。

实际 Source 请求 **0**、真实凭据访问 **0**。本结果不证明 Cloudflare 公网路由、浏览器接受、附件公网传输或宁波部署通过。完整私有本机回执保留于 outputs 及该新目录；[安全总结](2026-10-29-staging-origin-and-ningbo-route/validation-summary.json)仅保留允许公开的字段。

## 宁波只读观察与部署选择

03:55–03:59Z，使用既有 SSH 别名及严格主机校验：未发现 nginx/caddy 二进制或 routing 容器；`cloudflared.service` 已加载且 active，进程同时有 tailscaled。unit 仅观察到 token flag、未观察到 config flag 或本地 ingress 文件；未返回 token 值、未查询业务 DB、未修改服务/文件/路由。拟独立目录 `/home/jackson/weaveops-staging-preview` 不存在且父目录可写，未创建。3003 是否可用在实际执行前重核，未预占。

**推断而非已核实路由**：这些观察符合远程管理 Tunnel，不能据此得知实际 published application 配置或 staging 的 Access/WAF/上传限制。沿用现有 Tunnel，仅准备 staging 这一条映射；无需因没有 nginx 就增加 nginx 或另建 Tunnel。旧 prod/staging 服务和路由保持原状。

部署审批前冻结：新 main/source/image/build-info、canonical migrations、独立 project/DB/对象/密钥卷、loopback HTTPS 端口、精确 staging Origin、备份/恢复位置及停止方案。Tunnel service 指向新 loopback HTTPS；originServerName 与源站证书 SAN 对应，私有 CA 使用 caPool，保留 TLS 验证，不将 service URL 指回公网域名。Cloudflare 相关语义依据[官方源站参数](https://developers.cloudflare.com/tunnel/reference/origin-parameters/)及[HTTPS 源站排障](https://developers.cloudflare.com/tunnel/troubleshooting/https-origins/)。具体路由权限/配置仍须另核；不读取现有 token 来代替控制台授权。

公开前后分别验证：新入口 build-info、Host/Origin、登录/注销/会话、金额权限、附件上传/下载字节与 SHA、实际上传限制；失败停止新候选并保留数据。路由切回旧应用不等于新数据回退。新 Source 初始化与请求额度按新目标单独审批，不能跨用已消费本机窗口。

## 完整目标剩余项，避免重复执行

| Gate | 当前证据 | 未完成 / 下一步 |
| --- | --- | --- |
| 0–3 | 规则/资产盘点；#131 已 merge；main 镜像恢复 9/9；旧导航与角色验收 | #132 精确 merge 许可待答，获准后重核 refs；本地文档 head 不借旧 CI |
| 4 | 两真实合同首绑、颜色尺码、三代物料和独立货款 API 读回；SO/颜色前后不变 | 用户核对数量/单位与历史入口；不将过期快照冒称实时 |
| 5 | 已合并正式报价来源、采用/订单独立商业版本；同 SO 合成跨域回归 | 真实订单尚无报价/价格，不补造历史确认价 |
| 6 | Server 资源/排单/完成及原执行方归属已合并，同 SO 合成验证与恢复覆盖 | 两真实合同没有生产执行；由实际用户操作确认，不自动填产出 |
| 7 | 原 garment 控制/目标/原 CLI、合成发布/读回已验证 | 新 D1933→唯一 C1/C0/C1 固定读取仍待具体许可，当前请求 0；后续接纳范围不能靠款号推断 |
| 8 | 创建默认归月、部分/整单调月、CNY 销售/USD 加工、冻结保护及同 SO 合成锁定 | 真实库仅默认月份计划，非收入；没有真实财务采用/确认/锁定，不能声称真实关账闭环 |
| R / 发布 | 旧资产保留、精确镜像恢复；本片新增本机 staging Origin 协议正控 | 最终 main 镜像、公网/附件/人工接受、新宁波目标审批和路由切换待做；旧写路径退役不等于删除旧资产 |

本片不重复既有 182 发布、9/9 恢复、成功 CI 或同 SO 业务测试。目标仍为完整 Gate0–8/R；有限体验可以明确展示空/未完成业务，但不能改称完整真实生产/出货/关账已闭环。当前没有宣布 staging 就绪。
