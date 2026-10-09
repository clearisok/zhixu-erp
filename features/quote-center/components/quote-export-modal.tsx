import { Button, Modal } from "@/components/foundation";

export type QuoteExportScope = "all" | "current";
export type QuoteExportGuardMode = "clean" | "dirty" | "new";

export function QuoteExportModal({
  open,
  revisionLabel,
  scope,
  guardMode,
  loading,
  onScopeChange,
  onClose,
  onExport,
  onExportSaved,
  onSaveAndExport,
  serverMode = false,
}: {
  open: boolean;
  revisionLabel: string;
  scope: QuoteExportScope;
  guardMode: QuoteExportGuardMode;
  loading: boolean;
  onScopeChange: (scope: QuoteExportScope) => void;
  onClose: () => void;
  onExport: () => Promise<void>;
  onExportSaved: () => Promise<void>;
  onSaveAndExport: () => Promise<void>;
  serverMode?: boolean;
}) {
  const primaryAction = guardMode === "clean" ? onExport : onSaveAndExport;
  const description = guardMode === "new"
    ? "新报价尚未形成可审计记录，请先保存报价后再导出。"
    : guardMode === "dirty"
      ? "当前报价存在未保存修改，请选择导出已保存版本，或保存后导出最新内容。"
      : "一个报价版本生成一个 Workbook；每个价格版本生成一个独立 Sheet。";
  return <Modal
    open={open}
    title="导出报价"
    description={description}
    onClose={() => { if (!loading) onClose(); }}
    onSubmit={primaryAction}
    className="qc-quote-export-modal"
    footer={<>
      <Button variant="secondary" disabled={loading} onClick={onClose}>取消</Button>
      {guardMode === "dirty" && <Button variant="secondary" disabled={loading} onClick={onExportSaved}>导出已保存版本</Button>}
      <Button type="submit" disabled={loading}>{loading ? "正在生成 Excel…" : guardMode === "clean" ? "导出 Excel" : "保存并导出"}</Button>
    </>}
  >
    <div className="qc-quote-export-form">
      {serverMode && <p>内置正式模板 · 导出已保存 Server 来源；不会读取 Browser 自定义模板。</p>}
      <div className="qc-export-revision"><span>报价版本</span><strong>{revisionLabel}</strong></div>
      <fieldset disabled={loading}>
        <legend>导出范围</legend>
        <label className={scope === "all" ? "is-selected" : ""}>
          <input type="radio" name="quote-export-scope" value="all" checked={scope === "all"} onChange={() => onScopeChange("all")} />
          <span><strong>全部价格版本</strong><small>每个价格版本生成一个 Sheet</small></span>
        </label>
        <label className={scope === "current" ? "is-selected" : ""}>
          <input type="radio" name="quote-export-scope" value="current" checked={scope === "current"} onChange={() => onScopeChange("current")} />
          <span><strong>当前价格版本</strong><small>只导出当前正在查看的价格版本</small></span>
        </label>
      </fieldset>
      {guardMode !== "clean" && <p className="qc-export-warning">{guardMode === "new" ? "请先保存报价后再导出。" : "未保存的修改不会包含在“导出已保存版本”中。"}</p>}
    </div>
  </Modal>;
}
