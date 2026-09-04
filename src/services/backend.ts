import { invoke } from "@tauri-apps/api/core";
import type { KernelResponse, KernelState } from "../types/notebook";

export interface AppConfig {
	python: { interpreter: string };
	app: { auto_launch: boolean; tab_count: number; native_effects: boolean };
}

export const ensureKernel = (tabIndex: number) => invoke<KernelState>("ensure_kernel", { tabIndex });
export const executeCell = (tabIndex: number, cellId: string, code: string) =>
	invoke<KernelResponse>("execute_cell", { tabIndex, cellId, code });
export const restartKernel = (tabIndex: number) => invoke<KernelState>("restart_kernel", { tabIndex });
export const stopKernel = (tabIndex: number) => invoke<void>("stop_kernel", { tabIndex });
export const interruptKernel = (tabIndex: number) => invoke<void>("interrupt_kernel", { tabIndex });
export const getKernelStatus = (tabIndex: number) => invoke<KernelState>("get_kernel_status", { tabIndex });
export const getConfigWarning = () => invoke<string | null>("get_config_warning");
export const getConfig = () => invoke<AppConfig>("get_config");
export const saveConfig = (config: AppConfig) => invoke<void>("save_config", { config });
export const setNativeEffects = (enabled: boolean) => invoke<void>("set_native_effects", { enabled });
export const loadNotebooks = () => invoke<string | null>("load_notebooks");
export const saveNotebooks = (data: string) => invoke<void>("save_notebooks", { data });
