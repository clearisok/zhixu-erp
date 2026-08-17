INSERT INTO app_users(username, password_hash, display_name, role)
VALUES ('admin', crypt(:'admin_password', gen_salt('bf', 12)), '系统管理员', 'admin')
ON CONFLICT (username) DO NOTHING;
