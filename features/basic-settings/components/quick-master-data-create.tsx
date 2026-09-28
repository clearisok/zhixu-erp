"use client";

import { useState } from "react";
import { Button, Modal, useFormSubmitting } from "@/components/foundation";
import { usePermissions } from "@/features/permissions";
import { createBasicSettingsOperationLogs, operationLogRepository } from "@/features/operation-logs";
import {
  supplierSuggestions,
  upsertBrand,
  upsertCustomerSalesperson,
  upsertTrimLibraryItem,
  validateBrandName,
  validateCustomerSalespersonName,
  type BasicSettingsState,
  type BrandRecord,
  type CustomerSalespersonRecord,
  type TrimLibraryItem,
} from "../model/basic-settings";
import { saveBasicSettings } from "../repository/basic-settings-repository";
import { dispatchMasterMutation, type MasterSettingsAuthority } from "../authority/master-settings-authority";
import type { BasicSettingsServerScope } from "../server/server-basic-settings-adapter";
import type { BasicSettingsPersistResult } from "./basic-settings-controller";
import type { PermissionKey } from "../../permissions/model/permissions";
import {
  appendDefaultTrim,
  BrandFormFields,
  createBrandDraft,
  createSalespersonDraft,
  createTrimLibraryDraft,
  draftToDefaultConfiguration,
  QuickTrimDrawer,
  SalespersonFormFields,
  type BrandDraft,
  type SalespersonDraft,
} from "./master-data-forms";

export type QuickMasterDataRequest =
  | { kind: "brand"; query: string }
  | { kind: "salesperson"; query: string; brandId: string };

type QuickMasterDataCreateProps = {
  request: QuickMasterDataRequest | null;
  state: BasicSettingsState;
  onStateChange: (state: BasicSettingsState) => void;
  onClose: () => void;
  onBrandCreated: (brand: BrandRecord, state: BasicSettingsState) => void;
  onSalespersonCreated: (salesperson: CustomerSalespersonRecord, state: BasicSettingsState) => void;
  notify: (message: string) => void;
  authority?: MasterSettingsAuthority;
  canMaster?: (permission: PermissionKey) => boolean;
  persistMaster?: (scope: BasicSettingsServerScope, next: BasicSettingsState) => Promise<BasicSettingsPersistResult>;
};

function SaveAndUseButton() {
  const submitting = useFormSubmitting();
  return <Button type="submit" disabled={submitting}>{submitting ? "保存中…" : "保存并使用"}</Button>;
}

export function QuickMasterDataCreate(props: QuickMasterDataCreateProps) {
  const { request } = props;
  if (!request) return null;
  const sessionKey = request.kind === "brand" ? `brand:${request.query}` : `salesperson:${request.brandId}:${request.query}`;
  return <QuickMasterDataCreateSession key={sessionKey} {...props} request={request} />;
}

