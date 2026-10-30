import assert from "node:assert/strict";
import test from "node:test";
import { defaultBasicSettings } from "../model/basic-settings";
import { loadBasicSettings, saveBasicSettings } from "../repository/basic-settings-repository";
import { defaultGlobalQuoteSettings, loadGlobalQuoteSettings, saveGlobalQuoteSettings } from "../../quote-center/model/quote-settings";
import { dispatchMasterMutation, masterSettingsAuthority, parseMasterSettingsAuthority } from "./master-settings-authority";
import { createQuoteMasterServerClient, QuoteMasterServerError } from "../server/quote-master-server-client";
import type { QuoteMasterServerClient } from "../server/quote-master-server-client";
import { createServerQuoteMasterDependencies } from "../server/quote-master-dependencies";
import { resetAllLocalBusinessData, restoreValidatedLocalDataBackup } from "../../data-management/service/data-management-service";
import type { LocalDataBackup } from "../../data-management/model/data-backup";

function storage() {
  const values = new Map<string, string>();
  let writes = 0;
  return {
    values,
    get writes() { return writes; },
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { writes += 1; values.set(key, value); },
    removeItem(key: string) { writes += 1; values.delete(key); },
  };
}

test("Q3 authority defaults to Browser and rejects invalid configuration", () => {
  assert.equal(parseMasterSettingsAuthority(undefined), "browser");
  assert.equal(parseMasterSettingsAuthority("browser"), "browser");
  assert.equal(parseMasterSettingsAuthority("frozen"), "frozen");
  assert.equal(parseMasterSettingsAuthority("server"), "server");
  assert.throws(() => parseMasterSettingsAuthority("unknown"), /Invalid Q3/u);
});

test("frozen Q3 reads existing Browser envelopes without writes; frozen/server writes fail closed", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousMode = process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY;
  const localStorage = storage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, location: { port: "3001", hostname: "127.0.0.1" } } });
  try {
    process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY = "browser";
    assert.equal(masterSettingsAuthority(), "browser");
    const savedBasic = saveBasicSettings(defaultBasicSettings);
    const savedGlobal = saveGlobalQuoteSettings(defaultGlobalQuoteSettings);
    const before = localStorage.writes;
    process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY = "frozen";
    assert.deepEqual(loadBasicSettings(), savedBasic);
    assert.deepEqual(loadGlobalQuoteSettings(), savedGlobal);
    assert.equal(localStorage.writes, before);
    assert.throws(() => saveBasicSettings(defaultBasicSettings), /disabled/u);
    assert.throws(() => saveGlobalQuoteSettings(defaultGlobalQuoteSettings), /disabled/u);
    assert.equal(localStorage.writes, before);
    process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY = "server";
    assert.throws(() => loadBasicSettings(), /disabled/u);
    assert.throws(() => loadGlobalQuoteSettings(), /disabled/u);
    assert.throws(() => saveBasicSettings(defaultBasicSettings), /disabled/u);
    assert.throws(() => saveGlobalQuoteSettings(defaultGlobalQuoteSettings), /disabled/u);
    assert.equal(localStorage.writes, before);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY;
    else process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY = previousMode;
  }
});

test("frozen Q3 refuses to seed a missing source record", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousMode = process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY;
  const localStorage = storage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, location: { port: "3001", hostname: "127.0.0.1" } } });
  try {
    process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY = "frozen";
    assert.throws(() => loadBasicSettings(), /missing/u);
    assert.throws(() => loadGlobalQuoteSettings(), /missing/u);
    assert.equal(localStorage.writes, 0);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY;
    else process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY = previousMode;
  }
});

test("frozen/server Q3 rejects whole-namespace restore and reset before any Browser write", async () => {
  const previousMode = process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY;
  try {
    for (const mode of ["frozen", "server"]) {
      process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY = mode;
      await assert.rejects(() => restoreValidatedLocalDataBackup({} as LocalDataBackup), /disabled/u);
      await assert.rejects(() => resetAllLocalBusinessData("重置全部本地业务数据"), /disabled/u);
    }
  } finally {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY;
    else process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY = previousMode;
  }
});

test("Quick Create authority dispatch uses Server only, preserves failures and blocks frozen writes", async () => {
  let browserWrites = 0;
  let serverWrites = 0;
  const browser = () => { browserWrites += 1; return "browser-id"; };
  const server = async () => { serverWrites += 1; return "server-uuid"; };
  assert.equal(await dispatchMasterMutation("browser", server, browser), "browser-id");
  assert.equal(await dispatchMasterMutation("server", server, browser), "server-uuid");
  assert.equal(browserWrites, 1);
  assert.equal(serverWrites, 1);
  await assert.rejects(() => dispatchMasterMutation("frozen", server, browser), /frozen/u);
  await assert.rejects(() => dispatchMasterMutation("server", undefined, browser), /unavailable/u);
  assert.equal(browserWrites, 1);
  assert.equal(serverWrites, 1);
  for (const status of [401, 403, 409] as const) {
    await assert.rejects(
      () => dispatchMasterMutation("server", async () => { throw new QuoteMasterServerError(status, "test_failure", "safe failure"); }, browser),
      (error: unknown) => error instanceof QuoteMasterServerError && error.status === status,
    );
  }
  await assert.rejects(() => dispatchMasterMutation("server", async () => { throw new QuoteMasterServerError(0, "server_unavailable", "Network unavailable"); }, browser), /Network unavailable/u);
  assert.equal(browserWrites, 1);
});

