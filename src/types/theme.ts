export interface MoltThemeUI {
	background: string;
	backgroundSecondary: string;
	backgroundTertiary: string;
	foreground: string;
	foregroundSecondary: string;
	accent: string;
	border: string;
	success: string;
	warning: string;
	error: string;
	scrollbarThumb: string;
}

export interface MoltThemeEditor {
	background: string;
	foreground: string;
	cursor: string;
	selection: string;
	lineHighlight: string;
	gutterBackground: string;
	gutterForeground: string;
	gutterBorder: string;
}

export interface MoltThemeSyntax {
	keyword: string;
	string: string;
	number: string;
	comment: string;
	function: string;
	variable: string;
	type: string;
	operator: string;
	punctuation: string;
	property: string;
	constant: string;
	builtin: string;
	decorator: string;
}

export interface MoltThemeOutput {
	background: string;
	foreground: string;
	stderr: string;
	errorForeground: string;
	errorBackground: string;
}

export interface MoltThemeFont {
	editor: string;
	editorSize: string;
	ui: string;
	uiSize: string;
}

export interface MoltTheme {
	name: string;
	type: "light" | "dark";
	ui: MoltThemeUI;
	editor: MoltThemeEditor;
	syntax: MoltThemeSyntax;
	output: MoltThemeOutput;
	font: MoltThemeFont;
}

export interface ThemeInfo {
	name: string;
}
