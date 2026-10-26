"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useServerSession } from "../server-auth";
import { createGarmentShipmentClient, GarmentReadError, garmentFreshnessAt, type GarmentReadLease } from "./client";
import { GARMENT_EMPTY_LABELS, type TimedGarmentView } from "./model";

const client = createGarmentShipmentClient();
type Block = (message: string) => void;
type ReadState<T> = { token: object; data: T | null; loading: boolean; error: GarmentReadError | null };

/** Read-only ownership follows the committed layout, including close/unmount.
 * A reused textual scope is insufficient for A -> B -> A or a new session. */
function useOwnedGarmentRead<T>(enabled: boolean, scope: string, read: (lease: GarmentReadLease) => Promise<T>, onBlock: Block) {
  const session = useServerSession();
  const allowed = session.status === "authenticated" && session.hasPermission("order.view") && session.hasPermission("ainuoke.view");
  const token = useMemo(() => ({ session, enabled, scope, read }), [session, enabled, scope, read]);
  const committed = useRef<object | null>(null), lifetime = useRef({ epoch: 0 }), sequence = useRef(0), active = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    const life = lifetime.current, request = active, reads = sequence;
    life.epoch++; committed.current = token;
    return () => { committed.current = null; life.epoch++; reads.current++; request.current?.abort(); };
  }, [token]);
  const [state, setState] = useState<ReadState<T>>({ token, data: null, loading: false, error: null });
  const lease = useCallback(() => {
    const epoch = lifetime.current.epoch;
    return () => committed.current === token && lifetime.current.epoch === epoch && enabled && allowed;
  }, [token, enabled, allowed]);
  const patch = useCallback((current: () => boolean, values: Partial<ReadState<T>>) => {
    if (current()) setState(old => ({ ...(old.token === token ? old : { token, data: null, loading: false, error: null }), ...values, token }));
  }, [token]);
  const reload = useCallback(async () => {
    const current = lease(); if (!current()) return;
    const request = ++sequence.current; active.current?.abort(); const controller = new AbortController(); active.current = controller;
    const isCurrent = () => current() && sequence.current === request && !controller.signal.aborted;
    patch(isCurrent, { data: null, loading: true, error: null });
    try { const data = await read({ isCurrent, signal: controller.signal }); patch(isCurrent, { data, loading: false }); }
    catch (error) {
      if (!isCurrent()) return;
      const safe = error instanceof GarmentReadError ? error : new GarmentReadError(0, "unavailable");
      patch(isCurrent, { data: null, loading: false, error: safe });
      if ([401, 403].includes(safe.status) || safe.code === "not_connected") onBlock(safe.message);
      if (safe.status === 401 && isCurrent()) session.invalidate();
    }
  }, [lease, patch, read, onBlock, session]);
  useEffect(() => { const current = lease(); queueMicrotask(() => { if (current()) void reload(); }); }, [lease, reload]);
  const visible: ReadState<T> = enabled && allowed && state.token === token ? state : { token, data: null, loading: enabled && allowed, error: null };
  return { ...visible, reload, lease, token };
}

export function useGarmentObservation(orderId: string, contract: string, enabled: boolean, publicationId: string | undefined, scope: string, onBlock: Block) {
  const read = useCallback(async (lease: GarmentReadLease) => {
    const result = await client.read(orderId, contract, { ...lease, publicationId });
    if (lease.isCurrent() && result.status === "empty" && result.model.sourceStatus !== "not_captured") onBlock(GARMENT_EMPTY_LABELS[result.model.sourceStatus]);
    return result;
  }, [orderId, contract, publicationId, onBlock]);
  const state = useOwnedGarmentRead(enabled, scope, read, onBlock);
  const [expiry, setExpiry] = useState<{ data: TimedGarmentView; stale: boolean } | null>(null);
  const data = state.data, readLease = state.lease;
  useEffect(() => {
    const current = readLease();
    if (!data || data.status !== "observed") return;
    const update = () => {
      if (!current()) return;
      let stale = true;
      try { stale = garmentFreshnessAt(data, performance.now()) === "stale"; } catch { /* uncertain elapsed time cannot extend freshness */ }
      setExpiry({ data, stale });
    };
    const remaining = data.deadline - performance.now();
    if (data.model.freshness === "stale" || remaining <= 0 || !Number.isFinite(remaining)) { queueMicrotask(update); return; }
    const timer = setTimeout(update, Math.min(remaining + 1, 86400000)); return () => clearTimeout(timer);
  }, [data, readLease]);
  return { ...state, stale: state.data?.status === "observed" && (state.data.model.freshness === "stale"
    || expiry?.data === state.data && expiry.stale || state.data.deadline <= state.data.receivedAt) };
}

export function useGarmentHistory(orderId: string, enabled: boolean, beforeGeneration: number | undefined, onBlock: Block) {
  const read = useCallback((lease: GarmentReadLease) => client.history(orderId, beforeGeneration, lease), [orderId, beforeGeneration]);
  return useOwnedGarmentRead(enabled, String(beforeGeneration ?? "first"), read, onBlock);
}
