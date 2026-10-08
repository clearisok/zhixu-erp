"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { Button, Card, FloatingMenu, FormItem, Modal } from "@/components/foundation";
import {
  adjacentPreviewAttachmentId,
  attachmentNeedsDeleteConfirmation,
  imageFilesFromDrop,
  pastedImageFilesFromClipboard,
  isSupportedImageAttachment,
  isVideoAttachment,
  legacyAttachmentViewModel,
  renamedAttachmentFileName,
  type AttachmentKind,
  type AttachmentViewModel,
} from "../model/quote-attachments";
import type { AttachmentReference, QuoteRevision } from "../model/quote-view-model";
import { browserQuoteAttachmentController, type AttachmentSnapshot, type QuoteAttachmentController } from "../model/quote-attachment-controller";
import { isBrowserQuoteFrozen } from "../authority/quote-writer-mode";

type AttachmentAsset = { attachment: AttachmentViewModel; url: string };

function legacyReference(revision: QuoteRevision, attachmentId: string): AttachmentReference | undefined {
  return [...(revision.garmentMedia ?? []), ...(revision.quoteDocuments ?? [])].find((attachment) => attachment.id === attachmentId);
}

export function useAttachmentAsset(attachmentId: string | null, legacy?: AttachmentReference, controller: QuoteAttachmentController = browserQuoteAttachmentController): AttachmentAsset | null {
  const [storedAsset, setStoredAsset] = useState<AttachmentAsset | null>(null);
  const legacyUrl = legacy?.url;
  const legacyId = legacy?.id;
  const legacyName = legacy?.fileName;
  const legacyType = legacy?.fileType;
  const legacyAsset = attachmentId && legacyUrl && legacyId && legacyName && legacyType
    ? { attachment: legacyAttachmentViewModel({ id: legacyId, fileName: legacyName, fileType: legacyType, url: legacyUrl }, "image"), url: legacyUrl }
    : null;

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    if (!attachmentId || legacyUrl) return;
    Promise.all([controller.get(attachmentId), controller.blob(attachmentId)]).then(([attachment, blob]) => {
      if (disposed || !blob || !attachment) return;
      objectUrl = URL.createObjectURL(blob);
      setStoredAsset({ attachment, url: objectUrl });
    }).catch(() => setStoredAsset(null));
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId, legacyUrl, controller]);

  if (legacyAsset) return legacyAsset;
  return storedAsset?.attachment.id === attachmentId ? storedAsset : null;
}

