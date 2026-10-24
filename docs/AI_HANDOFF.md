# 恢复点：PR125合流至已批准新main

2026-10-24；root唯一writer、既有reviewer只读。先API核实main d1dd与#123 CB/三PR检查/预览树不变，按用户明确批准ready并merge #123为e01a11952b648024c0bd6bf4259de429374981e2，独立核实双父/树和保留分支；#121/#122由GitHub自动随祖先收口，没有手工merge/close其他PR。没有新增Actions。

7bf3由clean CI分支0ba正常切换新建codex/pr125-main-e01a-forward@e01a；原CI、1028和运行态ebe/4cf引用保留。一次标准fetch取到真实main对象，未改认证/TLS/共享配置，不能据此宣称旧push STOP根因已消失。正常merge原CA，仅五共享文档冲突。双方摘要按Git字节归档，完整证据并集229/46；真实merge955474fa已保存双父[e01a,CA]，用其Git父追加DECISION合流见证229/46，不伪造recordedAt或改旧ID。

下一步核对原17运维blob/main业务blob、新组合types/lint/Server、相关运维/API、两构建、134发布与精确e01a守卫，独立复审；先最小充分本地验证，最终集中交付不重复CI。新组合尚未验收；此前CA/CB失败与通过按原源码范围保留在任务/归档。当前无Docker/DB/凭据/Source操作，未经批准不升级旧目标或部署。

完整Goal继续，关账三问未答不默认；#125仍草稿且未获merge授权。其余Source范围/target激活、50426切换、coverage-v1及资产退役不扩大。
