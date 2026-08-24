import type { AttachmentReference, Quote, QuoteRevision } from "./quote-view-model.ts";

export type AttachmentKind = "image" | "file";

export type AttachmentViewModel = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  storageKey?: string;
  createdAt: string;
  createdBy: string;
  /** @deprecated 仅用于兼容旧 mock URL 附件。 */
  legacyUrl?: string;
};

export const supportedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const supportedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

export function isSupportedImageAttachment(file: Pick<File, "name" | "type">): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return supportedImageMimeTypes.has(file.type.toLowerCase()) || supportedImageExtensions.has(extension);
}

export function isVideoAttachment(file: Pick<File, "type">): boolean {
  return file.type.toLowerCase().startsWith("video/");
}

export function canPreviewAttachment(attachment: Pick<AttachmentViewModel, "kind">): boolean {
  return attachment.kind === "image";
}

export function legacyAttachmentViewModel(reference: AttachmentReference, kind: AttachmentKind): AttachmentViewModel {
  return {
    id: reference.id,
    name: reference.fileName,
    mimeType: reference.fileType,
    size: 0,
    kind,
    createdAt: "",
    createdBy: "",
    legacyUrl: reference.url,
  };
}

export function revisionAttachmentIds(revision: QuoteRevision): string[] {
  return [...revision.imageAttachmentIds, ...revision.fileAttachmentIds];
}

export function normalizeRevisionAttachmentReferences(revision: QuoteRevision): QuoteRevision {
  const legacyImageIds = revision.garmentMedia?.map((attachment) => attachment.id) ?? [];
  const legacyFileIds = revision.quoteDocuments?.map((attachment) => attachment.id) ?? [];
  const imageAttachmentIds = revision.imageAttachmentIds ?? legacyImageIds;
  const fileAttachmentIds = revision.fileAttachmentIds ?? legacyFileIds;
  return {
    ...revision,
    imageAttachmentIds,
    fileAttachmentIds,
    styleImageAttachmentId: revision.styleImageAttachmentId ?? imageAttachmentIds[0] ?? null,
  };
}

function assertRevisionMutable(revision: QuoteRevision) {
  if (revision.readOnly) throw new Error("历史报价版本附件只读，不能修改附件关系。");
}

export function addAttachmentToRevision(revision: QuoteRevision, attachment: AttachmentViewModel): QuoteRevision {
  assertRevisionMutable(revision);
  if (attachment.kind === "image") {
    const imageAttachmentIds = revision.imageAttachmentIds.includes(attachment.id)
      ? revision.imageAttachmentIds
      : [...revision.imageAttachmentIds, attachment.id];
    return {
      ...revision,
      imageAttachmentIds,
      styleImageAttachmentId: revision.styleImageAttachmentId ?? attachment.id,
    };
  }
  return {
    ...revision,
    fileAttachmentIds: revision.fileAttachmentIds.includes(attachment.id)
      ? revision.fileAttachmentIds
      : [...revision.fileAttachmentIds, attachment.id],
  };
}

export function setRevisionStyleImage(revision: QuoteRevision, attachmentId: string): QuoteRevision {
  assertRevisionMutable(revision);
  if (!revision.imageAttachmentIds.includes(attachmentId)) throw new Error("只能将当前报价版本中的图片设为款式图。");
  return { ...revision, styleImageAttachmentId: attachmentId };
}

export function attachmentNeedsDeleteConfirmation(revision: QuoteRevision, attachmentId: string): boolean {
  return revision.styleImageAttachmentId === attachmentId;
}

export function removeAttachmentFromRevision(revision: QuoteRevision, attachmentId: string): QuoteRevision {
  assertRevisionMutable(revision);
  return {
    ...revision,
    imageAttachmentIds: revision.imageAttachmentIds.filter((id) => id !== attachmentId),
    fileAttachmentIds: revision.fileAttachmentIds.filter((id) => id !== attachmentId),
    styleImageAttachmentId: revision.styleImageAttachmentId === attachmentId ? null : revision.styleImageAttachmentId,
    garmentMedia: revision.garmentMedia?.filter((attachment) => attachment.id !== attachmentId),
    quoteDocuments: revision.quoteDocuments?.filter((attachment) => attachment.id !== attachmentId),
  };
}

export function quoteReferencesAttachment(quote: Quote, attachmentId: string, excludingRevisionId?: string): boolean {
  return quote.revisions.some((revision) => revision.revisionId !== excludingRevisionId && revisionAttachmentIds(revision).includes(attachmentId));
}

export function adjacentPreviewAttachmentId(imageIds: string[], currentId: string, direction: -1 | 1): string | null {
  if (!imageIds.length) return null;
  const currentIndex = imageIds.indexOf(currentId);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  return imageIds[(safeIndex + direction + imageIds.length) % imageIds.length] ?? null;
}

export function createAttachmentId(kind: AttachmentKind): string {
  return `${kind === "image" ? "IMG" : "FILE"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function pastedImageExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  return "png";
}

export function createPastedImageFileName(mimeType: string, now = new Date(), existingNames: string[] = []): string {
  const stamp = `${now.getFullYear()}${padDatePart(now.getMonth() + 1)}${padDatePart(now.getDate())}-${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}${padDatePart(now.getSeconds())}`;
  const extension = pastedImageExtension(mimeType);
  const base = `pasted-image-${stamp}`;
  const used = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()));
  let suffix = 1;
  let candidate = `${base}-${String(suffix).padStart(3, "0")}.${extension}`;
  while (used.has(candidate.toLocaleLowerCase())) {
    suffix += 1;
    candidate = `${base}-${String(suffix).padStart(3, "0")}.${extension}`;
  }
  return candidate;
}

export function pastedImageFilesFromClipboard(
  items: ArrayLike<Pick<DataTransferItem, "kind" | "type" | "getAsFile">>,
  existingNames: string[] = [],
  now = new Date(),
): File[] {
  const files: File[] = [];
  const usedNames = [...existingNames];
  for (const item of Array.from(items)) {
    if (item.kind !== "file" || !item.type.toLowerCase().startsWith("image/")) continue;
    const source = item.getAsFile();
    if (!source) continue;
    const name = createPastedImageFileName(source.type || item.type, now, usedNames);
    files.push(new File([source], name, {
      type: source.type || item.type,
      lastModified: now.getTime(),
    }));
    usedNames.push(name);
  }
  return files;
}

/** @deprecated 使用 pastedImageFilesFromClipboard 处理一次粘贴中的全部图片。 */
export function pastedImageFileFromClipboard(
  items: ArrayLike<Pick<DataTransferItem, "kind" | "type" | "getAsFile">>,
  existingNames: string[] = [],
  now = new Date(),
): File | null {
  return pastedImageFilesFromClipboard(items, existingNames, now)[0] ?? null;
}

export function imageFilesFromDrop(files: ArrayLike<File>): { images: File[]; rejected: File[] } {
  const images: File[] = [];
  const rejected: File[] = [];
  for (const file of Array.from(files)) {
    if (file.type.toLowerCase().startsWith("image/") && isSupportedImageAttachment(file)) images.push(file);
    else rejected.push(file);
  }
  return { images, rejected };
}
