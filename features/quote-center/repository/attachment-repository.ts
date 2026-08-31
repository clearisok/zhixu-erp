import type { AttachmentKind, AttachmentViewModel } from "../model/quote-attachments";

export type SaveAttachmentInput = {
  id: string;
  kind: AttachmentKind;
  createdAt: string;
  createdBy: string;
};

export interface AttachmentRepository {
  save(file: File, input: SaveAttachmentInput): Promise<AttachmentViewModel>;
  get(id: string): Promise<AttachmentViewModel | null>;
  list(ids: string[]): Promise<AttachmentViewModel[]>;
  getBlob(id: string): Promise<Blob | null>;
  rename(id: string, name: string): Promise<AttachmentViewModel>;
  delete(id: string): Promise<void>;
}
