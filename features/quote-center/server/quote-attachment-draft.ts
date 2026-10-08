import type { Quote, QuoteRevision } from "../model/quote-view-model";
import type { AttachmentSnapshot } from "../model/quote-attachment-controller";
import type { EditableServerQuoteRecord } from "./quote-server-editor-adapter";

function mirror(revision: QuoteRevision, snapshot: AttachmentSnapshot): QuoteRevision {
  return { ...revision,
    imageAttachmentIds: [...snapshot.revision.imageAttachmentIds],
    fileAttachmentIds: [...snapshot.revision.fileAttachmentIds],
    styleImageAttachmentId: snapshot.revision.styleImageAttachmentId };
}

export function mergeAttachmentMirror<T extends Pick<Quote, "revisions">>(quote: T, revisionId: string, snapshot: AttachmentSnapshot): T {
  return { ...quote, revisions: quote.revisions.map((revision) => revision.revisionId === revisionId ? mirror(revision, snapshot) : revision) };
}

export function advanceAttachmentRecord(record: EditableServerQuoteRecord, revisionId: string, snapshot: AttachmentSnapshot): EditableServerQuoteRecord {
  if (snapshot.version === undefined || snapshot.version < record.expectedVersion) throw new Error("Invalid Server attachment version advancement");
  return { ...record, expectedVersion: snapshot.version, quote: mergeAttachmentMirror(record.quote, revisionId, snapshot) };
}
