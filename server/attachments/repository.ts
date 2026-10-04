import type { Pool, PoolClient } from "pg";
import { HttpError } from "../http/errors.js";

export type AttachmentKind = "image" | "file";
export type AttachmentView = {
  id: string; name: string; originalName: string; mimeType: string; size: number;
  sha256: string; kind: AttachmentKind; createdAt: string; createdBy: string;
  position: number; isStyleImage: boolean;
};
export type AttachmentRow = {
  id: string; quote_id: string; original_name: string; display_name: string; mime_type: string;
  byte_size: string; sha256: string; kind: AttachmentKind; storage_key: string;
  lifecycle: string; created_at: Date; created_by: string;
  position: number; is_style_image: boolean;
};
export type RevisionScope = { version: number; defaultRevisionId: string; readOnly: boolean };

export function publicView(row: AttachmentRow): AttachmentView {
  return { id: row.id, name: row.display_name, originalName: row.original_name,
    mimeType: row.mime_type, size: Number(row.byte_size), sha256: row.sha256,
    kind: row.kind, createdAt: row.created_at.toISOString(), createdBy: row.created_by,
    position: row.position, isStyleImage: row.is_style_image };
}

export async function attachmentTransaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const value = await action(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}

export async function revisionScope(client: PoolClient, quoteId: string, revisionId: string, forUpdate: boolean): Promise<RevisionScope> {
  const quote = await client.query<{ version: number; default_revision_id: string }>(
    `SELECT version,default_revision_id FROM quote_center_quotes WHERE id=$1 ${forUpdate ? "FOR UPDATE" : ""}`, [quoteId]);
  if (!quote.rowCount) throw new HttpError(404, "quote_not_found", "Quote was not found");
  const revision = await client.query<{ metadata: { readOnly?: boolean } }>(
    "SELECT metadata FROM quote_center_revisions WHERE quote_id=$1 AND id=$2", [quoteId, revisionId]);
  if (!revision.rowCount) throw new HttpError(404, "quote_revision_not_found", "Quote Revision was not found");
  return { version: quote.rows[0].version, defaultRevisionId: quote.rows[0].default_revision_id,
    readOnly: revision.rows[0].metadata.readOnly === true };
}

export async function relatedAttachments(client: PoolClient, quoteId: string, revisionId: string, attachmentId?: string): Promise<AttachmentRow[]> {
  const rows = await client.query<AttachmentRow>(
    `SELECT a.*,u.public_id::text AS created_by,r.position,r.is_style_image
     FROM quote_revision_attachments r JOIN quote_attachments a
       ON a.quote_id=r.quote_id AND a.id=r.attachment_id
     JOIN app_users u ON u.id=a.created_by_user_id
     WHERE r.quote_id=$1 AND r.revision_id=$2 AND a.lifecycle='available'
       ${attachmentId ? "AND a.id=$3::uuid" : ""}
     ORDER BY CASE r.kind WHEN 'image' THEN 0 ELSE 1 END,r.position`,
    attachmentId ? [quoteId, revisionId, attachmentId] : [quoteId, revisionId]);
  return rows.rows;
}

export async function syncAttachmentMirror(client: PoolClient, quoteId: string, revisionId: string): Promise<void> {
  const rows = await relatedAttachments(client, quoteId, revisionId);
  const fields = { imageAttachmentIds: rows.filter((r) => r.kind === "image").map((r) => r.id),
    fileAttachmentIds: rows.filter((r) => r.kind === "file").map((r) => r.id),
    styleImageAttachmentId: rows.find((r) => r.is_style_image)?.id ?? null };
  await client.query("UPDATE quote_center_revisions SET metadata=metadata || $3::jsonb WHERE quote_id=$1 AND id=$2",
    [quoteId, revisionId, JSON.stringify(fields)]);
}

export async function incrementQuoteVersion(client: PoolClient, quoteId: string): Promise<number> {
  const row = await client.query<{ version: number }>("UPDATE quote_center_quotes SET version=version+1 WHERE id=$1 RETURNING version", [quoteId]);
  return row.rows[0].version;
}

export async function markPendingCleanup(pool: Pool, id: string): Promise<void> {
  await pool.query("UPDATE quote_attachments SET lifecycle='pending_cleanup' WHERE id=$1::uuid AND lifecycle='pending_upload'", [id]);
}
