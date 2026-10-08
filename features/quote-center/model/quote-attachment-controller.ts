import type { QuoteRevision } from "./quote-view-model";
import { assertBrowserQuoteWrite, isBrowserQuoteFrozen } from "../authority/quote-writer-mode";
import {
  legacyAttachmentViewModel, removeAttachmentFromRevision, setRevisionStyleImage,
  type AttachmentKind, type AttachmentViewModel,
} from "./quote-attachments";
import { saveQuoteAttachments } from "./quote-attachment-upload";
import { indexedDbAttachmentRepository } from "../repository/indexeddb-attachment-repository";
import { quoteAttachmentClient, type ServerAttachment } from "../server/quote-attachment-client";

export type AttachmentSnapshot = { revision: QuoteRevision; attachments: AttachmentViewModel[]; version?: number };
export type QuoteAttachmentController = {
  readonly mode: "browser" | "server";
  load(revision: QuoteRevision): Promise<AttachmentViewModel[]>;
  get(attachmentId: string): Promise<AttachmentViewModel | null>;
  blob(attachmentId: string): Promise<Blob | null>;
  upload(revision: QuoteRevision, files: File[], kind: AttachmentKind, createdBy: string, onProgress: (snapshot: AttachmentSnapshot) => void): Promise<number>;
  rename(revision: QuoteRevision, attachment: AttachmentViewModel, name: string): Promise<AttachmentSnapshot>;
  unlink(revision: QuoteRevision, attachmentId: string): Promise<AttachmentSnapshot>;
  style(revision: QuoteRevision, attachmentId: string | null): Promise<AttachmentSnapshot>;
  canRename(attachmentId: string): boolean;
};

export const browserQuoteAttachmentController: QuoteAttachmentController = {
  mode: "browser",
  async load(revision) {
    const ids = [...revision.imageAttachmentIds, ...revision.fileAttachmentIds];
    const stored = await indexedDbAttachmentRepository.list(ids);
    const byId = new Map(stored.map((item) => [item.id, item]));
    const legacyImages = new Map((revision.garmentMedia ?? []).map((item) => [item.id, legacyAttachmentViewModel(item, "image")]));
    const legacyFiles = new Map((revision.quoteDocuments ?? []).map((item) => [item.id, legacyAttachmentViewModel(item, "file")]));
    return ids.map((id) => byId.get(id) ?? legacyImages.get(id) ?? legacyFiles.get(id)).filter((item): item is AttachmentViewModel => Boolean(item));
  },
  blob: (id) => indexedDbAttachmentRepository.getBlob(id),
  get: (id) => indexedDbAttachmentRepository.get(id),
  async upload(revision, files, kind, createdBy, onProgress) {
    assertBrowserQuoteWrite();
    const saved = await saveQuoteAttachments({ revision, files, kind, repository: indexedDbAttachmentRepository, createdBy });
    onProgress({ revision: saved.revision, attachments: await this.load(saved.revision) });
    return saved.attachments.length;
  },
  async rename(revision, attachment, name) {
    assertBrowserQuoteWrite();
    await indexedDbAttachmentRepository.rename(attachment.id, name);
    return { revision, attachments: await this.load(revision) };
  },
  async unlink(revision, attachmentId) {
    assertBrowserQuoteWrite();
    const next = removeAttachmentFromRevision(revision, attachmentId);
    return { revision: next, attachments: await this.load(next) };
  },
  async style(revision, attachmentId) {
    assertBrowserQuoteWrite();
    const next = attachmentId === null ? { ...revision, styleImageAttachmentId: null } : setRevisionStyleImage(revision, attachmentId);
    return { revision: next, attachments: await this.load(next) };
  },
  canRename: () => !isBrowserQuoteFrozen(),
};

/** Quote-specific deletion boundary; other IndexedDB consumers retain their own authority. */
export async function deleteBrowserQuoteAttachment(id: string): Promise<void> {
  assertBrowserQuoteWrite();
  await indexedDbAttachmentRepository.delete(id);
}

function view(item: ServerAttachment): AttachmentViewModel {
  return { id: item.id, name: item.name, mimeType: item.mimeType, size: item.size,
    kind: item.kind, createdAt: item.createdAt, createdBy: item.createdBy };
}

export class PartialAttachmentBatchError extends Error {
  constructor(readonly completed: number, cause: unknown) {
    super(`已确认完成 ${completed} 个附件；后续操作结果可能已提交，批次不具备原子回滚。请核对 Server 当前状态。`);
    this.name = "PartialAttachmentBatchError";
    this.cause = cause;
  }
}

export function createServerQuoteAttachmentController(options: {
  quoteId: string; revisionId: string;
  getVersion(): number;
  onCommitted(snapshot: AttachmentSnapshot): void;
  isSharedWithHistorical(attachmentId: string): boolean;
  client?: typeof quoteAttachmentClient;
  token?: () => string;
}): QuoteAttachmentController {
  const client = options.client ?? quoteAttachmentClient;
  const token = options.token ?? (() => crypto.randomUUID());
  let latestVersion = options.getVersion();
  const list = () => client.list(options.quoteId, options.revisionId);
  const commit = async (revision: QuoteRevision, version: number): Promise<AttachmentSnapshot> => {
    const rows = await list();
    latestVersion = version;
    const next = { ...revision,
      imageAttachmentIds: rows.filter((item) => item.kind === "image").map((item) => item.id),
      fileAttachmentIds: rows.filter((item) => item.kind === "file").map((item) => item.id),
      styleImageAttachmentId: rows.find((item) => item.isStyleImage)?.id ?? null };
    const snapshot = { revision: next, attachments: rows.map(view), version };
    options.onCommitted(snapshot);
    return snapshot;
  };
  return {
    mode: "server",
    async load() { return (await list()).map(view); },
    async get(id) { return view(await client.read(options.quoteId, options.revisionId, id)); },
    blob: (id) => client.download(options.quoteId, options.revisionId, id),
    async upload(revision, files, kind, _createdBy, onProgress) {
      latestVersion = Math.max(latestVersion, options.getVersion());
      let current = revision;
      let completed = 0;
      // Each File receives one token before its request. Never mint another token for a network retry.
      for (const file of files) {
        const uploadToken = token();
        try {
          const result = await client.upload(options.quoteId, options.revisionId, latestVersion, file, kind, uploadToken);
          const snapshot = await commit(current, result.version);
          current = snapshot.revision;
          onProgress(snapshot);
          completed += 1;
        } catch (error) { throw new PartialAttachmentBatchError(completed, error); }
      }
      return completed;
    },
    async rename(revision, attachment, name) {
      latestVersion = Math.max(latestVersion, options.getVersion());
      if (options.isSharedWithHistorical(attachment.id)) throw new Error("附件被历史 Revision 共享；名称快照规则待确认，Server candidate 暂不允许重命名。");
      const result = await client.rename(options.quoteId, options.revisionId, attachment.id, latestVersion, name);
      return commit(revision, result.version);
    },
    async unlink(revision, attachmentId) {
      latestVersion = Math.max(latestVersion, options.getVersion());
      const result = await client.unlink(options.quoteId, options.revisionId, attachmentId, latestVersion);
      return commit(revision, result.version);
    },
    async style(revision, attachmentId) {
      latestVersion = Math.max(latestVersion, options.getVersion());
      const result = await client.style(options.quoteId, options.revisionId, latestVersion, attachmentId);
      return commit(revision, result.version);
    },
    canRename: (id) => !options.isSharedWithHistorical(id),
  };
}
