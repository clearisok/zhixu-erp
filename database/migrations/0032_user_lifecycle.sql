-- Preserve all user IDs, account names, roles and historical references.
ALTER TABLE app_users ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN last_login_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN password_reset_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_users ADD CONSTRAINT archived_user_inactive CHECK (archived_at IS NULL OR active=false);
ALTER TABLE app_users ADD CONSTRAINT restored_user_password_guard CHECK (password_reset_required=false OR active=false);
CREATE INDEX app_users_active_directory ON app_users(username,id) WHERE archived_at IS NULL;
