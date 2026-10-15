# PR109 七角色页面验收查漏

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5，feat/order-identity-and-contract-claim，从a40cb7de382146748e18f7e8b8ea3acd9108c96a/clean继续。该精确head Source run38661297828已全通过（包括Linux），baseline run38661297886通过；team-access run38661297844的类型/lint/root与领域组通过，最后UI旧断言7!=6失败（5项3PASS/2FAIL含parent）。不能以两绿掩盖第三项失败。

测试原按TEAM_ROLES实际创建7人，却写死写请求6；非管理员循环只测原index1–4，漏掉财务和新增跟单。现先断言已批准七个role ID完整精确顺序，再逐账号实际角色查PG，所有6个非管理员在财务禁用之前通过真实登录页面验证无管理权限；最后重新登录合成root执行移动端禁用/重置。密码不入浏览器存储、无Browser权限回退和真实session断言保留，不改变产品权限或账号。

按团队workflow的disabled-order Server/session/writable候选构建，team-access-ui5/5、server-auth-frontend112/112、animated-login-ui10/10通过。新七角色截图名使用新标识，未设置截图写入flag，没有覆盖旧PNG/hash。所有账号仅一次性合成PG，不修改真实账号/数据库/Source或部署。

修复为测试覆盖收口，不改SQL/业务/UI实现。最终新head门禁和远端三项CI继续核实，未自动合并。旧失败及前两次修复证据完整保留。
