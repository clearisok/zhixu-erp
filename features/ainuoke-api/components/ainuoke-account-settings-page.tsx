"use client";

import { useEffect, useState } from "react";
import { AlertBanner, AppShell, Button, Card, PageContainer, PageHeader, StatusTag, Toast } from "@/components/foundation";
import { operationLogRepository } from "@/features/operation-logs";
import { usePermissions, type User } from "@/features/permissions";
import { AinuokeBridgeError, ainuokeBridgeClient } from "../client/ainuoke-bridge-client";
import { createAinuokeAccountOperationLog } from "../model/account-operation-log";
import type { AinuokeAccountView } from "../model/ainuoke-api";

const EMPTY_ACCOUNT: AinuokeAccountView = { username: null, configured: false, status: "not_configured", lastVerifiedAt: null, lastSuccessfulLoginAt: null, lastErrorCode: null };
const statusLabel = { not_configured: "未绑定", verified: "连接正常", error: "连接异常" } as const;

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未验证";
}

export function AinuokeAccountSettingsPage() {
  const { currentUser, can } = usePermissions();
  return <AinuokeAccountSettingsForUser key={currentUser.id} currentUser={currentUser} allowed={can("ainuoke.account.bind_self")} />;
}

function AinuokeAccountSettingsForUser({ currentUser, allowed }: { currentUser: User; allowed: boolean }) {
  const [account, setAccount] = useState<AinuokeAccountView>(EMPTY_ACCOUNT);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setError("");
      setAccount(EMPTY_ACCOUNT);
      setUsername("");
      setPassword("");
      try {
        const next = await ainuokeBridgeClient.getAccount(currentUser.id);
        if (active) { setAccount(next); setUsername(next.username ?? ""); }
      } catch (reason) {
        if (active) setError(reason instanceof AinuokeBridgeError ? reason.message : "无法连接本地艾诺科 Bridge");
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [currentUser.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const run = async (action: () => Promise<AinuokeAccountView>, success: string) => {
    setWorking(true);
    setError("");
    try {
      const next = await action();
      setAccount(next);
      setUsername(next.username ?? username);
      setPassword("");
      setToast(success);
    } catch (reason) {
      setError(reason instanceof AinuokeBridgeError ? reason.message : "艾诺科连接失败");
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    const wasConfigured = account.configured;
    await run(async () => {
      const next = await ainuokeBridgeClient.putAccount(currentUser.id, { username, password });
      void operationLogRepository.append(createAinuokeAccountOperationLog({ actor: { userId: currentUser.id, userName: currentUser.name }, action: wasConfigured ? "更新艾诺科个人账号" : "绑定艾诺科个人账号", result: "success" })).catch(() => undefined);
      return next;
    }, wasConfigured ? "艾诺科个人账号已更新" : "艾诺科个人账号已绑定");
  };

  const testConnection = async () => {
    setWorking(true);
    setError("");
    try {
      const next = password
        ? await ainuokeBridgeClient.testAccount(currentUser.id, { username, password })
        : await ainuokeBridgeClient.testAccount(currentUser.id);
      if (!password) setAccount(next);
      setToast(password ? "艾诺科连接测试成功；新输入的凭据尚未保存" : "艾诺科连接测试成功");
    } catch (reason) {
      setError(reason instanceof AinuokeBridgeError ? reason.message : "艾诺科连接失败");
    } finally {
      setWorking(false);
    }
  };

  const unbind = async () => {
    setWorking(true);
    setError("");
    try {
      await ainuokeBridgeClient.deleteAccount(currentUser.id);
      void operationLogRepository.append(createAinuokeAccountOperationLog({ actor: { userId: currentUser.id, userName: currentUser.name }, action: "解除艾诺科个人账号", result: "success" })).catch(() => undefined);
      setAccount(EMPTY_ACCOUNT);
      setUsername("");
      setPassword("");
      setToast("艾诺科个人账号已解除绑定");
    } catch (reason) {
      setError(reason instanceof AinuokeBridgeError ? reason.message : "解除绑定失败");
    } finally {
      setWorking(false);
    }
  };

  return <AppShell title="艾诺科账号"><PageContainer>
    <PageHeader eyebrow="MY SETTINGS · PERSONAL ACCOUNT" title="艾诺科账号" description="绑定当前织序用户自己的艾诺科账号；密码只保存到 Windows Credential Manager。" status={<StatusTag tone={account.status === "verified" ? "success" : account.status === "error" ? "danger" : "neutral"}>{statusLabel[account.status]}</StatusTag>} />
    <AlertBanner tone="warning" title="本地 Windows 原型">当前织序用户仍是浏览器 mock identity。本绑定不构成生产级多人认证或安全隔离；艾诺科上游当前为 HTTP。</AlertBanner>
    {error && <AlertBanner tone="danger" title="连接失败">{error}</AlertBanner>}
    <Card className="ainuoke-account-card">
      <fieldset disabled={!allowed || loading || working}>
        <header><div><strong>当前用户：{currentUser.name}</strong><small>个人账号不会成为公司共享账号，也不会授予同步或业务合同绑定权限。</small></div></header>
        <div className="ainuoke-account-grid">
          <label><span>用户名</span><input className="qc-control" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="输入本人的艾诺科用户名" /></label>
          <label><span>{account.configured ? "新密码" : "密码"}</span><input className="qc-control" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder={account.configured ? "留空不会读取或显示原密码" : "输入密码"} /></label>
        </div>
        <dl className="ainuoke-account-status"><div><dt>状态</dt><dd>{statusLabel[account.status]}</dd></div><div><dt>最近验证时间</dt><dd>{formatTime(account.lastVerifiedAt)}</dd></div><div><dt>最近成功登录</dt><dd>{formatTime(account.lastSuccessfulLoginAt)}</dd></div><div><dt>最近错误</dt><dd>{account.lastErrorCode ?? "无"}</dd></div></dl>
        <footer>
          <Button variant="secondary" disabled={!account.configured && (!username.trim() || !password)} onClick={() => void testConnection()}>测试连接</Button>
          {account.configured && <Button variant="danger" onClick={() => void unbind()}>解除绑定</Button>}
          <Button disabled={!username.trim() || !password} onClick={() => void save()}>{account.configured ? "更新密码" : "保存"}</Button>
        </footer>
      </fieldset>
    </Card>
    {!allowed && <AlertBanner tone="warning" title="暂无权限">当前角色没有 `ainuoke.account.bind_self`，请联系管理员分配该 self-scoped capability。</AlertBanner>}
    <Toast message={toast} />
  </PageContainer></AppShell>;
}
