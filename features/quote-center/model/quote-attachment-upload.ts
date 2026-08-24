import type { AttachmentRepository } from "../repository/attachment-repository.ts";
import { addAttachmentToRevision, createAttachmentId, type AttachmentKind, type AttachmentViewModel } from "./quote-attachments.ts";
import type { QuoteRevision } from "./quote-view-model.ts";

type SaveQuoteAttachmentsInput = {
  revision: QuoteRevision;
  files: File[];
  kind: AttachmentKind;
  repository: AttachmentRepository;
  createdBy: string;
  now?: () => Date;
};

export async function saveQuoteAttachments({ revision, files, kind, repository, createdBy, now = () => new Date() }: SaveQuoteAttachmentsInput): Promise<{ revision: QuoteRevision; attachments: AttachmentViewModel[] }> {
  let next = revision;
  const attachments: AttachmentViewModel[] = [];
  try {
    for (const file of files) {
      const attachment = await repository.save(file, {
        id: createAttachmentId(kind),
        kind,
        createdAt: now().toISOString(),
        createdBy: createdBy || "当前用户",
      });
      attachments.push(attachment);
      next = addAttachmentToRevision(next, attachment);
    }
  } catch (error) {
    await Promise.allSettled(attachments.map((attachment) => repository.delete(attachment.id)));
    throw error;
  }
  return { revision: next, attachments };
}