function formatFileSize(size: number): string {
  if (size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatCreatedAt(createdAt: string): string {
  if (!createdAt) return "—";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function fileTypeLabel(attachment: AttachmentViewModel): string {
  const extension = attachment.name.split(".").pop()?.toUpperCase();
  return extension || attachment.mimeType || "文件";
}

async function downloadAttachment(attachment: AttachmentViewModel, controller: QuoteAttachmentController) {
  let url = attachment.legacyUrl ?? "";
  let revoke = false;
  if (!url) {
    const blob = await controller.blob(attachment.id);
    if (!blob) throw new Error("附件内容不存在，无法下载。");
    url = URL.createObjectURL(blob);
    revoke = true;
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = attachment.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function AttachmentThumbnail({ attachment, onOpen, controller }: { attachment: AttachmentViewModel; onOpen: () => void; controller: QuoteAttachmentController }) {
  const legacy = attachment.legacyUrl ? { id: attachment.id, fileName: attachment.name, fileType: attachment.mimeType, url: attachment.legacyUrl } : undefined;
  const asset = useAttachmentAsset(attachment.id, legacy, controller);
  return <button type="button" className="qc-attachment-thumbnail" onClick={onOpen} aria-label={`预览 ${attachment.name}`}>
    {asset ? <Image src={asset.url} alt={attachment.name} fill sizes="(max-width: 620px) 42vw, 220px" unoptimized /> : <span>图片载入中</span>}
  </button>;
}

function AttachmentPreviewModal({ openId, images, onChange, onClose, controller, onDownloadError }: { openId: string | null; images: AttachmentViewModel[]; onChange: (id: string) => void; onClose: () => void; controller: QuoteAttachmentController; onDownloadError: (error: unknown) => void }) {
  const attachment = images.find((item) => item.id === openId) ?? null;
  const legacy = attachment?.legacyUrl ? { id: attachment.id, fileName: attachment.name, fileType: attachment.mimeType, url: attachment.legacyUrl } : undefined;
  const asset = useAttachmentAsset(attachment?.id ?? null, legacy, controller);
  const index = attachment ? images.findIndex((item) => item.id === attachment.id) : -1;
  const move = (direction: -1 | 1) => {
    if (!attachment) return;
    const id = adjacentPreviewAttachmentId(images.map((item) => item.id), attachment.id, direction);
    if (id) onChange(id);
  };

  return <Modal open={Boolean(attachment)} className="qc-attachment-preview-modal" title={attachment?.name ?? "图片预览"} description={attachment ? `${index + 1} / ${images.length}` : undefined} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={() => move(-1)} disabled={images.length <= 1}>上一张</Button>
    <Button variant="secondary" onClick={() => move(1)} disabled={images.length <= 1}>下一张</Button>
    <Button onClick={() => { if (attachment) void downloadAttachment(attachment, controller).catch(onDownloadError); }}>下载</Button>
  </>}>
    <div className="qc-attachment-preview-stage">
      {asset ? <Image src={asset.url} alt={attachment?.name ?? "图片预览"} fill sizes="90vw" unoptimized /> : <span>正在载入图片…</span>}
      {images.length > 1 && <><button type="button" className="qc-preview-arrow is-left" onClick={() => move(-1)} aria-label="上一张">‹</button><button type="button" className="qc-preview-arrow is-right" onClick={() => move(1)} aria-label="下一张">›</button></>}
    </div>
  </Modal>;
}

type QuoteAttachmentPanelProps = {
  revision: QuoteRevision;
  readOnly: boolean;
  createdBy: string;
  previewAttachmentId: string | null;
  onPreviewAttachmentIdChange: (id: string | null) => void;
  onChange: (revision: QuoteRevision) => void;
  onAttachmentRemoved: (attachmentId: string) => void;
  notify: (message: string) => void;
  controller?: QuoteAttachmentController;
  onServerSnapshot?: (snapshot: AttachmentSnapshot) => void;
  onMutationError?: (error: unknown) => void;
  onBusyChange?: (busy: boolean) => void;
};

export function QuoteAttachmentPanel({ revision, readOnly: requestedReadOnly, createdBy, previewAttachmentId, onPreviewAttachmentIdChange, onChange, onAttachmentRemoved, notify, controller = browserQuoteAttachmentController, onServerSnapshot, onMutationError, onBusyChange }: QuoteAttachmentPanelProps) {
  const readOnly = requestedReadOnly || (controller.mode === "browser" && isBrowserQuoteFrozen());
  const [tab, setTab] = useState<AttachmentKind>("image");
  const [attachments, setAttachments] = useState<AttachmentViewModel[]>([]);
  const [deleteStyleTarget, setDeleteStyleTarget] = useState<AttachmentViewModel | null>(null);
  const [renameTarget, setRenameTarget] = useState<AttachmentViewModel | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pasteFeedback, setPasteFeedback] = useState("");
  const [pasteDragActive, setPasteDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteAreaRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const pasteDragDepthRef = useRef(0);
  const notifyRef = useRef(notify);
  useEffect(() => { notifyRef.current = notify; }, [notify]);

  const loadAttachments = useCallback(() => controller.load(revision), [controller, revision]);

  useEffect(() => {
    let active = true;
    loadAttachments().then((resolved) => { if (active) setAttachments(resolved); }).catch((error) => {
      if (active) {
        setAttachments([]);
        if (controller.mode === "server") notifyRef.current(error instanceof Error ? `Server 附件读取失败：${error.message}` : "Server 附件读取失败；没有 Browser fallback。");
      }
    });
    return () => { active = false; };
  }, [loadAttachments, controller.mode]);

  const images = useMemo(() => revision.imageAttachmentIds.map((id) => attachments.find((attachment) => attachment.id === id)).filter((attachment): attachment is AttachmentViewModel => Boolean(attachment)), [attachments, revision.imageAttachmentIds]);
  const files = useMemo(() => revision.fileAttachmentIds.map((id) => attachments.find((attachment) => attachment.id === id)).filter((attachment): attachment is AttachmentViewModel => Boolean(attachment)), [attachments, revision.fileAttachmentIds]);

  const applySnapshot = (snapshot: AttachmentSnapshot) => {
    setAttachments(snapshot.attachments);
    if (controller.mode === "browser") onChange(snapshot.revision);
    else onServerSnapshot?.(snapshot);
  };
  const mutationFailed = (error: unknown, fallback: string) => {
    onMutationError?.(error);
    notify(error instanceof Error ? error.message : fallback);
  };
  const singleCommand = async (action: () => Promise<void>) => {
    if (readOnly || savingRef.current) return;
    savingRef.current = true;
    setUploading(true);
    onBusyChange?.(true);
    try { await action(); }
    finally { savingRef.current = false; setUploading(false); onBusyChange?.(false); }
  };

  const saveAttachments = async (kind: AttachmentKind, selected: File[]): Promise<number> => {
    if (!selected.length || readOnly || savingRef.current) return 0;
    const accepted = selected.filter((file) => {
      if (isVideoAttachment(file)) { notify(`不支持视频附件：${file.name}`); return false; }
      if (kind === "image" && !isSupportedImageAttachment(file)) { notify(`图片仅支持 JPG、JPEG、PNG、WEBP：${file.name}`); return false; }
      if (kind === "file" && isSupportedImageAttachment(file)) { notify(`图片请在“图片”页签上传：${file.name}`); return false; }
      return true;
    });
    if (!accepted.length) return 0;
    savingRef.current = true;
    setUploading(true);
    onBusyChange?.(true);
    try {
      const saved = await controller.upload(revision, accepted, kind, createdBy, applySnapshot);
      notify(`已上传 ${saved} 个${kind === "image" ? "图片" : "文件"}附件${kind === "image" && revision.styleImageAttachmentId === null ? "，第一张图片已设为款式图" : ""}`);
      return saved;
    } catch (error) {
      mutationFailed(error, "附件上传失败，请核对当前状态。");
      return 0;
    } finally {
      savingRef.current = false;
      setUploading(false);
      onBusyChange?.(false);
    }
  };

  const upload = async (kind: AttachmentKind, event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    await saveAttachments(kind, selected);
  };

  const pasteImage = async (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (readOnly || uploading) return;
    const files = pastedImageFilesFromClipboard(
      event.clipboardData.items,
      attachments.map((attachment) => attachment.name),
    );
    if (!files.length) {
      setPasteFeedback("未检测到图片，请复制图片后重试。");
      return;
    }
    setPasteFeedback(`检测到 ${files.length} 张图片，正在保存…`);
    const saved = await saveAttachments("image", files);
    setPasteFeedback(saved === files.length ? `已直接加入 ${saved} 张图片。` : "部分图片保存失败，请重试。");
  };

  const enterPasteArea = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (uploading) return;
    pasteDragDepthRef.current += 1;
    setPasteDragActive(true);
  };

  const leavePasteArea = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    pasteDragDepthRef.current = Math.max(0, pasteDragDepthRef.current - 1);
    if (pasteDragDepthRef.current === 0) setPasteDragActive(false);
  };

  const dropImages = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    pasteDragDepthRef.current = 0;
    setPasteDragActive(false);
    if (readOnly || uploading) return;
    const { images: droppedImages, rejected } = imageFilesFromDrop(event.dataTransfer.files);
    if (droppedImages.length) {
      setPasteFeedback(`正在保存 ${droppedImages.length} 张图片…`);
      const saved = await saveAttachments("image", droppedImages);
      setPasteFeedback(saved === droppedImages.length ? `已直接加入 ${saved} 张图片。` : "部分图片保存失败，请重试。");
    }
    if (rejected.length) setPasteFeedback("这里只支持图片，请在“文件”附件中上传。");
    else if (!droppedImages.length) setPasteFeedback("未检测到可添加的图片。");
  };

  const remove = (attachment: AttachmentViewModel) => singleCommand(async () => {
    applySnapshot(await controller.unlink(revision, attachment.id));
    if (previewAttachmentId === attachment.id) onPreviewAttachmentIdChange(null);
    if (controller.mode === "browser") onAttachmentRemoved(attachment.id);
    notify(`已删除附件“${attachment.name}”`);
  });

  const requestDelete = (attachment: AttachmentViewModel) => {
    if (attachmentNeedsDeleteConfirmation(revision, attachment.id)) setDeleteStyleTarget(attachment);
    else remove(attachment).catch((error) => mutationFailed(error, "附件移除失败，请核对当前状态。"));
  };

  const setStyleImage = async (attachment: AttachmentViewModel) => {
    try { await singleCommand(async () => { applySnapshot(await controller.style(revision, attachment.id)); notify(`已将“${attachment.name}”设为款式图`); }); }
    catch (error) { mutationFailed(error, "设置款式图失败，请核对当前状态。"); }
  };

  const safeDownload = (attachment: AttachmentViewModel) => downloadAttachment(attachment, controller).catch((error) => notify(error instanceof Error ? error.message : "附件下载失败。"));
  const openRename = (attachment: AttachmentViewModel) => {
    setRenameTarget(attachment);
    setRenameDraft(attachment.name);
  };
  const renameAttachment = async () => {
    if (!renameTarget) return;
    try {
      await singleCommand(async () => {
        const name = renamedAttachmentFileName(renameTarget.name, renameDraft);
        const snapshot = await controller.rename(revision, renameTarget, name);
        applySnapshot(snapshot);
        setRenameTarget(null);
        setRenameDraft("");
        notify(`图片名称已修改为“${name}”`);
      });
    } catch (error) {
      mutationFailed(error, "图片名称修改失败，请核对当前状态。");
    }
  };
  const active = tab === "image" ? images : files;

  return <Card className="qc-attachment-card">
    <header><div><span className="qc-section-index">03</span><div><h2>附件</h2><p>图片与报价资料随报价版本保存引用快照；历史版本始终只读。</p></div></div>{!readOnly && <div className="qc-attachment-header-actions">{tab === "image" ? <><Button title="上传图片" variant="secondary" disabled={uploading} onClick={() => imageInputRef.current?.click()}>{uploading ? "正在上传…" : "从相册选择"}</Button><Button variant="secondary" disabled={uploading} onClick={() => cameraInputRef.current?.click()}>拍照上传</Button><Button variant="secondary" disabled={uploading} onClick={() => { setTab("image"); window.requestAnimationFrame(() => pasteAreaRef.current?.focus()); }}>聚焦粘贴区</Button></> : <Button variant="secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? "正在上传…" : "上传文件"}</Button>}</div>}</header>
    <div className="qc-attachment-tabs" role="tablist" aria-label="附件类型"><button type="button" role="tab" aria-selected={tab === "image"} className={tab === "image" ? "is-active" : ""} onClick={() => setTab("image")}>图片（{revision.imageAttachmentIds.length}）</button><button type="button" role="tab" aria-selected={tab === "file"} className={tab === "file" ? "is-active" : ""} onClick={() => setTab("file")}>文件（{revision.fileAttachmentIds.length}）</button></div>
    <input ref={imageInputRef} className="qc-visually-hidden" type="file" accept="image/*" multiple onChange={(event) => upload("image", event)} />
    <input ref={cameraInputRef} className="qc-visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => upload("image", event)} />
    <input ref={fileInputRef} className="qc-visually-hidden" type="file" multiple onChange={(event) => upload("file", event)} />
    {uploading && <p className="qc-attachment-upload-status" role="status" aria-live="polite">正在保存附件，请勿重复操作…</p>}
    <div className="qc-attachment-content">
      {tab === "image" && !readOnly && <div ref={pasteAreaRef} className={`qc-direct-paste-area ${pasteDragActive ? "is-drag-active" : ""}`} tabIndex={0} role="region" aria-label="图片直接粘贴区域" onPaste={(event) => void pasteImage(event)} onDragEnter={enterPasteArea} onDragOver={(event) => event.preventDefault()} onDragLeave={leavePasteArea} onDrop={(event) => void dropImages(event)}><strong>{uploading ? "正在保存图片…" : "点击这里后直接 Ctrl + V"}</strong><span>仅在此区域获得焦点时接收剪贴板图片；支持一次粘贴或拖入多张。</span>{pasteFeedback && <small role="status">{pasteFeedback}</small>}</div>}
      {active.length === 0 && <div className="qc-attachment-empty"><strong>{tab === "image" ? "暂无图片" : "暂无文件"}</strong><span>{readOnly ? "该历史报价版本没有此类附件" : tab === "image" ? "上传款式图、细节图或面料图片" : "上传 PDF、Excel、Word 或其他报价资料"}</span></div>}
      {tab === "image" && images.length > 0 && <div className="qc-attachment-grid">{images.map((attachment) => <article key={attachment.id} className="qc-attachment-image-item">
        <AttachmentThumbnail attachment={attachment} controller={controller} onOpen={() => onPreviewAttachmentIdChange(attachment.id)} />
        <div className="qc-attachment-image-meta"><span title={attachment.name}>{attachment.name}</span>{revision.styleImageAttachmentId === attachment.id && <b>款式图</b>}</div>
        <FloatingMenu className="qc-attachment-more" menuClassName="qc-attachment-action-menu" trigger="•••" label={`${attachment.name} 更多操作`}>{!readOnly && (revision.styleImageAttachmentId === attachment.id ? <span>当前款式图</span> : <button type="button" disabled={uploading} onClick={() => void setStyleImage(attachment)}>设为款式图</button>)}{!readOnly && controller.canRename(attachment.id) && <button type="button" disabled={uploading} onClick={() => openRename(attachment)}>编辑名称</button>}{!readOnly && !controller.canRename(attachment.id) && <span>历史共享附件不可改名</span>}<button type="button" onClick={() => safeDownload(attachment)}>下载</button>{!readOnly && <button type="button" className="is-danger" disabled={uploading} onClick={() => requestDelete(attachment)}>删除</button>}</FloatingMenu>
      </article>)}</div>}
      {tab === "file" && files.length > 0 && <div className="qc-attachment-file-wrap"><table className="qc-attachment-file-table"><thead><tr><th>文件名</th><th>类型</th><th>大小</th><th>上传时间</th><th>上传人</th><th>操作</th></tr></thead><tbody>{files.map((attachment) => <tr key={attachment.id}><td><strong title={attachment.name}>{attachment.name}</strong></td><td>{fileTypeLabel(attachment)}</td><td>{formatFileSize(attachment.size)}</td><td>{formatCreatedAt(attachment.createdAt)}</td><td>{attachment.createdBy || "—"}</td><td><div className="qc-file-actions"><Button variant="text" onClick={() => safeDownload(attachment)}>下载</Button>{!readOnly && <button type="button" className="qc-file-delete" disabled={uploading} onClick={() => requestDelete(attachment)}>删除</button>}</div></td></tr>)}</tbody></table></div>}
    </div>
    <AttachmentPreviewModal openId={previewAttachmentId} images={images} controller={controller} onChange={onPreviewAttachmentIdChange} onClose={() => onPreviewAttachmentIdChange(null)} onDownloadError={(error) => notify(error instanceof Error ? error.message : "附件下载失败，请核对 Server 状态。") } />
    <Modal open={Boolean(deleteStyleTarget)} title="删除当前款式图？" description="该图片当前被设为款式图。删除后当前报价将暂无款式图。" onClose={() => setDeleteStyleTarget(null)} onSubmit={async () => { if (!deleteStyleTarget) return; try { await remove(deleteStyleTarget); setDeleteStyleTarget(null); } catch (error) { mutationFailed(error, "附件移除失败，请核对当前状态。"); } }} footer={<><Button variant="secondary" onClick={() => setDeleteStyleTarget(null)}>取消</Button><Button type="submit" variant="danger">确认删除</Button></>}><p className="qc-unsaved-message">确认后将删除附件关系，并把 styleImageAttachmentId 清空；不会自动指定另一张图片。</p></Modal>
    <Modal open={Boolean(renameTarget)} title="编辑图片名称" description="只修改附件显示名称；图片内容、附件 ID 与文件格式保持不变。" onClose={() => { setRenameTarget(null); setRenameDraft(""); }} onSubmit={renameAttachment} footer={<><Button variant="secondary" onClick={() => { setRenameTarget(null); setRenameDraft(""); }}>取消</Button><Button type="submit" disabled={!renameDraft.trim()}>保存名称</Button></>}><FormItem label="图片名称" required><input className="qc-control" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} autoFocus /></FormItem></Modal>
  </Card>;
}

export function revisionLegacyStyleReference(revision: QuoteRevision): AttachmentReference | undefined {
  return revision.styleImageAttachmentId ? legacyReference(revision, revision.styleImageAttachmentId) : undefined;
}
