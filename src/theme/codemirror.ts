import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { MoltTheme } from "../types/theme";

export function buildEditorExtensions(theme: MoltTheme): Extension[] {
	const editorTheme = EditorView.theme(
		{
			"&": {
				backgroundColor: theme.editor.background,
				color: theme.editor.foreground,
			},
			".cm-content": {
				caretColor: theme.editor.cursor,
				fontFamily: theme.font.editor,
				fontSize: theme.font.editorSize,
				padding: "4px 0",
			},
			".cm-cursor, .cm-dropCursor": {
				borderLeftColor: theme.editor.cursor,
			},
			"&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
				backgroundColor: theme.editor.selection,
			},
			".cm-activeLine": {
				backgroundColor: theme.editor.lineHighlight,
			},
			".cm-gutters": {
				backgroundColor: theme.editor.gutterBackground,
				color: theme.editor.gutterForeground,
				border: "none",
				borderRight: `1px solid ${theme.editor.gutterBorder}`,
			},
			".cm-activeLineGutter": {
				backgroundColor: theme.editor.lineHighlight,
			},
			".cm-scroller": {
				overflow: "visible",
			},
		},
		{ dark: theme.type === "dark" },
	);

	const highlight = HighlightStyle.define([
		{ tag: tags.keyword, color: theme.syntax.keyword },
		{ tag: tags.string, color: theme.syntax.string },
		{ tag: tags.number, color: theme.syntax.number },
		{ tag: [tags.lineComment, tags.blockComment], color: theme.syntax.comment, fontStyle: "italic" },
		{ tag: [tags.function(tags.variableName), tags.function(tags.definition(tags.variableName))], color: theme.syntax.function },
		{ tag: tags.variableName, color: theme.syntax.variable },
		{ tag: [tags.typeName, tags.className], color: theme.syntax.type },
		{ tag: [tags.operator, tags.compareOperator, tags.arithmeticOperator, tags.logicOperator], color: theme.syntax.operator },
		{ tag: [tags.paren, tags.squareBracket, tags.brace, tags.separator], color: theme.syntax.punctuation },
		{ tag: [tags.propertyName, tags.definition(tags.propertyName)], color: theme.syntax.property },
		{ tag: [tags.bool, tags.null, tags.special(tags.variableName)], color: theme.syntax.constant },
		{ tag: tags.standard(tags.variableName), color: theme.syntax.builtin },
		{ tag: tags.meta, color: theme.syntax.decorator },
		{ tag: tags.self, color: theme.syntax.constant },
	]);

	return [editorTheme, syntaxHighlighting(highlight)];
}
