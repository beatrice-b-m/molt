import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export function buildEditorExtensions(): Extension[] {
	const editorTheme = EditorView.theme(
		{
			"&": {
				backgroundColor: "var(--editor-bg)",
				color: "var(--editor-fg)",
			},
			".cm-content": {
				caretColor: "var(--editor-cursor)",
				fontFamily: "var(--font-mono)",
				fontSize: "var(--font-mono-size)",
				padding: "4px 0",
			},
			".cm-cursor, .cm-dropCursor": {
				borderLeftColor: "var(--editor-cursor)",
			},
			"&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
				backgroundColor: "var(--editor-selection)",
			},
			".cm-activeLine": {
				backgroundColor: "var(--editor-line-highlight)",
			},
			".cm-gutters": {
				backgroundColor: "var(--editor-gutter-bg)",
				color: "var(--editor-gutter-fg)",
				border: "none",
				borderRight: "1px solid var(--editor-gutter-border)",
			},
			".cm-activeLineGutter": {
				backgroundColor: "var(--editor-line-highlight)",
			},
			".cm-scroller": {
				overflow: "visible",
			},
		},
		{ dark: false },
	);

	const highlight = HighlightStyle.define([
		{ tag: tags.keyword, color: "var(--syntax-keyword)" },
		{ tag: tags.string, color: "var(--syntax-string)" },
		{ tag: tags.number, color: "var(--syntax-number)" },
		{ tag: [tags.lineComment, tags.blockComment], color: "var(--syntax-comment)", fontStyle: "italic" },
		{ tag: [tags.function(tags.variableName), tags.function(tags.definition(tags.variableName))], color: "var(--syntax-function)" },
		{ tag: tags.variableName, color: "var(--syntax-variable)" },
		{ tag: [tags.typeName, tags.className], color: "var(--syntax-type)" },
		{ tag: [tags.operator, tags.compareOperator, tags.arithmeticOperator, tags.logicOperator], color: "var(--syntax-operator)" },
		{ tag: [tags.paren, tags.squareBracket, tags.brace, tags.separator], color: "var(--syntax-punctuation)" },
		{ tag: [tags.propertyName, tags.definition(tags.propertyName)], color: "var(--syntax-property)" },
		{ tag: [tags.bool, tags.null, tags.special(tags.variableName)], color: "var(--syntax-constant)" },
		{ tag: tags.standard(tags.variableName), color: "var(--syntax-builtin)" },
		{ tag: tags.meta, color: "var(--syntax-decorator)" },
		{ tag: tags.self, color: "var(--syntax-constant)" },
	]);

	return [editorTheme, syntaxHighlighting(highlight)];
}