import type { QuoteEditorData as Quote } from "../model/quote-editor-data";
import type { QuoteAttachmentController, AttachmentSnapshot } from "../model/quote-attachment-controller";
import { advanceAttachmentRecord } from "./quote-attachment-draft";
import { quoteServerEditorAdapter, type EditableServerQuoteRecord, type QuoteServerEditorAdapter } from "./quote-server-editor-adapter";
import { editableRecord } from "./quote-server-editor-adapter";
import { quoteServerClient } from "./quote-server-client";
import type { QuoteVersionCommand } from "../../../server/quotes/version-workflows";
import type { EstimateCommand } from "../../../server/quotes/estimate-workflows";
import { serverQuoteFromEditable } from "./quote-server-editor-adapter";
export type EstimateAction = EstimateCommand extends infer C ? C extends EstimateCommand ? Omit<C, "expectedVersion"> : never : never;
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
    canReadEstimate: () => record.estimateVisibility !== "restricted" && Array.isArray(record.quote.estimateCostHistory),
    save: (quote: Quote) => exclusive(async () => {
      if (record.estimateVisibility === "restricted") {
        if (Object.hasOwn(quote, "activeEstimateCost") || Object.hasOwn(quote, "estimateCostHistory")) throw new Error("Estimate content is restricted");
        record = structuredClone(await adapter.save(quote, record.expectedVersion));
        return structuredClone(record);
      }
      // Estimate lifecycle/value edits use their dedicated trusted boundary;
      // generic aggregate PUT carries the last confirmed Estimate snapshot.
      const target = { ...quote, activeEstimateCost: record.quote.activeEstimateCost, estimateCostHistory: record.quote.estimateCostHistory };
      const estimateChanged = JSON.stringify(quote.activeEstimateCost) !== JSON.stringify(target.activeEstimateCost);
      if (estimateChanged && (!quote.activeEstimateCost || quote.activeEstimateCost.id !== target.activeEstimateCost?.id)) throw new Error("Estimate identity changed in draft");
      let quoteSavedVersion: number | undefined;
      if (!estimateChanged || JSON.stringify(target) !== JSON.stringify(record.quote)) {
        const saved = await adapter.save(target, record.expectedVersion);
        record = structuredClone(saved);
        quoteSavedVersion = saved.expectedVersion;
      }
      if (estimateChanged) {
        try {
          const updated = await workflowClient.estimateWorkflow(quote.id, { action: "estimate.update", expectedVersion: record.expectedVersion, estimate: serverQuoteFromEditable(quote).activeEstimateCost! });
          record = editableRecord(updated);
        } catch (error) {
          if (quoteSavedVersion && error instanceof Error) Object.assign(error, { quoteSavedVersion });
          throw error;
        }
      }
      return structuredClone(record);
    }),
    estimate: (command: EstimateAction) => exclusive(async () => {
      if (record.estimateVisibility === "restricted") throw new Error("Estimate content is restricted");
      const saved = await workflowClient.estimateWorkflow(record.quote.id, { ...command, expectedVersion: record.expectedVersion });
      record = editableRecord(saved);
      return structuredClone(record);
    }),
    workflow: (command: QuoteVersionAction) => exclusive(async () => {
      const saved = await workflowClient.versionWorkflow(record.quote.id, { ...command, expectedVersion: record.expectedVersion });
      record = editableRecord(saved);
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
