# PR #105 合并后，PR #106 重新对齐 main

核实日期：2026-10-13。GitHub main：`6abc4bebc59954b98a6e3f79f038f9574588390d`。PR #105 的精确 head `6844952d08cd3cf899c250e92b37808c30ba6ab4` 在 Source、Release baseline、First team access 三项 CI 成功后，按用户明确授权合并，merge commit `6abc4bebc59954b98a6e3f79f038f9574588390d`。First team access 首次运行的登录页深链浏览器测试遇到“Inspected target navigated or closed”，同一精确 head 的 failed-job rerun 通过；此处仅记录测试时序风险，不把它当成已修复的测试可靠性问题。

PR #106 的旧精确 head `a81bb34e991f8acb671c621a281fc71928fa8981` 曾在堆叠 base 6844952d08cd3cf899c250e92b37808c30ba6ab4 上通过手动 Source 与 Release baseline CI；本次 retarget main 后必须重新以 `6abc4bebc59954b98a6e3f79f038f9574588390d` 为精确 base 核验，不能复用旧 base 的结论。#106 仍 Draft，用户未授权合并。D-111 QtyUnit 仅只读映射；D-112 受控接纳新增合同是上线前要求，未实现。没有真实 Source 激活、账号/数据库修改或部署。

检查链接：[PR #105](https://github.com/clearisok/zhixu-erp/pull/105)，[PR #106](https://github.com/clearisok/zhixu-erp/pull/106)，[Source CI](https://github.com/clearisok/zhixu-erp/actions/runs/38350568029)，[Release baseline CI](https://github.com/clearisok/zhixu-erp/actions/runs/38350568091)，[First team access CI](https://github.com/clearisok/zhixu-erp/actions/runs/38350568053)。本文件随 main、PR、CI、环境或用户验收状态变化更新，不含真实合同号、物料身份或凭据。
