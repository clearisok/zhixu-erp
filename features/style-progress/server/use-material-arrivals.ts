"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useServerSession } from "../../server-auth";
import { arrivalUuid, parseArrivalCommand, type ArrivalCommand, type ArrivalIntent } from "../../../server/material-arrivals/contract";
import { materialArrivalsClient, MaterialArrivalError, materialArrivalMessage, type ArrivalLease, type ArrivalRead, type ArrivalResult } from "./material-arrivals-client";
import { acknowledgeMaterialArrivalPending, readMaterialArrivalPending, saveMaterialArrivalPending } from "./material-arrivals-pending";

type State = { token: object; read: ArrivalRead | null; loading: boolean; error: string; pending: ArrivalCommand | null;
  pendingUnavailable: boolean; busy: boolean; notice: string; verifiedUnknown: string | null };

export function useMaterialArrivals(orderId: string) {
  const session = useServerSession(), token = useMemo(() => ({ session, orderId }), [session, orderId]);
  const committed = useRef<object | null>(null), life = useRef({ epoch: 0 }), reads = useRef(0), activeRead = useRef<AbortController | null>(null);
  const mutation = useRef({ token, busy: false });
  useLayoutEffect(() => {
    const lifetime = life.current, readSequence = reads, request = activeRead;
    lifetime.epoch += 1; committed.current = token; mutation.current = { token, busy: false };
    return () => { committed.current = null; lifetime.epoch += 1; readSequence.current += 1; request.current?.abort(); };
  }, [token]);
  const [state, setState] = useState<State>({ token, read: null, loading: true, error: "", pending: null, pendingUnavailable: false, busy: false, notice: "", verifiedUnknown: null });
  const lease = useCallback((): ArrivalLease => { const epoch = life.current.epoch; return () => committed.current === token && life.current.epoch === epoch && session.status === "authenticated"; }, [token, session.status]);
  const patch = useCallback((current: ArrivalLease, values: Partial<State>) => { if (current()) setState(old => old.token === token ? { ...old, ...values } : { token, read: null, loading: false, error: "", pending: null, pendingUnavailable: false, busy: false, notice: "", verifiedUnknown: null, ...values }); }, [token]);
  const fail = useCallback((error: unknown, current: ArrivalLease) => {
    if (!current()) return; patch(current, { error: materialArrivalMessage(error) });
    if (error instanceof MaterialArrivalError && error.status === 401) session.invalidate();
  }, [patch, session]);
  const reload = useCallback(async () => {
    const current = lease(), sequence = ++reads.current; activeRead.current?.abort(); const controller = new AbortController(); activeRead.current = controller;
    const isCurrent = () => current() && reads.current === sequence && !controller.signal.aborted;
    patch(isCurrent, { loading: true, error: "" });
    try { const read = await materialArrivalsClient.read(orderId, isCurrent, controller.signal); patch(isCurrent, { read, loading: false }); return read; }
    catch (error) { if (isCurrent()) { patch(isCurrent, { ...(error instanceof MaterialArrivalError && [401, 403].includes(error.status) ? { read: null } : {}), loading: false }); fail(error, isCurrent); } throw error; }
  }, [lease, orderId, patch, fail]);
  useEffect(() => {
    const current = lease();
    queueMicrotask(() => {
      if (!current()) return;
      patch(current, { read: null, loading: true, error: "", notice: "", busy: false, verifiedUnknown: null });
      if (session.status === "authenticated" && session.user) {
        try { patch(current, { pending: readMaterialArrivalPending(window.sessionStorage, { userId: session.user.id }), pendingUnavailable: false }); }
        catch { patch(current, { pending: null, pendingUnavailable: true, notice: "本机原请求无法安全读取，已保留原记录；请先核对，不会发送新请求。" }); }
        void reload().catch(() => undefined);
      }
    });
  }, [token, session.status, session.user, lease, patch, reload]);
  const visible: State = useMemo(() => state.token === token ? state : { token, read: null, loading: true, error: "", pending: null, pendingUnavailable: false, busy: false, notice: "", verifiedUnknown: null }, [state, token]);
  const currentState = useRef(visible);
  useLayoutEffect(() => { currentState.current = visible; }, [visible]);
  const storageScope = () => { if (!session.user) throw new MaterialArrivalError(401, "authentication_required"); return { userId: arrivalUuid(session.user.id) }; };
  const finish = async (command: ArrivalCommand, result: ArrivalResult, current: ArrivalLease) => {
    if (!current()) throw new MaterialArrivalError(0, "arrival_owner_changed");
    acknowledgeMaterialArrivalPending(window.sessionStorage, storageScope(), command);
    patch(current, { pending: null, verifiedUnknown: null, notice: result.status === "applied" ? result.changed ? "原请求已确认保存。当前计划将另行读取。" : "原请求已确认，没有修改计划。" : materialArrivalMessage(new MaterialArrivalError(result.error.status, result.error.code)) });
    void reload().catch(() => undefined); return result;
  };
  const send = async (command: ArrivalCommand, current: ArrivalLease) => {
    try { return await finish(command, await materialArrivalsClient.submit(command, current), current); }
    catch (error) { fail(error, current); patch(current, { notice: "原请求已保留，请先核对结果；不会自动重试。" }); throw error; }
    finally { if (mutation.current.token === token) mutation.current.busy = false; patch(current, { busy: false }); }
  };
  const submit = async (intent: ArrivalIntent, previewHash: string) => {
    const current = lease(); if (!current() || mutation.current.busy || currentState.current.pending || currentState.current.pendingUnavailable) throw new MaterialArrivalError(409, "material_arrival_request_conflict");
    if (!globalThis.crypto?.randomUUID) throw new MaterialArrivalError(0, "arrival_client_unavailable");
    const command = parseArrivalCommand({ requestId: crypto.randomUUID(), intent, previewHash });
    mutation.current.busy = true;
    try { saveMaterialArrivalPending(window.sessionStorage, storageScope(), command); }
    catch (error) { mutation.current.busy = false; patch(current, { pendingUnavailable: true, notice: "原请求无法安全保存或已有待核对内容；未发送新请求。" }); throw error; }
    if (!current()) throw new MaterialArrivalError(0, "arrival_owner_changed");
    patch(current, { pending: command, busy: true, error: "", verifiedUnknown: null }); return send(command, current);
  };
  const check = async () => {
    const current = lease(), command = currentState.current.pending; if (!command || mutation.current.busy || !current()) return null;
    mutation.current.busy = true;
    patch(current, { busy: true, error: "", verifiedUnknown: null });
    try {
      const receipt = await materialArrivalsClient.receipt(command, current);
      if (receipt.state === "known") { await finish(command, receipt.result, current); return receipt; }
      patch(current, { verifiedUnknown: receipt.state === "unknown" ? command.requestId : null,
        notice: receipt.state === "pending" ? "原请求仍在处理中，请稍后再次核对。" : "暂未找到原请求结果；可继续核对，或明确重发完全相同的原请求。" }); return receipt;
    } catch (error) { fail(error, current); return null; }
    finally { if (mutation.current.token === token) mutation.current.busy = false; patch(current, { busy: false }); }
  };
  const retry = async () => {
    const current = lease(), v = currentState.current, command = v.pending;
    if (!current() || !command || mutation.current.busy || v.verifiedUnknown !== command.requestId) throw new MaterialArrivalError(409, "material_arrival_request_conflict");
    // Read back again immediately before the explicit original-command retry.
    saveMaterialArrivalPending(window.sessionStorage, storageScope(), command); mutation.current.busy = true; patch(current, { busy: true, error: "", verifiedUnknown: null }); return send(command, current);
  };
  return { ...visible, token, session, lease, reload, submit, check, retry,
    preview: (intent: ArrivalIntent, scope: ArrivalRead, current: ArrivalLease) => materialArrivalsClient.preview(intent, scope, current) };
}
export type MaterialArrivalsController = ReturnType<typeof useMaterialArrivals>;
