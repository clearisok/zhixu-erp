export type LocalDataRestorePayload<TAttachment, TTemplate, TStyleProgress> = {
  attachments: TAttachment[];
  templates: TTemplate[];
  styleProgress: TStyleProgress;
  localRecords: Record<string, string>;
};

export type LocalDataRestoreAdapters<TAttachment, TTemplate, TStyleProgress> = {
  exportAttachments: () => Promise<TAttachment[]>;
  replaceAttachments: (records: TAttachment[]) => Promise<void>;
  exportTemplates: () => Promise<TTemplate[]>;
  replaceTemplates: (records: TTemplate[]) => Promise<void>;
  exportStyleProgress: () => Promise<TStyleProgress>;
  replaceStyleProgress: (data: TStyleProgress) => Promise<void>;
  getLocalRecords: () => Record<string, string>;
  replaceLocalRecords: (records: Record<string, string>) => void;
};

export async function restoreLocalDataStores<TAttachment, TTemplate, TStyleProgress>(payload: LocalDataRestorePayload<TAttachment, TTemplate, TStyleProgress>, adapters: LocalDataRestoreAdapters<TAttachment, TTemplate, TStyleProgress>): Promise<void> {
  const previousLocalRecords = adapters.getLocalRecords();
  const [previousAttachments, previousTemplates, previousStyleProgress] = await Promise.all([adapters.exportAttachments(), adapters.exportTemplates(), adapters.exportStyleProgress()]);
  try {
    await adapters.replaceAttachments(payload.attachments);
    await adapters.replaceTemplates(payload.templates);
    await adapters.replaceStyleProgress(payload.styleProgress);
    adapters.replaceLocalRecords(payload.localRecords);
  } catch (error) {
    adapters.replaceLocalRecords(previousLocalRecords);
    await Promise.all([adapters.replaceAttachments(previousAttachments), adapters.replaceTemplates(previousTemplates), adapters.replaceStyleProgress(previousStyleProgress)]);
    throw error;
  }
}
