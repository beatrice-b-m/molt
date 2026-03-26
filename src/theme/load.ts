import { invoke } from "@tauri-apps/api/core";
import type { MoltTheme } from "../types/theme";

export async function loadActiveTheme(): Promise<MoltTheme> {
	const raw = await invoke<string>("load_active_theme");
	return JSON.parse(raw) as MoltTheme;
}

export async function loadThemeByName(name: string): Promise<MoltTheme> {
	const raw = await invoke<string>("load_theme", { name });
	return JSON.parse(raw) as MoltTheme;
}

export async function listThemes(): Promise<string[]> {
	return invoke<string[]>("list_themes");
}
