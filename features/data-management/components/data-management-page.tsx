"use client";

import { useRef, useState } from "react";
import { AppShell, Button, FormSection, Modal, PageContainer, PageHeader, ReadOnlyField, Toast } from "@/components/foundation";
import { usePermissions } from "@/features/permissions";
import { buildInfo } from "@/features/runtime/build-info";
import type { BackupSummary, LocalDataBackup } from "../model/data-backup";
import { browserLocalDataStore, LOCAL_DATA_SCHEMA_VERSION } from "../repository/local-data-store";
import {
  backupSummary,
  exportLocalDataBackup,
  RESET_ALL_LOCAL_DATA_CONFIRMATION,
  resetAllLocalBusinessData,
  restoreLocalDataBackup,
  validateLocalDataBackup,
} from "../service/data-management-service";

export function DataManagementPage() {
  const { can } = usePermissions();
  const manageable = can("settings.global.edit");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pendingBackup, setPendingBackup] = useState<LocalDataBackup | null>(null);
  const [pendingSummary, setPendingSummary] = useState<BackupSummary | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const exportBackup = async () => {
    if (!manageable || busy) return;
    setBusy(true);
    try {
      const backup = await exportLocalDataBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `zhixu-erp-backup-${backup.createdAt.replaceAll(":", "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      const materialRecords = backup.styleProgress.batches.length + backup.styleProgress.rawSnapshots.length + backup.styleProgress.demands.length + backup.styleProgress.purchaseEvents.length + backup.styleProgress.inboundEvents.length + backup.styleProgress.shipmentEvents.length + backup.styleProgress.outboundEvents.length;
      setToast(`备份已导出：${backup.attachments.length} 个附件 · ${backup.templates.length} 个自定义模板 · ${materialRecords} 条款式进度记录`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "备份导出失败");
    } finally { setBusy(false); }
  };

  const chooseBackup = async (file: File | null) => {
    if (!file) return;
    try {
      const backup = validateLocalDataBackup(JSON.parse(await file.text()) as unknown);
      setPendingBackup(backup);
      setPendingSummary(backupSummary(backup));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "备份文件无法读取");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const restore = async () => {
    if (!pendingBackup || !manageable || busy) return;
    setBusy(true);
    try {
      await restoreLocalDataBackup(pendingBackup);
      setPendingBackup(null);
      setPendingSummary(null);
      window.location.reload();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "备份恢复失败，原数据已回滚");
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!manageable || busy || resetConfirmation !== RESET_ALL_LOCAL_DATA_CONFIRMATION) return;
    setBusy(true);
    try {
      await resetAllLocalBusinessData(resetConfirmation);
      window.location.reload();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "重置失败");
      setBusy(false);
    }
  };

  return <AppShell title="数据管理"><PageContainer>
    <PageHeader eyebrow="LOCAL DATA SAFETY" title="数据管理" description="管理当前浏览器 Origin 中的长期验收数据。3000 与 3001 默认互相隔离，可通过备份文件复制。" />
    <div className="qc-data-management-stack">
      <FormSection className="qc-data-management-section" title="备份与恢复" description="导出完整本地数据，或在预检备份摘要后恢复到当前 Origin。" columns={3} actions={<div className="qc-data-management-actions"><Button disabled={!manageable || busy} onClick={exportBackup}>导出测试数据</Button><Button variant="secondary" disabled={!manageable || busy} onClick={() => inputRef.current?.click()}>导入测试数据</Button></div>}>
        <ReadOnlyField label="环境" value={buildInfo.environment} secondary="DEV / PROD 按 Origin 隔离" />
        <ReadOnlyField label="Schema" value={`v${LOCAL_DATA_SCHEMA_VERSION}`} secondary="仅允许向前、非破坏迁移" />
        <ReadOnlyField label="命名空间" value={<code>{browserLocalDataStore.namespace}</code>} secondary="不会因 Build 或 HMR 清理" />
        <p className="qc-data-management-scope">包含报价、订单、排单、关账、艾诺科同步、款式进度 ImportBatch / Raw Snapshot / 物料需求与事件、基础资料、权限、OperationLog、附件 Blob 与自定义模板。</p>
        <input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={(event) => void chooseBackup(event.target.files?.[0] ?? null)} />
      </FormSection>
      <FormSection className="qc-data-management-section qc-data-danger-card" title="危险操作" description="重置会永久删除当前 Origin 的全部本地业务数据；建议先导出备份。" columns={1} actions={<Button variant="danger" disabled={!manageable || busy} onClick={() => setResetOpen(true)}>重置全部本地业务数据</Button>}>
        <p className="qc-data-management-scope">只有此处的完整口令二次确认会执行清理。启动、HMR、Build、Docker rebuild 与 clean rebuild 均不会触发 Reset。</p>
      </FormSection>
    </div>
    <Modal open={Boolean(pendingBackup)} title="确认恢复备份" description="恢复会写入当前浏览器 Origin，并以备份内容替换当前本地数据。" onClose={() => { setPendingBackup(null); setPendingSummary(null); }} footer={<><Button variant="secondary" onClick={() => { setPendingBackup(null); setPendingSummary(null); }}>取消</Button><Button disabled={busy} onClick={() => void restore()}>确认恢复</Button></>}>
      {pendingSummary && <div className="qc-backup-summary"><p>备份时间：{new Date(pendingSummary.createdAt).toLocaleString("zh-CN")}</p><p>来源环境：{pendingSummary.environment}</p><p>{pendingSummary.localRecordCount} 组业务数据 · {pendingSummary.styleProgressRecordCount} 条款式进度记录 · {pendingSummary.attachmentCount} 个附件 · {pendingSummary.templateCount} 个自定义模板</p><strong>建议先导出当前数据，再执行恢复。</strong></div>}
    </Modal>
    <Modal open={resetOpen} title="危险操作：重置全部本地业务数据" description="该操作会删除当前 Origin 的报价、基础资料、设置、日志、附件和自定义模板，且无法撤销。" onClose={() => { setResetOpen(false); setResetConfirmation(""); }} footer={<><Button variant="secondary" onClick={() => { setResetOpen(false); setResetConfirmation(""); }}>取消</Button><Button variant="danger" disabled={busy || resetConfirmation !== RESET_ALL_LOCAL_DATA_CONFIRMATION} onClick={() => void reset()}>确认永久重置</Button></>}>
      <label className="qc-data-reset-confirm"><span>请输入“{RESET_ALL_LOCAL_DATA_CONFIRMATION}”进行二次确认</span><input className="qc-control" value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} autoComplete="off" /></label>
    </Modal>
    <Toast message={toast} />
  </PageContainer></AppShell>;
}
