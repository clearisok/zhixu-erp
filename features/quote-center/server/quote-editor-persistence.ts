import type { Quote } from "../model/quote-view-model";
import type { QuoteAttachmentController, AttachmentSnapshot } from "../model/quote-attachment-controller";
import { advanceAttachmentRecord } from "./quote-attachment-draft";
import { quoteServerEditorAdapter, type EditableServerQuoteRecord, type QuoteServerEditorAdapter } from "./quote-server-editor-adapter";
import { editableQuoteFromServer } from "./quote-server-editor-adapter";
import { quoteServerClient } from "./quote-server-client";
import type { QuoteVersionCommand } from "../../../server/quotes/version-workflows";
export type QuoteVersionAction = QuoteVersionCommand extends infer C ? C extends QuoteVersionCommand ? Omit<C, "expectedVersion"> : never : never;

/** One per mounted editor, never a global expectedVersion or Browser writer. */
export function createQuoteEditorPersistence(initial: EditableServerQuoteRecord, adapter: QuoteServerEditorAdapter = quoteServerEditorAdapter, workflowClient = quoteServerClient) {
  let record = structuredClone(initial);
  let busy = false;
  let blocked = false;
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    if (busy || blocked) throw new Error("Server 写入正在进行或结果待核对，请显式重新读取");
    busy = true;
    try { return await action(); } catch (error) { blocked = true; throw error; } finally { busy = false; }
  };
  return {
    getVersion: () => record.expectedVersion,
    getBaseline: () => structuredClone(record.quote),
    save: (quote: Quote) => exclusive(async () => {
      const saved = await adapter.save(quote, record.expectedVersion);
      record = structuredClone(saved);
      return saved;
    }),
    workflow: (command: QuoteVersionAction) => exclusive(async () => {
      const saved = await workflowClient.versionWorkflow(record.quote.id, { ...command, expectedVersion: record.expectedVersion });
      record = { quote: editableQuoteFromServer(saved.quote), expectedVersion: saved.version };
      return structuredClone(record);
    }),
    acceptAttachment(snapshot: AttachmentSnapshot) {
      record = advanceAttachmentRecord(record, snapshot.revision.revisionId, snapshot);
    },
    coordinate(controller: QuoteAttachmentController): QuoteAttachmentController {
      return { ...controller,
        upload: (...args) => exclusive(() => controller.upload(...args)),
        rename: (...args) => exclusive(() => controller.rename(...args)),
        unlink: (...args) => exclusive(() => controller.unlink(...args)),
        style: (...args) => exclusive(() => controller.style(...args)),
      };
    },
  };
}
export type QuoteEditorPersistence = ReturnType<typeof createQuoteEditorPersistence>;
