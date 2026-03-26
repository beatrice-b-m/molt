import type { MoltTheme } from "../types/theme";

export function applyThemeToCss(theme: MoltTheme): void {
	const root = document.documentElement;
	const set = (name: string, value: string) => root.style.setProperty(name, value);

	// Color scheme
	root.style.colorScheme = theme.type;

	// UI
	set("--bg-primary", theme.ui.background);
	set("--bg-secondary", theme.ui.backgroundSecondary);
	set("--bg-tertiary", theme.ui.backgroundTertiary);
	set("--text-primary", theme.ui.foreground);
	set("--text-secondary", theme.ui.foregroundSecondary);
	set("--accent", theme.ui.accent);
	set("--border", theme.ui.border);
	set("--success", theme.ui.success);
	set("--warning", theme.ui.warning);
	set("--error", theme.ui.error);
	set("--scrollbar-thumb", theme.ui.scrollbarThumb);

	// Editor
	set("--editor-bg", theme.editor.background);
	set("--editor-fg", theme.editor.foreground);
	set("--editor-cursor", theme.editor.cursor);
	set("--editor-selection", theme.editor.selection);
	set("--editor-line-highlight", theme.editor.lineHighlight);
	set("--editor-gutter-bg", theme.editor.gutterBackground);
	set("--editor-gutter-fg", theme.editor.gutterForeground);
	set("--editor-gutter-border", theme.editor.gutterBorder);

	// Output
	set("--output-bg", theme.output.background);
	set("--output-fg", theme.output.foreground);
	set("--output-stderr", theme.output.stderr);
	set("--output-error-fg", theme.output.errorForeground);
	set("--output-error-bg", theme.output.errorBackground);

	// Font
	set("--font-mono", theme.font.editor);
	set("--font-mono-size", theme.font.editorSize);
	set("--font-system", theme.font.ui);
	set("--font-system-size", theme.font.uiSize);
}
