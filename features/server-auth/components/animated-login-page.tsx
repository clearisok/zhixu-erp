"use client";
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { useServerSession } from "./server-session-provider";
import { ServerAuthError } from "../server-auth-client";
import { browserIdentityMode } from "../identity-mode";
import { safeLoginReturnTo } from "../login-route";
import { quoteAuthority } from "../../quote-center/authority/quote-authority";

function loginError(error: unknown): string {
  if (error instanceof ServerAuthError) {
    if (error.code === "invalid_credentials" || error.status === 401) return "用户名或密码不正确，请重新输入。";
    if (error.status === 429) return "登录尝试有些频繁，请稍后再试。";
    if (error.status === 503) return "系统暂时无法连接，请稍后重试。";
  }
  return "暂时无法完成登录，请检查网络后重试。";
}
function EyeIcon({ open }: { open: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" />{!open && <path d="m3 3 18 18" />}</svg>;
}
export function AnimatedLoginPage() {
  const session = useServerSession();
  const router = useRouter();
  const root = useRef<HTMLElement>(null), errorElement = useRef<HTMLParagraphElement>(null), pending = useRef(false);
  const [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false), [passwordFocused, setPasswordFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState("");
  const localMode = browserIdentityMode() === "local-single-user" || quoteAuthority() !== "server";
  useEffect(() => {
    if (session.status === "authenticated" && !localMode) router.replace(safeLoginReturnTo(new URLSearchParams(window.location.search).get("returnTo")));
  }, [session.status, localMode, router]);
  useEffect(() => { if (error) errorElement.current?.focus(); }, [error]);
  function look(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    root.current?.style.setProperty("--look-x", `${Math.max(-4, Math.min(4, (event.clientX - bounds.left) / bounds.width * 8 - 4))}px`);
    root.current?.style.setProperty("--look-y", `${Math.max(-3, Math.min(3, (event.clientY - bounds.top) / bounds.height * 6 - 3))}px`);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || session.status !== "anonymous" || localMode) return;
    const normalized = username.normalize("NFKC").trim();
    if (!normalized) { setError("请输入用户名。"); return; }
    pending.current = true; setSubmitting(true); setError("");
    try { await session.login(normalized, password); }
    catch (failure) { setError(loginError(failure)); }
    finally { setPassword(""); setShowPassword(false); pending.current = false; setSubmitting(false); }
  }
  const eyesClosed = passwordFocused || (showPassword && password.length > 0);
  return <main ref={root} className="zx-login" onPointerMove={look} data-privacy={eyesClosed} data-pending={submitting}>
    <section className="zx-login-story" aria-label="织序，让每一份协作井然有序">
      <a className="zx-login-brand" href="/login" aria-label="织序登录首页"><span className="zx-login-mark" aria-hidden="true">织</span><strong>织序<span>ZHIXU</span></strong></a>
      <div className="zx-login-story-copy"><p className="zx-login-eyebrow">把每一条线，织成有序的日常</p><h1>好工作，<br />从一点<span>默契</span>开始。</h1><p>从一个灵感，到一件成衣。<br />让我们一起，把每一步安排得刚刚好。</p></div>
      <div className="zx-login-scene" aria-hidden="true">
        <div className="zx-login-thread" /><span className="zx-login-spark zx-login-spark-one">✳</span><span className="zx-login-spark zx-login-spark-two">✦</span>
        <div className="zx-login-friend zx-login-friend-tall"><span className="zx-login-seam" /><div className="zx-login-face"><span className="zx-login-eye" /><span className="zx-login-eye" /><i /></div><span className="zx-login-patch" /></div>
        <div className="zx-login-friend zx-login-friend-round"><div className="zx-login-face"><span className="zx-login-eye" /><span className="zx-login-eye" /><i /></div></div>
        <div className="zx-login-friend zx-login-friend-small"><span className="zx-login-seam" /><div className="zx-login-face"><span className="zx-login-eye" /><span className="zx-login-eye" /><i /></div></div>
        <span className="zx-login-scene-note">{eyesClosed ? "放心，我们不偷看。" : submitting ? "这就为你开门…" : "今天也一起，好好配合。"}</span>
      </div>
      <p className="zx-login-story-footer">一针一线，各有其序。<span>EST. ZHIXU</span></p>
    </section>
    <section className="zx-login-panel" aria-labelledby="login-heading">
      <div className="zx-login-form-wrap">
        <span className="zx-login-welcome-icon" aria-hidden="true">✳</span><p className="zx-login-eyebrow">WELCOME BACK</p>
        <h2 id="login-heading">欢迎回来</h2><p className="zx-login-intro">登录织序，接着把好想法变成现实。</p>
        {localMode ? <div className="zx-login-state"><p>当前版本使用本地工作台身份，无需在此输入密码。</p><a href="/quote-center">进入工作台 →</a></div>
          : session.status === "checking" || session.status === "authenticated" ? <p className="zx-login-state" role="status">{session.status === "checking" ? "正在确认登录状态…" : "登录成功，正在进入工作台…"}</p>
          : session.status === "error" ? <div className="zx-login-state" role="alert"><p>暂时无法确认登录状态，请检查网络后重试。</p><button className="zx-login-submit" type="button" onClick={() => void session.refresh()}>重新连接</button></div>
          : <form className="zx-login-form" onSubmit={submit} aria-busy={submitting}>
            <label htmlFor="login-username">用户名</label><input id="login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="输入你的用户名" value={username} onChange={event => setUsername(event.target.value)} required disabled={submitting} />
            <label htmlFor="login-password">密码</label><div className="zx-login-password"><input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="输入密码，开启新的一天" value={password} onChange={event => setPassword(event.target.value)} onFocus={() => setPasswordFocused(true)} onBlur={() => setPasswordFocused(false)} required disabled={submitting} /><button type="button" className="zx-login-reveal" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} disabled={submitting}><EyeIcon open={showPassword} /></button></div>
            <div className="zx-login-helper">忘记密码？请联系系统管理员</div>
            {error && <p className="zx-login-error" ref={errorElement} role="alert" tabIndex={-1}>{error}</p>}
            <button className="zx-login-submit" aria-label={submitting ? "正在登录" : "登录织序"} type="submit" disabled={submitting}><span>{submitting ? "正在登录…" : "登录织序"}</span><span aria-hidden="true">{submitting ? "· · ·" : "→"}</span></button>
          </form>}
        <p className="zx-login-note"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><rect x="4" y="8" width="12" height="9" rx="2" /><path d="M6 8V6a4 4 0 0 1 8 0v2" /></svg>你的工作空间，安心有序。</p>
      </div>
      <footer className="zx-login-footer"><span>织序 · 让协作井然有序</span><span>用心做好每一步</span></footer>
    </section>
  </main>;
}
