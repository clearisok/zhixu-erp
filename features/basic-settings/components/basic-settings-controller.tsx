"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BasicSettingsState } from "../model/basic-settings";

export type BasicSettingsPersistResult = {
  state: BasicSettingsState;
  supplierOptions?: string[];
  createdId?: string;
};

export type BasicSettingsController = {
  state: BasicSettingsState;
  supplierOptions?: string[];
  persist(next: BasicSettingsState): Promise<BasicSettingsPersistResult>;
  reload(): Promise<void>;
};

const BasicSettingsControllerContext = createContext<BasicSettingsController | null>(null);

export function BasicSettingsControllerProvider({ value, children }: { value: BasicSettingsController; children: ReactNode }) {
  return <BasicSettingsControllerContext.Provider value={value}>{children}</BasicSettingsControllerContext.Provider>;
}

export function useScopedBasicSettingsController(): BasicSettingsController | null {
  return useContext(BasicSettingsControllerContext);
}
