CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'sales', 'planner', 'viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;
CREATE TABLE IF NOT EXISTS quotes (
  id BIGSERIAL PRIMARY KEY,
  quote_no TEXT NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  style_no TEXT NOT NULL,
  style_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  currency TEXT NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY', 'USD')),
  material_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (material_cost >= 0),
  processing_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (processing_cost >= 0),
  other_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_cost >= 0),
  margin NUMERIC(6,2) NOT NULL DEFAULT 20 CHECK (margin >= 0 AND margin < 90),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC(16,2) NOT NULL CHECK (total_amount >= 0),
  valid_until DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),
  notes TEXT NOT NULL DEFAULT '',
  created_by BIGINT NOT NULL REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  quote_id BIGINT REFERENCES quotes(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  style_no TEXT NOT NULL,
  style_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC(16,2) NOT NULL CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY', 'USD')),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'material_preparing', 'scheduled', 'in_production', 'quality_check', 'completed', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  created_by BIGINT NOT NULL REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedules (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'ready', 'running', 'paused', 'completed')),
  notes TEXT NOT NULL DEFAULT '',
  created_by BIGINT NOT NULL REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES app_users(id),
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);
CREATE INDEX IF NOT EXISTS login_attempts_lookup_idx ON login_attempts(username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS quotes_status_idx ON quotes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_due_idx ON orders(status, due_date);
CREATE INDEX IF NOT EXISTS schedules_dates_idx ON schedules(start_date, end_date);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE OR REPLACE FUNCTION api_dispatch(
  p_method TEXT,
  p_path TEXT,
  p_body JSONB DEFAULT '{}'::jsonb,
  p_token TEXT DEFAULT ''
)
RETURNS TABLE(http_status INTEGER, response_body JSONB, response_cookie TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $api$
DECLARE
  v_user app_users%ROWTYPE;
  v_quote quotes%ROWTYPE;
  v_order orders%ROWTYPE;
  v_schedule schedules%ROWTYPE;
  v_customer_id BIGINT;
  v_id BIGINT;
  v_username TEXT;
  v_password TEXT;
  v_token TEXT;
  v_cost NUMERIC(14,2);
  v_price NUMERIC(14,2);
  v_quantity INTEGER;
  v_margin NUMERIC(6,2);
  v_failed INTEGER;
  v_result JSONB;
BEGIN
  p_method := upper(coalesce(p_method, 'GET'));
  p_path := split_part(coalesce(p_path, '/'), '?', 1);
  p_body := coalesce(p_body, '{}'::jsonb);

  DELETE FROM app_sessions WHERE expires_at <= now();
  DELETE FROM login_attempts WHERE attempted_at < now() - interval '7 days';

  IF p_path = '/api/health' THEN
    http_status := 200;
    response_body := jsonb_build_object('ok', true, 'database', 'ready');
    response_cookie := '';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_path = '/api/login' AND p_method = 'POST' THEN
    v_username := lower(trim(coalesce(p_body->>'username', '')));
    v_password := coalesce(p_body->>'password', '');

    SELECT count(*)::INTEGER INTO v_failed
    FROM login_attempts
    WHERE username = v_username
      AND succeeded = false
      AND attempted_at > now() - interval '15 minutes';

    IF v_failed >= 10 THEN
      http_status := 429;
      response_body := jsonb_build_object('error', '尝试次数过多，请 15 分钟后再试');
      response_cookie := '';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT * INTO v_user
    FROM app_users
    WHERE username = v_username
      AND active = true
      AND password_hash = crypt(v_password, password_hash);

    INSERT INTO login_attempts(username, succeeded) VALUES (v_username, FOUND);

    IF NOT FOUND THEN
      http_status := 401;
      response_body := jsonb_build_object('error', '用户名或密码错误');
      response_cookie := '';
      RETURN NEXT;
      RETURN;
    END IF;

    DELETE FROM login_attempts WHERE username = v_username AND succeeded = false;
    INSERT INTO app_sessions(user_id, expires_at)
    VALUES (v_user.id, now() + interval '12 hours')
    RETURNING token INTO v_token;

    INSERT INTO audit_logs(user_id, username, action, entity_type, entity_id, details)
    VALUES (v_user.id, v_user.username, 'login', 'session', NULL, '{}'::jsonb);

    http_status := 200;
    response_body := jsonb_build_object('user', jsonb_build_object(
      'id', v_user.id, 'username', v_user.username, 'display_name', v_user.display_name, 'role', v_user.role
    ));
    response_cookie := 'zhixu_session=' || v_token || '; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT u.* INTO v_user
  FROM app_sessions s
  JOIN app_users u ON u.id = s.user_id
  WHERE s.token = p_token AND s.expires_at > now() AND u.active = true;

  IF NOT FOUND THEN
    http_status := 401;
    response_body := jsonb_build_object('error', '登录已失效，请重新登录');
    response_cookie := 'zhixu_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_path = '/api/logout' AND p_method = 'POST' THEN
    DELETE FROM app_sessions WHERE token = p_token;
    INSERT INTO audit_logs(user_id, username, action, entity_type, details)
    VALUES (v_user.id, v_user.username, 'logout', 'session', '{}'::jsonb);
    http_status := 200;
    response_body := jsonb_build_object('ok', true);
    response_cookie := 'zhixu_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_path = '/api/bootstrap' AND p_method = 'GET' THEN
    SELECT jsonb_build_object(
      'user', jsonb_build_object('id', v_user.id, 'username', v_user.username, 'display_name', v_user.display_name, 'role', v_user.role),
      'dashboard', jsonb_build_object(
        'open_quotes', (SELECT count(*) FROM quotes WHERE status IN ('draft', 'sent', 'accepted')),
        'active_orders', (SELECT count(*) FROM orders WHERE status NOT IN ('completed', 'cancelled')),
        'planned_quantity', (SELECT coalesce(sum(planned_quantity), 0) FROM schedules WHERE status IN ('planned', 'ready', 'running')),
        'due_soon', (SELECT count(*) FROM orders WHERE status NOT IN ('completed', 'cancelled') AND due_date <= current_date + 14),
        'order_value', (SELECT coalesce(sum(total_amount), 0) FROM orders WHERE status <> 'cancelled')
      ),
      'customers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'contact_name', c.contact_name, 'phone', c.phone, 'email', c.email) ORDER BY c.name) FROM customers c), '[]'::jsonb),
      'quotes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'quote_no', q.quote_no, 'customer_name', c.name, 'style_no', q.style_no, 'style_name', q.style_name,
        'quantity', q.quantity, 'currency', q.currency, 'material_cost', q.material_cost, 'processing_cost', q.processing_cost,
        'other_cost', q.other_cost, 'margin', q.margin, 'unit_price', q.unit_price, 'total_amount', q.total_amount,
        'valid_until', q.valid_until, 'status', q.status, 'notes', q.notes, 'created_at', q.created_at
      ) ORDER BY q.created_at DESC) FROM quotes q JOIN customers c ON c.id = q.customer_id), '[]'::jsonb),
      'orders', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'order_no', o.order_no, 'quote_id', o.quote_id, 'customer_name', c.name, 'style_no', o.style_no,
        'style_name', o.style_name, 'quantity', o.quantity, 'unit_price', o.unit_price, 'total_amount', o.total_amount,
        'currency', o.currency, 'due_date', o.due_date, 'status', o.status, 'notes', o.notes, 'created_at', o.created_at
      ) ORDER BY o.created_at DESC) FROM orders o JOIN customers c ON c.id = o.customer_id), '[]'::jsonb),
      'schedules', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'order_id', s.order_id, 'order_no', o.order_no, 'style_no', o.style_no, 'style_name', o.style_name,
        'customer_name', c.name, 'line_name', s.line_name, 'start_date', s.start_date, 'end_date', s.end_date,
        'planned_quantity', s.planned_quantity, 'progress', s.progress, 'status', s.status, 'notes', s.notes
      ) ORDER BY s.start_date, s.line_name) FROM schedules s JOIN orders o ON o.id = s.order_id JOIN customers c ON c.id = o.customer_id), '[]'::jsonb),
      'users', CASE WHEN v_user.role = 'admin' THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', u.id, 'username', u.username, 'display_name', u.display_name, 'role', u.role, 'active', u.active, 'created_at', u.created_at
      ) ORDER BY u.created_at) FROM app_users u), '[]'::jsonb) ELSE '[]'::jsonb END,
      'audit', CASE WHEN v_user.role = 'admin' THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'username', a.username, 'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id,
        'details', a.details, 'created_at', a.created_at
      ) ORDER BY a.created_at DESC) FROM (SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100) a), '[]'::jsonb) ELSE '[]'::jsonb END
    ) INTO v_result;

    http_status := 200;
    response_body := v_result;
    response_cookie := '';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_path = '/api/quotes' AND p_method = 'POST' THEN
    IF v_user.role NOT IN ('admin', 'sales') THEN
      RAISE EXCEPTION USING ERRCODE = '42501';
    END IF;
    IF length(trim(coalesce(p_body->>'customer_name', ''))) < 2 OR length(trim(coalesce(p_body->>'style_name', ''))) < 2 THEN
      RAISE EXCEPTION USING ERRCODE = '22023';
    END IF;

    v_quantity := (p_body->>'quantity')::INTEGER;
    v_margin := coalesce((p_body->>'margin')::NUMERIC, 20);
    v_cost := coalesce((p_body->>'material_cost')::NUMERIC, 0) + coalesce((p_body->>'processing_cost')::NUMERIC, 0) + coalesce((p_body->>'other_cost')::NUMERIC, 0);
    IF v_quantity <= 0 OR v_margin < 0 OR v_margin >= 90 OR v_cost < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023';
    END IF;
    v_price := round(v_cost / (1 - v_margin / 100), 2);

    INSERT INTO customers(name)
    VALUES (trim(p_body->>'customer_name'))
    ON CONFLICT (name) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_customer_id;

    INSERT INTO quotes(quote_no, customer_id, style_no, style_name, quantity, currency, material_cost, processing_cost, other_cost, margin, unit_price, total_amount, valid_until, status, notes, created_by)
    VALUES (
      'QT-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('quote_number_seq')::TEXT, 4, '0'),
      v_customer_id, upper(trim(coalesce(p_body->>'style_no', 'PENDING'))), trim(p_body->>'style_name'), v_quantity,
      coalesce(nullif(p_body->>'currency', ''), 'CNY'), coalesce((p_body->>'material_cost')::NUMERIC, 0),
      coalesce((p_body->>'processing_cost')::NUMERIC, 0), coalesce((p_body->>'other_cost')::NUMERIC, 0), v_margin,
      v_price, round(v_price * v_quantity, 2), coalesce(nullif(p_body->>'valid_until', '')::DATE, current_date + 14),
      'draft', coalesce(p_body->>'notes', ''), v_user.id
    ) RETURNING * INTO v_quote;

    INSERT INTO audit_logs(user_id, username, action, entity_type, entity_id, details)
    VALUES (v_user.id, v_user.username, 'create', 'quote', v_quote.id, jsonb_build_object('quote_no', v_quote.quote_no));
    http_status := 201;
    response_body := jsonb_build_object('ok', true, 'id', v_quote.id, 'quote_no', v_quote.quote_no);
    response_cookie := '';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_path ~ '^/api/quotes/[0-9]+/status$' AND p_method = 'POST' THEN
    IF v_user.role NOT IN ('admin', 'sales') THEN RAISE EXCEPTION USING ERRCODE = '42501'; END IF;
    v_id := split_part(p_path, '/', 4)::BIGINT;
    UPDATE quotes SET status = p_body->>'status', updated_at = now() WHERE id = v_id RETURNING * INTO v_quote;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002'; END IF;
    INSERT INTO audit_logs(user_id, username, action, entity_type, entity_id, details)
    VALUES (v_user.id, v_user.username, 'status', 'quote', v_id, jsonb_build_object('status', v_quote.status));
    http_status := 200; response_body := jsonb_build_object('ok', true); response_cookie := '';
    RETURN NEXT; RETURN;
  END IF;

  IF p_path ~ '^/api/quotes/[0-9]+/convert$' AND p_method = 'POST' THEN
    IF v_user.role NOT IN ('admin', 'sales') THEN RAISE EXCEPTION USING ERRCODE = '42501'; END IF;
    v_id := split_part(p_path, '/', 4)::BIGINT;
    SELECT * INTO v_quote FROM quotes WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002'; END IF;
    IF v_quote.status = 'converted' THEN
      http_status := 409; response_body := jsonb_build_object('error', '该报价已转为订单'); response_cookie := '';
      RETURN NEXT; RETURN;
    END IF;
    INSERT INTO orders(order_no, quote_id, customer_id, style_no, style_name, quantity, unit_price, total_amount, currency, due_date, status, notes, created_by)
    VALUES (
      'PO-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::TEXT, 4, '0'),
      v_quote.id, v_quote.customer_id, v_quote.style_no, v_quote.style_name, v_quote.quantity, v_quote.unit_price,
      v_quote.total_amount, v_quote.currency, coalesce(nullif(p_body->>'due_date', '')::DATE, current_date + 30),
      'confirmed', coalesce(p_body->>'notes', v_quote.notes), v_user.id
    ) RETURNING * INTO v_order;
    UPDATE quotes SET status = 'converted', updated_at = now() WHERE id = v_quote.id;
    INSERT INTO audit_logs(user_id, username, action, entity_type, entity_id, details)
    VALUES (v_user.id, v_user.username, 'convert', 'order', v_order.id, jsonb_build_object('order_no', v_order.order_no, 'quote_id', v_quote.id));
    http_status := 201; response_body := jsonb_build_object('ok', true, 'id', v_order.id, 'order_no', v_order.order_no); response_cookie := '';
    RETURN NEXT; RETURN;
  END IF;

  IF p_path ~ '^/api/orders/[0-9]+/status$' AND p_method = 'POST' THEN
    IF v_user.role NOT IN ('admin', 'sales', 'planner') THEN RAISE EXCEPTION USING ERRCODE = '42501'; END IF;
    v_id := split_part(p_path, '/', 4)::BIGINT;
    UPDATE orders SET status = p_body->>'status', updated_at = now() WHERE id = v_id RETURNING * INTO v_order;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002'; END IF;
    INSERT INTO audit_logs(user_id, username, action, entity_type, entity_id, details)
    VALUES (v_user.id, v_user.username, 'status', 'order', v_id, jsonb_build_object('status', v_order.status));
    http_status := 200; response_body := jsonb_build_object('ok', true); response_cookie := '';
    RETURN NEXT; RETURN;
  END IF;

  IF p_path = '/api/schedules' AND p_method = 'POST' THEN
    IF v_user.role NOT IN ('admin', 'planner') THEN RAISE EXCEPTION USING ERRCODE = '42501'; END IF;
    v_id := (p_body->>'order_id')::BIGINT;
    SELECT * INTO v_order FROM orders WHERE id = v_id AND status NOT IN ('completed', 'cancelled');
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002'; END IF;
    v_quantity := (p_body->>'planned_quantity')::INTEGER;
    IF v_quantity <= 0 OR coalesce((SELECT sum(planned_quantity) FROM schedules WHERE order_id = v_id), 0) + v_quantity > v_order.quantity THEN
      RAISE EXCEPTION USING ERRCODE = '22023';
    END IF;
    INSERT INTO schedules(order_id, line_name, start_date, end_date, planned_quantity, progress, status, notes, created_by)
    VALUES (
      v_id, trim(p_body->>'line_name'), (p_body->>'start_date')::DATE, (p_body->>'end_date')::DATE,
      v_quantity, 0, 'planned', coalesce(p_body->>'notes', ''), v_user.id
    ) RETURNING * INTO v_schedule;
    UPDATE orders SET status = 'scheduled', updated_at = now() WHERE id = v_id AND status IN ('confirmed', 'material_preparing');
    INSERT INTO audit_logs(user_id, username, action, entity_type, entity_id, details)
    VALUES (v_user.id, v_user.username, 'create', 'schedule', v_schedule.id, jsonb_build_object('order_id', v_id, 'line_name', v_schedule.line_name));
    http_status := 201; response_body := jsonb_build_object('ok', true, 'id', v_schedule.id); response_cookie := '';
    RETURN NEXT; RETURN;
  END IF;

  IF p_path ~ '^/api/schedules/[0-9]+/status$' AND p_method = 'POST' THEN
    IF v_user.role NOT IN ('admin', 'planner') THEN RAISE EXCEPTION USING ERRCODE = '42501'; END IF;
    v_id := split_part(p_path, '/', 4)::BIGINT;
    UPDATE schedules
    SET status = p_body->>'status', progress = coalesce((p_body->>'progress')::INTEGER, progress), updated_at = now()
    WHERE id = v_id RETURNING * INTO v_schedule;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002'; END IF;
    IF v_schedule.status = 'running' THEN UPDATE orders SET status = 'in_production', updated_at = now() WHERE id = v_schedule.order_id; END IF;
    IF v_schedule.status = 'completed' AND NOT EXISTS (SELECT 1 FROM schedules WHERE order_id = v_schedule.order_id AND status <> 'completed') THEN
      UPDATE orders SET status = 'quality_check', updated_at = now() WHERE id = v_schedule.order_id;
    END IF;
    INSERT INTO audit_logs(user_id, username, action, entity_type, entity_id, details)
    VALUES (v_user.id, v_user.username, 'status', 'schedule', v_id, jsonb_build_object('status', v_schedule.status, 'progress', v_schedule.progress));
    http_status := 200; response_body := jsonb_build_object('ok', true); response_cookie := '';
    RETURN NEXT; RETURN;
  END IF;

  IF p_path = '/api/users' AND p_method = 'POST' THEN
    IF v_user.role <> 'admin' THEN RAISE EXCEPTION USING ERRCODE = '42501'; END IF;
    IF length(coalesce(p_body->>'password', '')) < 10 THEN RAISE EXCEPTION USING ERRCODE = '22023'; END IF;
    INSERT INTO app_users(username, password_hash, display_name, role)
    VALUES (lower(trim(p_body->>'username')), crypt(p_body->>'password', gen_salt('bf', 12)), trim(p_body->>'display_name'), p_body->>'role')
    RETURNING id INTO v_id;
    INSERT INTO audit_logs(user_id, username, action, entity_type, entity_id, details)
    VALUES (v_user.id, v_user.username, 'create', 'user', v_id, jsonb_build_object('username', lower(trim(p_body->>'username')), 'role', p_body->>'role'));
    http_status := 201; response_body := jsonb_build_object('ok', true, 'id', v_id); response_cookie := '';
    RETURN NEXT; RETURN;
  END IF;

  IF p_path = '/api/change-password' AND p_method = 'POST' THEN
    IF length(coalesce(p_body->>'new_password', '')) < 10 THEN RAISE EXCEPTION USING ERRCODE = '22023'; END IF;
    IF v_user.password_hash <> crypt(coalesce(p_body->>'current_password', ''), v_user.password_hash) THEN
      http_status := 400; response_body := jsonb_build_object('error', '当前密码不正确'); response_cookie := '';
      RETURN NEXT; RETURN;
    END IF;
    UPDATE app_users SET password_hash = crypt(p_body->>'new_password', gen_salt('bf', 12)), updated_at = now() WHERE id = v_user.id;
    DELETE FROM app_sessions WHERE user_id = v_user.id AND token <> p_token;
    INSERT INTO audit_logs(user_id, username, action, entity_type, entity_id, details)
    VALUES (v_user.id, v_user.username, 'change_password', 'user', v_user.id, '{}'::jsonb);
    http_status := 200; response_body := jsonb_build_object('ok', true); response_cookie := '';
    RETURN NEXT; RETURN;
  END IF;

  http_status := 404;
  response_body := jsonb_build_object('error', '接口不存在');
  response_cookie := '';
  RETURN NEXT;
  RETURN;
EXCEPTION
  WHEN insufficient_privilege THEN
    http_status := 403; response_body := jsonb_build_object('error', '当前账号没有此操作权限'); response_cookie := ''; RETURN NEXT;
  WHEN unique_violation THEN
    http_status := 409; response_body := jsonb_build_object('error', '编号、客户或用户名已存在'); response_cookie := ''; RETURN NEXT;
  WHEN no_data_found THEN
    http_status := 404; response_body := jsonb_build_object('error', '记录不存在或状态不可用'); response_cookie := ''; RETURN NEXT;
  WHEN invalid_parameter_value OR check_violation OR invalid_text_representation OR numeric_value_out_of_range OR not_null_violation THEN
    http_status := 400; response_body := jsonb_build_object('error', '提交的数据不完整或格式不正确'); response_cookie := ''; RETURN NEXT;
  WHEN OTHERS THEN
    http_status := 500; response_body := jsonb_build_object('error', '服务器处理失败，请查看容器日志'); response_cookie := ''; RETURN NEXT;
END;
$api$;
