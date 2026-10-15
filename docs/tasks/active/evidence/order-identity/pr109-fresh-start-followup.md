# PR109 第二处 CI 迁移清单修复

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5，feat/order-identity-and-contract-claim；起点b4973670f6b7fd28327e6ae8a6e9869c51012b13/clean。Source run38660637415已通过独立Source读取（包括Linux专用）、身份、持续来源、预检、只读审计和定向诊断，随后fresh-start两项断言13!=12失败（7项4PASS/3FAIL含parent）。不是原修复未生效，也不能因前半通过声称整个CI已通过。

fresh-start原先写死12、最后0012及rerun12；现使用显式本分支版本清单1–12/14，同时断言实际应用与ledger、最后0014、初始化及重复启动仅技术白名单、无业务/legacy seed、allocator未消费，rerun逐版本一致。相关测试名称更新，不动态接受任意新迁移，不改产品/SQL/初始化逻辑。

本机test:fresh-start7/7 PASS；schema13行，权限62、单技术管理员/角色/绑定，所有业务表0。原P6真实构建浏览器9/9 PASS：session深链/退出、1440/1280/390、角色四流、持续刷新、失败清事实与focus恢复、不回退Browser。未为了测试增加管理员业务数据或跳过保护。

按rg核查当前schema_migrations通用期望，无其他同类12断言；固定旧迁移/只读激活协议的9或8等历史范围未擅自扩展。最终新head门禁/CI另核实；不修改真实账号/DB/Source范围、宁波或18443/18444，不自动合并部署。旧失败、提交和证据保留。
