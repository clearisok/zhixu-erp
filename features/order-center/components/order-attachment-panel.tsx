"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "@/components/foundation";
import { createAttachmentId, type AttachmentViewModel } from "@/features/quote-center/model/quote-attachments";
import { indexedDbAttachmentRepository } from "@/features/quote-center/repository/indexeddb-attachment-repository";
import type { SalesOrder } from "../model/order";

export function OrderAttachmentPanel({ order, readOnly, createdBy, onChange }: { order: SalesOrder; readOnly: boolean; createdBy: string; onChange: (order: SalesOrder) => void }) {
  const [attachments, setAttachments] = useState<AttachmentViewModel[]>([]);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = useMemo(() => [...order.imageAttachmentIds, ...order.fileAttachmentIds], [order.fileAttachmentIds, order.imageAttachmentIds]);
  useEffect(() => { let active = true; indexedDbAttachmentRepository.list(ids).then((rows) => active && setAttachments(rows)); return () => { active = false; }; }, [ids]);
  const upload = async (files: FileList | null, kind: "image" | "file") => {
    if (readOnly || !files?.length) return;
    const saved = await Promise.all(Array.from(files).map((file) => indexedDbAttachmentRepository.save(file, { id: createAttachmentId(kind), kind, createdAt: new Date().toISOString(), createdBy })));
    const imageAttachmentIds = kind === "image" ? [...order.imageAttachmentIds, ...saved.map((row) => row.id)] : order.imageAttachmentIds;
    const fileAttachmentIds = kind === "file" ? [...order.fileAttachmentIds, ...saved.map((row) => row.id)] : order.fileAttachmentIds;
    onChange({ ...order, imageAttachmentIds, fileAttachmentIds, styleImageAttachmentId: order.styleImageAttachmentId ?? (kind === "image" ? saved[0]?.id ?? null : null), updatedAt: new Date().toISOString() });
  };
  const download = async (attachment: AttachmentViewModel) => {
    const blob = await indexedDbAttachmentRepository.getBlob(attachment.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = attachment.name; anchor.click(); URL.revokeObjectURL(url);
  };
  const removeReference = (attachment: AttachmentViewModel) => onChange({ ...order, imageAttachmentIds: order.imageAttachmentIds.filter((id) => id !== attachment.id), fileAttachmentIds: order.fileAttachmentIds.filter((id) => id !== attachment.id), styleImageAttachmentId: order.styleImageAttachmentId === attachment.id ? null : order.styleImageAttachmentId, updatedAt: new Date().toISOString() });
  return <Card className="oc-attachment-card"><header><div><strong>附件</strong><small>与报价共用附件仓库，只保存引用，不复制文件。</small></div>{!readOnly && <div><Button variant="secondary" onClick={() => imageInput.current?.click()}>上传图片</Button><Button variant="secondary" onClick={() => fileInput.current?.click()}>上传文件</Button></div>}</header><input ref={imageInput} hidden type="file" accept="image/*" multiple onChange={(event) => void upload(event.target.files, "image")} /><input ref={fileInput} hidden type="file" multiple onChange={(event) => void upload(event.target.files, "file")} /><div className="oc-attachment-list">{attachments.map((attachment) => <article key={attachment.id}><span>{attachment.kind === "image" ? "图" : "件"}</span><div><strong>{attachment.name}</strong><small>{attachment.id}{order.styleImageAttachmentId === attachment.id ? " · 款式图" : ""}</small></div>{attachment.kind === "image" && !readOnly && <Button variant="text" onClick={() => onChange({ ...order, styleImageAttachmentId: attachment.id })}>设为款式图</Button>}<Button variant="text" onClick={() => void download(attachment)}>下载</Button>{!readOnly && <Button variant="text" onClick={() => removeReference(attachment)}>移除引用</Button>}</article>)}</div>{!attachments.length && <div className="oc-empty-inline">尚无附件</div>}</Card>;
}
