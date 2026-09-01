import type { AttachmentViewModel } from "../../quote-center/model/quote-attachments";
import type { TemplateDefinition } from "../../template-settings/model/template-definition";
import type { LocalDataEnvironment } from "../repository/local-data-store";
import type { StyleProgressData } from "../../style-progress/model/style-progress";

export const LOCAL_DATA_BACKUP_VERSION = 1 as const;

export type EncodedBlob = {
  mimeType: string;
  size: number;
  base64: string;
};

export type AttachmentBackupEntry = {
  attachment: AttachmentViewModel;
  file: EncodedBlob;
};

export type TemplateBackupEntry = {
  definition: TemplateDefinition;
  file: EncodedBlob;
};

export type LocalDataBackup = {
  product: "zhixu-erp";
  backupVersion: typeof LOCAL_DATA_BACKUP_VERSION;
  schemaVersion: number;
  createdAt: string;
  environment: LocalDataEnvironment;
  origin: string;
  namespace: string;
  localRecords: Record<string, string>;
  attachments: AttachmentBackupEntry[];
  templates: TemplateBackupEntry[];
  styleProgress: StyleProgressData;
};

export type BackupSummary = {
  createdAt: string;
  environment: LocalDataEnvironment;
  localRecordCount: number;
  attachmentCount: number;
  templateCount: number;
  styleProgressRecordCount: number;
};
