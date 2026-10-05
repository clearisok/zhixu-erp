import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog, createServerOperationId } from "../operation-logs/repository.js";
import { isWritableDefaultRevision } from "../quotes/model.js";
import { renamedAttachmentFileName } from "../../features/quote-center/model/quote-attachments.js";
import {
  attachmentTransaction, incrementQuoteVersion, markPendingCleanup, publicView,
  relatedAttachments, revisionScope, syncAttachmentMirror,
  type AttachmentRow, type RevisionScope,
} from "./repository.js";
import type { AttachmentStorage } from "./storage.js";
export type { AttachmentKind, AttachmentView } from "./repository.js";

const MAX_BYTES = 100 * 1024 * 1024; // Q4A technical resource ceiling; product limit remains undecided.
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
function imageSignatureMatches(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}
function problem(status: number, code: string, message = "Attachment operation failed"): never {
  throw new HttpError(status, code, message);
}
function filename(input: unknown): string {
  if (typeof input !== "string") return problem(400, "invalid_attachment_name");
  const value = input.normalize("NFKC").trim().replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu, "-");
  if (!value || value === "." || value === ".." || value.length > 255) return problem(400, "invalid_attachment_name");
  return value;
}
function validateUpload(input: { name: unknown; mimeType: unknown; kind: unknown; bytes: Buffer; uploadToken: unknown }) {
  const name = filename(input.name);
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.toLowerCase().trim() : "";
  if (!MIME.test(mimeType) || mimeType.length > 255) problem(415, "unsupported_attachment_type");
  if (input.kind !== "image" && input.kind !== "file") problem(400, "invalid_attachment_kind");
  if (mimeType.startsWith("video/") || (input.kind === "image" && !IMAGE_MIMES.has(mimeType))
      || (input.kind === "file" && IMAGE_MIMES.has(mimeType))) problem(415, "unsupported_attachment_type");
  if (input.bytes.length < 1 || input.bytes.length > MAX_BYTES) problem(413, "attachment_size_out_of_bounds");
  if (input.kind === "image" && !imageSignatureMatches(mimeType, input.bytes)) problem(415, "invalid_image_signature");
  if (typeof input.uploadToken !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.uploadToken)) problem(400, "invalid_upload_token");
  return { name, mimeType, kind: input.kind, size: input.bytes.length,
    sha256: createHash("sha256").update(input.bytes).digest("hex"), uploadToken: input.uploadToken };
}
function mutable(value: RevisionScope, revisionId: string, expectedVersion: number) {
  if (value.version !== expectedVersion) problem(409, "quote_version_conflict");
  if (!isWritableDefaultRevision({ defaultRevisionId: value.defaultRevisionId,
    revisions: [{ revisionId, readOnly: value.readOnly }] }, revisionId)) problem(409, "quote_immutable_history");
}
async function log(client: PoolClient, actor: TrustedIdentity, quoteId: string, revisionId: string,
  attachmentId: string, action: "上传图片" | "上传文件" | "重命名附件" | "关联附件" | "移除附件引用" | "设置款式图",
  operationId: string, sequence = 0, before: string | null = null, after: string | null = null) {
  await appendOperationLog(client, actor, { module: "报价中心", action, entityType: "Attachment",
    entityId: attachmentId, quoteId, operationId, operationSequence: sequence,
    context: { revisionId }, beforeData: { attachmentId, values: { value: before } },
    afterData: { attachmentId, values: { value: after } } });
}
export function createAttachmentService(pool: Pool, storage: AttachmentStorage) {
  const write = async <T>(actor: TrustedIdentity, quoteId: string, revisionId: string, expectedVersion: number,
    action: (client: PoolClient) => Promise<T>) => {
    requirePermission(actor.permissions, "quote.edit");
    return attachmentTransaction(pool, async (client) => {
      mutable(await revisionScope(client, quoteId, revisionId, true), revisionId, expectedVersion);
      const result = await action(client);
      await syncAttachmentMirror(client, quoteId, revisionId);
      const version = await incrementQuoteVersion(client, quoteId);
      return { result, version };
    });
  };
  return {
    async list(actor: TrustedIdentity, quoteId: string, revisionId: string) {
      requirePermission(actor.permissions, "quote.view");
      return attachmentTransaction(pool, async (client) => { await revisionScope(client, quoteId, revisionId, false);
        return (await relatedAttachments(client, quoteId, revisionId)).map(publicView); });
    },
    async read(actor: TrustedIdentity, quoteId: string, revisionId: string, attachmentId: string) {
      requirePermission(actor.permissions, "quote.view");
      return attachmentTransaction(pool, async (client) => { await revisionScope(client, quoteId, revisionId, false);
        const row = (await relatedAttachments(client, quoteId, revisionId, attachmentId))[0];
        if (!row) problem(404, "attachment_not_found"); return { attachment: publicView(row), key: row.storage_key }; });
    },
    async download(actor: TrustedIdentity, quoteId: string, revisionId: string, attachmentId: string) {
      const found = await this.read(actor, quoteId, revisionId, attachmentId);
      const stat = await storage.head(found.key);
      if (!stat || stat.byteSize !== found.attachment.size || stat.sha256 !== found.attachment.sha256)
        problem(503, "attachment_object_unavailable");
      const stream = await storage.get(found.key);
      if (!stream) problem(503, "attachment_object_unavailable");
      return { attachment: found.attachment, stream };
    },
    async upload(actor: TrustedIdentity, quoteId: string, revisionId: string, expectedVersion: number,
      input: { name: unknown; mimeType: unknown; kind: unknown; bytes: Buffer; uploadToken: unknown }) {
      requirePermission(actor.permissions, "quote.edit");
      const parsed = validateUpload(input);
      const started = await attachmentTransaction(pool, async (client) => {
        const revision = await revisionScope(client, quoteId, revisionId, true);
        const existing = await client.query<AttachmentRow>(
          "SELECT * FROM quote_attachments WHERE quote_id=$1 AND created_by_user_id=$2::bigint AND upload_token=$3::uuid",
          [quoteId, actor.internalUserId, parsed.uploadToken]);
        if (existing.rowCount) {
          const row = existing.rows[0];
          if (row.sha256 !== parsed.sha256 || row.kind !== parsed.kind || row.original_name !== parsed.name)
            problem(409, "upload_token_reused");
          if (row.lifecycle !== "available") problem(409, "upload_incomplete_check_status");
          const linked = (await relatedAttachments(client, quoteId, revisionId, row.id))[0];
          if (!linked) problem(409, "upload_token_reused");
          return { existing: publicView(linked), id: row.id, key: row.storage_key, version: revision.version };
        }
        mutable(revision, revisionId, expectedVersion);
        const id = randomUUID(); const key = `attachments/${id}/original`;
        await client.query(
          `INSERT INTO quote_attachments(id,quote_id,original_name,display_name,mime_type,byte_size,sha256,
            kind,storage_provider,storage_container,storage_key,lifecycle,created_by_user_id,upload_token)
           VALUES($1::uuid,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,'pending_upload',$11::bigint,$12::uuid)`,
          [id, quoteId, parsed.name, parsed.mimeType, parsed.size, parsed.sha256, parsed.kind,
            storage.provider, storage.container, key, actor.internalUserId, parsed.uploadToken]);
        return { existing: null, id, key, version: revision.version };
      });
      if (started.existing) {
        const stat = await storage.head(started.key);
        if (!stat || stat.byteSize !== started.existing.size || stat.sha256 !== started.existing.sha256)
          problem(503, "attachment_object_unavailable");
        return { attachment: started.existing, version: started.version, replayed: true };
      }
      try {
        const receipt = await storage.put(started.key, input.bytes, parsed.mimeType);
        const stat = await storage.head(started.key);
        if (!stat || receipt.byteSize !== parsed.size || receipt.sha256 !== parsed.sha256
          || stat.byteSize !== parsed.size || stat.sha256 !== parsed.sha256) problem(503, "attachment_storage_mismatch");
      } catch {
        await markPendingCleanup(pool, started.id).catch(() => undefined);
        problem(503, "attachment_upload_incomplete");
      }
      try {
        const committed = await write(actor, quoteId, revisionId, expectedVersion, async (client) => {
          const position = await client.query<{ next_position: number }>(
            `SELECT COALESCE(MAX(position)+1,0)::integer AS next_position FROM quote_revision_attachments
             WHERE quote_id=$1 AND revision_id=$2 AND kind=$3`, [quoteId, revisionId, parsed.kind]);
          const style = parsed.kind === "image" && !(await client.query(
            "SELECT 1 FROM quote_revision_attachments WHERE quote_id=$1 AND revision_id=$2 AND is_style_image", [quoteId, revisionId])).rowCount;
          await client.query("UPDATE quote_attachments SET lifecycle='available' WHERE id=$1::uuid AND lifecycle='pending_upload'", [started.id]);
          await client.query(`INSERT INTO quote_revision_attachments(quote_id,revision_id,attachment_id,kind,position,is_style_image)
            VALUES($1,$2,$3::uuid,$4,$5,$6)`, [quoteId, revisionId, started.id, parsed.kind, position.rows[0].next_position, style]);
          const operationId = createServerOperationId();
          await log(client, actor, quoteId, revisionId, started.id, parsed.kind === "image" ? "上传图片" : "上传文件", operationId, 0, null, parsed.name);
          await log(client, actor, quoteId, revisionId, started.id, "关联附件", operationId, 1, null, revisionId);
          if (style) await log(client, actor, quoteId, revisionId, started.id, "设置款式图", operationId, 2, null, started.id);
          const linked = (await relatedAttachments(client, quoteId, revisionId, started.id))[0];
          if (!linked) problem(500, "attachment_relation_missing");
          return publicView(linked);
        });
        return { attachment: committed.result, version: committed.version, replayed: false };
      } catch (error) {
        await markPendingCleanup(pool, started.id).catch(() => undefined);
        if (error instanceof HttpError && error.status < 500) throw error;
        problem(503, "attachment_commit_ambiguous_check_status");
      }
    },
    async rename(actor: TrustedIdentity, quoteId: string, revisionId: string, attachmentId: string, expectedVersion: number, requestedName: unknown) {
      const requested = filename(requestedName);
      return write(actor, quoteId, revisionId, expectedVersion, async (client) => {
        const row = (await relatedAttachments(client, quoteId, revisionId, attachmentId))[0];
        if (!row) problem(404, "attachment_not_found");
        const name = filename(renamedAttachmentFileName(row.display_name, requested));
        await client.query("UPDATE quote_attachments SET display_name=$2 WHERE id=$1::uuid", [attachmentId, name]);
        await log(client, actor, quoteId, revisionId, attachmentId, "重命名附件", createServerOperationId(), 0, row.display_name, name);
        return { ...publicView(row), name };
      });
    },
    async link(actor: TrustedIdentity, quoteId: string, revisionId: string, attachmentId: string, expectedVersion: number) {
      return write(actor, quoteId, revisionId, expectedVersion, async (client) => {
        const found = await client.query<AttachmentRow>("SELECT * FROM quote_attachments WHERE quote_id=$1 AND id=$2::uuid AND lifecycle='available'", [quoteId, attachmentId]);
        if (!found.rowCount) problem(404, "attachment_not_found");
        const stat = await storage.head(found.rows[0].storage_key);
        if (!stat || stat.byteSize !== Number(found.rows[0].byte_size) || stat.sha256 !== found.rows[0].sha256)
          problem(503, "attachment_object_unavailable");
        const already = await client.query("SELECT 1 FROM quote_revision_attachments WHERE quote_id=$1 AND revision_id=$2 AND attachment_id=$3::uuid", [quoteId, revisionId, attachmentId]);
        if (already.rowCount) problem(409, "attachment_already_linked");
        const kind = found.rows[0].kind;
        const position = await client.query<{ next_position: number }>(
          "SELECT COALESCE(MAX(position)+1,0)::integer AS next_position FROM quote_revision_attachments WHERE quote_id=$1 AND revision_id=$2 AND kind=$3", [quoteId, revisionId, kind]);
        const style = kind === "image" && !(await client.query(
          "SELECT 1 FROM quote_revision_attachments WHERE quote_id=$1 AND revision_id=$2 AND is_style_image", [quoteId, revisionId])).rowCount;
        await client.query(`INSERT INTO quote_revision_attachments(quote_id,revision_id,attachment_id,kind,position,is_style_image)
          VALUES($1,$2,$3::uuid,$4,$5,$6)`, [quoteId, revisionId, attachmentId, kind, position.rows[0].next_position, style]);
        const operationId = createServerOperationId();
        await log(client, actor, quoteId, revisionId, attachmentId, "关联附件", operationId, 0, null, revisionId);
        if (style) await log(client, actor, quoteId, revisionId, attachmentId, "设置款式图", operationId, 1, null, attachmentId);
        return { attachmentId };
      });
    },
    async unlink(actor: TrustedIdentity, quoteId: string, revisionId: string, attachmentId: string, expectedVersion: number) {
      return write(actor, quoteId, revisionId, expectedVersion, async (client) => {
        const row = (await relatedAttachments(client, quoteId, revisionId, attachmentId))[0];
        if (!row) problem(404, "attachment_not_found");
        await client.query("DELETE FROM quote_revision_attachments WHERE quote_id=$1 AND revision_id=$2 AND attachment_id=$3::uuid", [quoteId, revisionId, attachmentId]);
        await client.query(`UPDATE quote_attachments SET lifecycle='pending_cleanup' WHERE id=$1::uuid
          AND NOT EXISTS(SELECT 1 FROM quote_revision_attachments WHERE attachment_id=$1::uuid)`, [attachmentId]);
        const operationId = createServerOperationId();
        await log(client, actor, quoteId, revisionId, attachmentId, "移除附件引用", operationId, 0, revisionId, null);
        if (row.is_style_image) await log(client, actor, quoteId, revisionId, attachmentId, "设置款式图", operationId, 1, attachmentId, null);
        return { attachmentId };
      });
    },
    async style(actor: TrustedIdentity, quoteId: string, revisionId: string, attachmentId: string | null, expectedVersion: number) {
      return write(actor, quoteId, revisionId, expectedVersion, async (client) => {
        const old = await client.query<{ attachment_id: string }>(
          "SELECT attachment_id::text FROM quote_revision_attachments WHERE quote_id=$1 AND revision_id=$2 AND is_style_image", [quoteId, revisionId]);
        if (attachmentId !== null) {
          const row = (await relatedAttachments(client, quoteId, revisionId, attachmentId))[0];
          if (!row || row.kind !== "image") problem(409, "style_image_must_be_linked_image");
        }
        await client.query("UPDATE quote_revision_attachments SET is_style_image=false WHERE quote_id=$1 AND revision_id=$2 AND is_style_image", [quoteId, revisionId]);
        if (attachmentId) await client.query("UPDATE quote_revision_attachments SET is_style_image=true WHERE quote_id=$1 AND revision_id=$2 AND attachment_id=$3::uuid", [quoteId, revisionId, attachmentId]);
        await log(client, actor, quoteId, revisionId, attachmentId ?? old.rows[0]?.attachment_id ?? revisionId,
          "设置款式图", createServerOperationId(), 0, old.rows[0]?.attachment_id ?? null, attachmentId);
        return { styleImageAttachmentId: attachmentId };
      });
    },
  };
}
