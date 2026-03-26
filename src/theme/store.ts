import { create } from "zustand";
import type { MoltTheme } from "../types/theme";

interface ThemeState {
	theme: MoltTheme | null;
	setTheme: (theme: MoltTheme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
	theme: null,
	setTheme: (theme) => set({ theme }),
}));
