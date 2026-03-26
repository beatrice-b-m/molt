import { useEffect, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import type { Cell as CellType } from "../types/notebook";
import { useNotebookStore } from "../store/notebookStore";
import { interruptKernel } from "../hooks/useKernel";
import { executeSingleCell } from "../hooks/execution";
import { CellOutput as CellOutputView } from "./CellOutput";
import { useThemeStore } from "../theme/store";
import { buildEditorExtensions } from "../theme/codemirror";



// ---------------------------------------------------------------------------
// Cell component
// ---------------------------------------------------------------------------
interface Props {
	cell: CellType;
	tabIndex: number;
	/** Whether this is the last cell in the notebook (for Shift+Enter auto-append). */
	isLast?: boolean;
}

export function Cell({ cell, tabIndex }: Props) {
	const deleteCell = useNotebookStore((s) => s.deleteCell);
	const moveCellUp = useNotebookStore((s) => s.moveCellUp);
	const moveCellDown = useNotebookStore((s) => s.moveCellDown);
	const updateCellSource = useNotebookStore((s) => s.updateCellSource);
	const focusedCellId = useNotebookStore((s) => s.focusedCellId);
	const setFocusedCellId = useNotebookStore((s) => s.setFocusedCellId);
	const theme = useThemeStore((s) => s.theme);

	const [hovered, setHovered] = useState(false);
	const editorContainerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const themeCompartment = useRef(new Compartment());

	// These values are stable for the lifetime of a Cell instance.
	const cellIdRef = useRef(cell.id);
	const tabIndexRef = useRef(tabIndex);
	// Keep a live ref to avoid stale closure in the updateListener.
	const updateCellSourceRef = useRef(updateCellSource);
	useEffect(() => {
		updateCellSourceRef.current = updateCellSource;
	});

	// ------------------------------------------------------------------
	// CodeMirror lifecycle: create on mount, destroy on unmount.
	// ------------------------------------------------------------------
	useEffect(() => {
		if (!editorContainerRef.current) return;

		// Read initial source fresh from the store rather than relying on the
		// captured prop value, which may be slightly stale on strict-mode double
		// invocation.
		const initialSource =
			useNotebookStore
				.getState()
				.notebooks.find((nb) => nb.tabIndex === tabIndexRef.current)
				?.cells.find((c) => c.id === cellIdRef.current)?.source ?? "";

		const view = new EditorView({
			state: EditorState.create({
				doc: initialSource,
				extensions: [
					basicSetup,
					python(),
					// Execution keybindings at highest precedence so they
					// override basicSetup's defaultKeymap, which binds
					// Shift+Enter to insertNewlineAndIndent via its
					// { key: "Enter", shift: ... } property.
					Prec.highest(keymap.of([
						{
							key: "Shift-Enter",
							run: () => {
								executeSingleCell(tabIndexRef.current, cellIdRef.current);
								return true;
							},
						},
						{
							key: "Mod-Enter",
							run: () => {
								executeSingleCell(tabIndexRef.current, cellIdRef.current);
								return true;
							},
						},
					])),
					keymap.of([indentWithTab, ...defaultKeymap]),
					themeCompartment.current.of(buildEditorExtensions(theme!)),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							updateCellSourceRef.current(
								tabIndexRef.current,
								cellIdRef.current,
								update.state.doc.toString(),
							);
						}
					}),
					// Auto-expanding: the editor grows with content instead of
					// introducing an internal scrollbar.
					EditorView.lineWrapping,
				],
			}),
			parent: editorContainerRef.current,
		});

		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// ------------------------------------------------------------------
	// Reconfigure CodeMirror theme when the Zustand theme store changes.
	// Uses the Compartment API for efficient extension replacement
	// without destroying the editor.
	// ------------------------------------------------------------------
	useEffect(() => {
		const view = viewRef.current;
		if (!view || !theme) return;
		view.dispatch({
			effects: themeCompartment.current.reconfigure(buildEditorExtensions(theme)),
		});
	}, [theme]);

	// ------------------------------------------------------------------
	// Sync store → editor when source changes from outside this editor
	// (e.g. programmatic clear, paste from another tab).
	// Guard: if the change came from this editor, the doc already matches
	// cell.source so the dispatch is skipped — no infinite loop.
	// ------------------------------------------------------------------
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const current = view.state.doc.toString();
		if (current !== cell.source) {
			view.dispatch({
				changes: { from: 0, to: current.length, insert: cell.source },
			});
		}
	}, [cell.source]);

	// ------------------------------------------------------------------
	// Focus this editor when the store requests it (Jupyter-style advance).
	// Clear focusedCellId after consuming so a repeat run of the same
	// predecessor can re-trigger the focus.
	// ------------------------------------------------------------------
	useEffect(() => {
		if (focusedCellId === cell.id && viewRef.current) {
			viewRef.current.focus();
			setFocusedCellId(null);
		}
	}, [focusedCellId, cell.id, setFocusedCellId]);

	// ------------------------------------------------------------------
	// Run / interrupt handler
	// ------------------------------------------------------------------
	function handleRunClick() {
		if (cell.state === "running") {
			// Best-effort interrupt; ignore errors (kernel may already be idle).
			interruptKernel(tabIndex).catch(() => {});
		} else {
			executeSingleCell(tabIndex, cell.id);
		}
	}

	const runButtonContent = cell.state === "running" ? "■" : "▶";
	const runButtonTitle = cell.state === "running" ? "Interrupt" : "Run cell";

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				borderBottom: "1px solid var(--border)",
				position: "relative",
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			{/* Cell controls — top-right corner, visible on hover */}
			{hovered && (
				<div
					style={{
						position: "absolute",
						top: 4,
						right: 4,
						display: "flex",
						gap: 4,
						zIndex: 10,
					}}
				>
					<ControlButton title="Move up" onClick={() => moveCellUp(tabIndex, cell.id)}>
						↑
					</ControlButton>
					<ControlButton title="Move down" onClick={() => moveCellDown(tabIndex, cell.id)}>
						↓
					</ControlButton>
					<ControlButton title="Delete cell" onClick={() => deleteCell(tabIndex, cell.id)}>
						×
					</ControlButton>
				</div>
			)}

			{/* Main row: gutter + editor */}
			<div style={{ display: "flex", alignItems: "stretch" }}>
				{/* Gutter */}
				<div
					style={{
						width: 48,
						minWidth: 48,
						flexShrink: 0,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						paddingTop: 6,
						gap: 4,
					borderRight: "1px solid var(--editor-gutter-border)",
					backgroundColor: "var(--editor-gutter-bg)",
					}}
				>
					{/* Execution count label: [N] when set, empty otherwise */}
					<span
						style={{
							fontSize: 10,
						color: "var(--editor-gutter-fg)",
							fontFamily: "monospace",
							minHeight: 14,
							userSelect: "none",
						}}
					>
						{cell.executionCount !== null ? `[${cell.executionCount}]` : ""}
					</span>

					{/* Run / interrupt button */}
						<button
							title={runButtonTitle}
							onClick={handleRunClick}
							style={{
								background: "none",
								border: "none",
								cursor: "pointer",
								color: cell.state === "running"
						? "var(--warning)"
						: "var(--accent)",
								fontSize: 12,
								padding: "2px 4px",
								lineHeight: 1,
								userSelect: "none",
							}}
						>
						{runButtonContent}
					</button>
				</div>

				{/* CodeMirror editor container */}
				<div
					ref={editorContainerRef}
					style={{
						flex: 1,
						minWidth: 0, // allow flex child to shrink below content width
					backgroundColor: "var(--editor-bg)",
					}}
				/>
			</div>

			{/* Output area — only rendered when there are outputs */}
			<CellOutputView outputs={cell.outputs} />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Minimal shared button for the hover controls — keeps the Cell JSX readable.
// ---------------------------------------------------------------------------
function ControlButton({
	children,
	title,
	onClick,
}: {
	children: React.ReactNode;
	title: string;
	onClick: () => void;
}) {
	return (
		<button
			title={title}
			onClick={onClick}
			style={{
				background: "var(--bg-tertiary)",
				border: "1px solid var(--border)",
				borderRadius: 3,
				color: "var(--text-secondary)",
				cursor: "pointer",
				fontSize: 12,
				lineHeight: 1,
				padding: "2px 5px",
				userSelect: "none",
			}}
		>
			{children}
		</button>
	);
}
