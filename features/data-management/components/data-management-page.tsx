"use client";

import { useRef, useState } from "react";
import { AppShell, Button, Card, Modal, PageContainer, PageHeader, Toast } from "@/components/foundation";
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
      setToast(`备份已导出：${backup.attachments.length} 个附件 · ${backup.templates.length} 个自定义模板`);
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
    <div className="qc-data-management-grid">
      <Card className="qc-data-management-card">
        <span className="eyebrow">BACKUP & RESTORE</span>
        <h2>本地数据备份</h2>
        <p>导出报价、Revision、PriceVersion、EstimateCost、品牌与物料、生产组、外发厂、关账设置、权限、操作日志、附件 Blob 与自定义模板。</p>
        <dl><div><dt>环境</dt><dd>{buildInfo.environment}</dd></div><div><dt>Schema</dt><dd>v{LOCAL_DATA_SCHEMA_VERSION}</dd></div><div><dt>命名空间</dt><dd><code>{browserLocalDataStore.namespace}</code></dd></div></dl>
        <div className="qc-data-management-actions"><Button disabled={!manageable || busy} onClick={exportBackup}>导出测试数据</Button><Button variant="secondary" disabled={!manageable || busy} onClick={() => inputRef.current?.click()}>导入测试数据</Button></div>
        <input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={(event) => void chooseBackup(event.target.files?.[0] ?? null)} />
      </Card>
      <Card className="qc-data-management-card qc-data-danger-card">
        <span className="eyebrow">DANGER ZONE</span>
        <h2>重置本地业务数据</h2>
        <p>只有此处的显式二次确认会清空当前 Origin 的本地业务数据。启动、HMR、Build、Docker rebuild 与 clean rebuild 都不会触发。</p>
        <Button variant="danger" disabled={!manageable || busy} onClick={() => setResetOpen(true)}>重置全部本地业务数据</Button>
      </Card>
    </div>
    <Modal open={Boolean(pendingBackup)} title="确认恢复备份" description="恢复会写入当前浏览器 Origin，并以备份内容替换当前本地数据。" onClose={() => { setPendingBackup(null); setPendingSummary(null); }} footer={<><Button variant="secondary" onClick={() => { setPendingBackup(null); setPendingSummary(null); }}>取消</Button><Button disabled={busy} onClick={() => void restore()}>确认恢复</Button></>}>
      {pendingSummary && <div className="qc-backup-summary"><p>备份时间：{new Date(pendingSummary.createdAt).toLocaleString("zh-CN")}</p><p>来源环境：{pendingSummary.environment}</p><p>{pendingSummary.localRecordCount} 组业务数据 · {pendingSummary.attachmentCount} 个附件 · {pendingSummary.templateCount} 个自定义模板</p><strong>建议先导出当前数据，再执行恢复。</strong></div>}
    </Modal>
    <Modal open={resetOpen} title="危险操作：重置全部本地业务数据" description="该操作会删除当前 Origin 的报价、基础资料、设置、日志、附件和自定义模板，且无法撤销。" onClose={() => { setResetOpen(false); setResetConfirmation(""); }} footer={<><Button variant="secondary" onClick={() => { setResetOpen(false); setResetConfirmation(""); }}>取消</Button><Button variant="danger" disabled={busy || resetConfirmation !== RESET_ALL_LOCAL_DATA_CONFIRMATION} onClick={() => void reset()}>确认永久重置</Button></>}>
      <label className="qc-data-reset-confirm"><span>请输入“{RESET_ALL_LOCAL_DATA_CONFIRMATION}”进行二次确认</span><input className="qc-control" value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} autoComplete="off" /></label>
    </Modal>
    <Toast message={toast} />
  </PageContainer></AppShell>;
}
