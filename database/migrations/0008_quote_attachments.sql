-- Q4A foundation only. Binary objects live outside PostgreSQL; no provider is selected here.
CREATE TABLE quote_attachments (
  id UUID PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quote_center_quotes(id),
  original_name TEXT NOT NULL CHECK (length(original_name) BETWEEN 1 AND 255),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 255),
  byte_size BIGINT NOT NULL CHECK (byte_size BETWEEN 1 AND 104857600),
  sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  kind TEXT NOT NULL CHECK (kind IN ('image', 'file')),
  storage_provider TEXT NOT NULL CHECK (length(storage_provider) BETWEEN 1 AND 100),
  storage_container TEXT NOT NULL CHECK (length(storage_container) BETWEEN 1 AND 255),
  storage_key TEXT NOT NULL CHECK (storage_key ~ '^attachments/[0-9a-f-]{36}/original$'),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('pending_upload', 'available', 'pending_cleanup')),
  created_by_user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  upload_token UUID NOT NULL,
  UNIQUE (quote_id, id, kind),
  UNIQUE (storage_provider, storage_container, storage_key),
  UNIQUE (quote_id, created_by_user_id, upload_token)
);
CREATE INDEX quote_attachments_cleanup ON quote_attachments(lifecycle, created_at)
  WHERE lifecycle <> 'available';

CREATE TABLE quote_revision_attachments (
  quote_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  attachment_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'file')),
  position INTEGER NOT NULL CHECK (position >= 0),
  is_style_image BOOLEAN NOT NULL DEFAULT false,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (quote_id, revision_id, attachment_id),
  UNIQUE (quote_id, revision_id, kind, position),
  CHECK (NOT is_style_image OR kind = 'image'),
  FOREIGN KEY (quote_id, revision_id) REFERENCES quote_center_revisions(quote_id, id),
  FOREIGN KEY (quote_id, attachment_id, kind) REFERENCES quote_attachments(quote_id, id, kind)
);
CREATE UNIQUE INDEX quote_revision_one_style_image
  ON quote_revision_attachments(quote_id, revision_id) WHERE is_style_image;
