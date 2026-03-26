import { invoke } from "@tauri-apps/api/core";
import type { KernelState, KernelResponse } from "../types/notebook";

export async function ensureKernel(tabIndex: number): Promise<KernelState> {
	const raw = await invoke<string>("ensure_kernel", { tabIndex });
	return JSON.parse(raw) as KernelState;
}

export async function executeCell(
	tabIndex: number,
	cellId: string,
	code: string,
): Promise<KernelResponse> {
	return invoke<KernelResponse>("execute_cell", {
		tabIndex,
		cellId,
		code,
	});
}

export async function restartKernel(tabIndex: number): Promise<KernelState> {
	const raw = await invoke<string>("restart_kernel", { tabIndex });
	return JSON.parse(raw) as KernelState;
}

export async function stopKernel(tabIndex: number): Promise<void> {
	await invoke<void>("stop_kernel", { tabIndex });
}

export async function interruptKernel(tabIndex: number): Promise<void> {
	await invoke<void>("interrupt_kernel", { tabIndex });
}

export async function getKernelStatus(tabIndex: number): Promise<KernelState> {
	const raw = await invoke<string>("get_kernel_status", { tabIndex });
	return JSON.parse(raw) as KernelState;
}

export async function getConfigWarning(): Promise<string | null> {
	return invoke<string | null>("get_config_warning");
}
