# Issue165：全38项已切版，等待新版本完整备份与恢复核验

2026-11-24；main基线10b9a7d827e1c09f152ead58c21f26712d49a619。六原PR166—171最新提交三CI全成功；全38项组合PR172/a0a9c78c6cccbadf5e635dbb60169f7f87944644三CI全成功，十争议未实施。独立ops PR173的部署代码2ce1154e8d64370f513f566f9e15235f56dc7509三CI成功，后续仅追加证据文档，不改已部署代码。

[专项恢复与切版证据](tasks/active/ui165-staging-backup-recovery-2026-11-24.md)、[组合验收路径和38项清单](https://github.com/clearisok/zhixu-erp/blob/a0a9c78c6cccbadf5e635dbb60169f7f87944644/docs/tasks/active/ui165-staging-acceptance-2026-11-24.md)、[前阶段摘要](tasks/completed/2026-11-24-before-ui165-cutover/CURRENT_STATE.md)。

旧75的新zstd完整配对70c0a21e验证145表/13对象，九Gate通过且正常分钟tick恢复真实heartbeat；旧两次失败原字节保留。正式切版前58文件/manifest独立验证通过。

02:35Z仅Staging应用切至a0，镜像a0339f6b…，构建staging-material-a0a9c78c。DB/objects容器和四卷、schema/权限、23保护表/3用户/635当前订单身份hash保留，无migration/恢复/业务SQL改写。原自动同步规则不变；唯一旧Worker正常退出，新Worker仍待门禁。Production未操作，所有PR未合并。

当前正式新source配对089bb129（02:35:09Z）仍RUNNING/维护窗口。必须其完整前后快照、归档解码、对象/文件hash、cleanup、新九Gate及真实heartbeat通过，并只读验证实际Staging页面后才达到用户“打开Staging集中验收38项”的标准；现在尚未宣称完成。