function QuickMasterDataCreateSession({
  request,
  state,
  onStateChange,
  onClose,
  onBrandCreated,
  onSalespersonCreated,
  notify,
  authority = "browser",
  canMaster,
  persistMaster,
}: Omit<QuickMasterDataCreateProps, "request"> & { request: QuickMasterDataRequest }) {
  const { can: browserCan, currentUser } = usePermissions();
  const can = canMaster ?? browserCan;
  const [brandDraft, setBrandDraft] = useState<BrandDraft | null>(() => request.kind === "brand" ? createBrandDraft(request.query) : null);
  const [salespersonDraft, setSalespersonDraft] = useState<SalespersonDraft | null>(() => request.kind === "salesperson" ? createSalespersonDraft(request.brandId, request.query) : null);
  const [trimDraft, setTrimDraft] = useState<TrimLibraryItem | null>(null);
  const [error, setError] = useState("");
  const [trimError, setTrimError] = useState("");

  const persist = async (scope: BasicSettingsServerScope, next: BasicSettingsState): Promise<BasicSettingsPersistResult> => {
    return dispatchMasterMutation(authority,
      persistMaster ? async () => {
        const result = await persistMaster(scope, next);
        onStateChange(result.state);
        return result;
      } : undefined,
      () => {
        const saved = saveBasicSettings(next);
        const logs = createBasicSettingsOperationLogs(state, saved, { userId: currentUser.id, userName: currentUser.name });
        onStateChange(saved);
        void operationLogRepository.appendMany(logs).catch((technicalError) => reportFailure(technicalError));
        return { state: saved };
      });
  };

  const reportFailure = (technicalError: unknown) => {
    if (process.env.NODE_ENV !== "production") console.error("Quick master data save failed", technicalError);
    const status = technicalError && typeof technicalError === "object" && "status" in technicalError ? (technicalError as { status?: unknown }).status : undefined;
    const message = status === 401 ? "Server 会话已失效；未写入 Browser。" : status === 403 ? "Server 权限不足；未写入 Browser。" : status === 409 ? "Server 数据已变更；当前草稿保留，请重新核对。" : "保存失败；当前草稿保留，未回退 Browser。";
    setError(message);
    setTrimError(message);
    notify(message);
  };

  const saveBrand = async () => {
    if (!brandDraft || !can("settings.brand.edit")) return;
    const validationError = validateBrandName(state, brandDraft.name, brandDraft.id);
    if (validationError) { setError(validationError); return; }
    const brand: BrandRecord = { id: brandDraft.id, name: brandDraft.name.trim(), status: "active", defaults: draftToDefaultConfiguration(brandDraft.defaults, brandDraft.id) };
    try {
      const saved = await persist("brands", upsertBrand(state, brand));
      const created = saved.state.brands.find((item) => item.id === (saved.createdId ?? brand.id));
      if (!created) throw new Error("Created Server brand is missing");
      onClose();
      onBrandCreated(created, saved.state);
    } catch (technicalError) { reportFailure(technicalError); }
  };

  const saveSalesperson = async () => {
    if (!salespersonDraft || !can("settings.salesperson.edit")) return;
    const validationError = validateCustomerSalespersonName(state, salespersonDraft.name, salespersonDraft.id);
    if (validationError) { setError(validationError); return; }
    if (!salespersonDraft.brandId || !state.brands.some((brand) => brand.id === salespersonDraft.brandId)) { setError("请选择有效的归属品牌"); return; }
    const salesperson: CustomerSalespersonRecord = { id: salespersonDraft.id, name: salespersonDraft.name.trim(), brandId: salespersonDraft.brandId, status: "active", defaults: draftToDefaultConfiguration(salespersonDraft.defaults, salespersonDraft.id) };
    try {
      const saved = await persist("salespeople", upsertCustomerSalesperson(state, salesperson));
      const created = saved.state.customerSalespeople.find((item) => item.id === (saved.createdId ?? salesperson.id));
      if (!created) throw new Error("Created Server salesperson is missing");
      onClose();
      onSalespersonCreated(created, saved.state);
    } catch (technicalError) { reportFailure(technicalError); }
  };

  const openTrim = (query: string) => {
    if (!can("settings.trim.edit")) return;
    setTrimError("");
    setTrimDraft(createTrimLibraryDraft(query));
  };

  const saveTrim = async () => {
    if (!trimDraft || !can("settings.trim.edit")) return;
    if (!trimDraft.name.trim()) { setTrimError("请填写辅料名称"); return; }
    if (!trimDraft.unit.trim()) { setTrimError("请填写辅料单位"); return; }
    try {
      const item = { ...trimDraft, name: trimDraft.name.trim(), unit: trimDraft.unit.trim() };
      const saved = await persist("trims", upsertTrimLibraryItem(state, item));
      const trimId = saved.createdId ?? item.id;
      if (brandDraft) setBrandDraft({ ...brandDraft, defaults: appendDefaultTrim(brandDraft.defaults, trimId) });
      if (salespersonDraft) setSalespersonDraft({ ...salespersonDraft, defaults: appendDefaultTrim(salespersonDraft.defaults, trimId) });
      setTrimDraft(null);
      notify(`辅料“${item.name}”已保存到辅料库并选用`);
    } catch (technicalError) { reportFailure(technicalError); }
  };

  const fixedBrand = request?.kind === "salesperson" ? state.brands.find((brand) => brand.id === request.brandId) : undefined;
  const isBrand = request?.kind === "brand";
  return <>
    <Modal
      open={Boolean(request)}
      title={isBrand ? "新建品牌" : "新建客户业务员"}
      description={isBrand ? "最快只需填写品牌名称；默认报价资料可稍后维护。" : `为当前品牌“${fixedBrand?.name ?? "—"}”创建客户业务员。`}
      onClose={onClose}
      onSubmit={isBrand ? saveBrand : saveSalesperson}
      className="qc-quick-master-modal qc-master-data-long-form-modal"
      footer={<><Button variant="secondary" onClick={onClose}>取消</Button><SaveAndUseButton /></>}
    >
      {brandDraft && <BrandFormFields draft={brandDraft} trimLibrary={state.trimLibrary} onChange={(next) => { setBrandDraft(next); setError(""); }} error={error} compact canCreateTrim={can("settings.trim.edit")} onCreateTrim={openTrim} />}
      {salespersonDraft && <SalespersonFormFields draft={salespersonDraft} brands={state.brands} fixedBrand={fixedBrand} trimLibrary={state.trimLibrary} onChange={(next) => { setSalespersonDraft(next); setError(""); }} error={error} compact canCreateTrim={can("settings.trim.edit")} onCreateTrim={openTrim} />}
    </Modal>
    <QuickTrimDrawer open={Boolean(trimDraft)} draft={trimDraft} supplierOptions={supplierSuggestions(state)} error={trimError} onChange={(next) => { setTrimDraft(next); setTrimError(""); }} onClose={() => setTrimDraft(null)} onSubmit={saveTrim} />
  </>;
}
