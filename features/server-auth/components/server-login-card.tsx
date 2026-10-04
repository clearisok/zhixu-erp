"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Card, FormItem } from "@/components/foundation";
import { ServerAuthError } from "../server-auth-client";
import { useServerSession } from "./server-session-provider";
import { browserIdentityMode } from "../identity-mode";

function loginErrorMessage(error: unknown): string {
  if (error instanceof ServerAuthError) return error.message;
  return "无法连接织序 Server，请稍后再试。";
}

export function ServerLoginCard({
  defaultUsername = "",
  description = "请登录织序 Server 以读取 PostgreSQL 正式订单。",
}: {
  defaultUsername?: string;
  description?: string;
}) {
  const { login } = useServerSession();
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(username.normalize("NFKC").trim(), password);
    } catch (nextError) {
      setError(loginErrorMessage(nextError));
    } finally {
      setPassword("");
      setSubmitting(false);
    }
  };

  if (browserIdentityMode() === "local-single-user") {
    return <Card className="server-login-card"><h2>本地单用户身份不可用</h2><p>请检查 Server 身份模式；当前不提供账号密码登录。</p></Card>;
  }

  return (
    <Card className="server-login-card">
      <h2>登录织序 Server</h2>
      <p>{description}</p>
      {error && <div ref={errorRef} className="qc-field-error" role="alert" tabIndex={-1}>{error}</div>}
      <form onSubmit={(event) => void submit(event)}>
        <FormItem label="Server 用户名" required>
          <input
            className="qc-control"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={submitting}
            required
          />
        </FormItem>
        <FormItem label="Server 密码" required>
          <input
            className="qc-control"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
            required
          />
        </FormItem>
        <Button type="submit" disabled={submitting}>{submitting ? "登录中…" : "登录 Server"}</Button>
      </form>
    </Card>
  );
}