test("Q3 Server client fails closed for auth, conflict, network and malformed responses", async () => {
  for (const status of [401, 403, 409] as const) {
    const client = createQuoteMasterServerClient({ fetchImpl: async () => new Response(JSON.stringify({ error: { code: "safe_failure" } }), { status }) });
    await assert.rejects(() => client.listBrands(), (error: unknown) => error instanceof QuoteMasterServerError && error.status === status);
  }
  const network = createQuoteMasterServerClient({ fetchImpl: async () => { throw new Error("transport"); } });
  await assert.rejects(() => network.listBrands(), (error: unknown) => error instanceof QuoteMasterServerError && error.code === "server_unavailable");
  const invalid = createQuoteMasterServerClient({ fetchImpl: async () => new Response("{}", { status: 200 }) });
  await assert.rejects(() => invalid.listBrands(), (error: unknown) => error instanceof QuoteMasterServerError && error.code === "invalid_server_response");
  await assert.rejects(() => invalid.getSettings(), (error: unknown) => error instanceof QuoteMasterServerError && error.code === "invalid_server_response");
  await assert.rejects(() => invalid.resolveDefaults(), (error: unknown) => error instanceof QuoteMasterServerError && error.code === "invalid_server_response");
});

test("Quote Editor Server dependencies preserve Server identities, null/zero defaults and no Browser fallback", async () => {
  const timestamp = "2026-09-28T00:00:00.000Z";
  const serverId = "11111111-1111-4111-8111-111111111111";
  let created = 0;
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  const client: QuoteMasterServerClient = {
    listBrands: async () => [], createBrand: async (input) => { created += 1; return { id: serverId, ...input, defaults: { ...input.defaults, defaultTrims: input.defaults.defaultTrims.map((trim, index) => ({ id: `config-${index}`, position: index, ...trim })) }, version: 0, createdAt: timestamp, updatedAt: timestamp }; }, updateBrand: unused,
    listSalespeople: async () => [], createSalesperson: unused, updateSalesperson: unused,
    listFabrics: async () => [], createFabric: unused, updateFabric: unused,
    listTrims: async () => [], createTrim: unused, updateTrim: unused,
    supplierSuggestions: async () => ["Server Supplier"],
    getSettings: async () => null, listPresets: async () => [], saveSettingsBundle: unused,
    resolveDefaults: async () => ({
      usdCnyRate: "0", markupRate: null, laborCurrency: "CNY", laborDescription: null,
      otherCost: { name: "Default Other", amount: null }, manufacturingPreset: null,
      trims: [{ id: "config-1", trimLibraryItemId: "trim-1", position: 0, overrideLossRate: null, overrideUnitPrice: "0", name: "Trim", specification: "", supplier: "Server Supplier", unit: "pcs", lossRate: null, unitPrice: "0" }],
      source: { usdCnyRate: "system", otherCost: "system", trims: "brand" },
    }),
  };
  const dependencies = createServerQuoteMasterDependencies(["quote.view", "settings.brand.edit"], client);
  const initial = await dependencies.load();
  assert.deepEqual(initial.supplierOptions, ["Server Supplier"]);
  assert.deepEqual(initial.state.brands, []);
  const defaults = await dependencies.resolveDefaults();
  assert.equal(defaults.usdCnyRate, 0);
  assert.equal(defaults.otherCost?.amount, null);
  assert.equal(defaults.trims[0].unitPrice, 0);
  assert.equal(defaults.trims[0].usage, null);
  assert.equal(defaults.trims[0].sourceOrigin, "brand");
  const businessDefaults = createServerQuoteMasterDependencies(["quote.view"], { ...client, resolveDefaults: async () => {
    const value = await client.resolveDefaults();
    return { ...value, source: { ...value.source, trims: "salesperson" } };
  } });
  assert.equal((await businessDefaults.resolveDefaults()).trims[0].sourceOrigin, "salesperson");
  const next = { ...initial.state, brands: [{ id: "temporary", name: "Server Brand", status: "active" as const, defaults: { defaultUsdCnyRate: null, defaultOtherCost: null, defaultTrims: [] } }] };
  const saved = await dependencies.persist("brands", initial.state, next);
  assert.equal(saved.createdId, serverId);
  assert.equal(saved.state.brands[0].id, serverId);
  assert.equal(created, 1);
});
