import { useEffect, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import type { Cell as CellType } from "../types/notebook";
import { useNotebookStore } from "../store/notebookStore";
import { interruptKernel } from "../hooks/useKernel";
import { executeSingleCell } from "../hooks/execution";
import { CellOutput as CellOutputView } from "./CellOutput";
import { buildEditorExtensions } from "../theme/codemirror";

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

	const [hovered, setHovered] = useState(false);
	const editorContainerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);

	const cellIdRef = useRef(cell.id);
	const tabIndexRef = useRef(tabIndex);
	const updateCellSourceRef = useRef(updateCellSource);
	useEffect(() => {
		updateCellSourceRef.current = updateCellSource;
	});

	useEffect(() => {
		if (!editorContainerRef.current) return;

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
					Prec.highest(
						keymap.of([
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
						]),
					),
					keymap.of([indentWithTab, ...defaultKeymap]),
					buildEditorExtensions(),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							updateCellSourceRef.current(
								tabIndexRef.current,
								cellIdRef.current,
								update.state.doc.toString(),
							);
						}
					}),
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

	useEffect(() => {
		if (focusedCellId === cell.id && viewRef.current) {
			viewRef.current.focus();
			setFocusedCellId(null);
		}
	}, [focusedCellId, cell.id, setFocusedCellId]);

	function handleRunClick() {
		if (cell.state === "running") {
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
				position: "relative",
				margin: "0 10px 10px",
				border: "1px solid var(--cell-border)",
				borderRadius: 12,
				background: "var(--cell-bg)",
				boxShadow: "var(--surface-shadow)",
				overflow: "hidden",
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			{hovered && (
				<div
					style={{
						position: "absolute",
						top: 6,
						right: 6,
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

			<div style={{ display: "flex", alignItems: "stretch" }}>
				<div
					style={{
						width: 52,
						minWidth: 52,
						flexShrink: 0,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						paddingTop: 8,
						gap: 6,
						borderRight: "1px solid var(--editor-gutter-border)",
						backgroundColor: "var(--editor-gutter-bg)",
					}}
				>
					<span
						style={{
							fontSize: 10,
							color: "var(--editor-gutter-fg)",
							fontFamily: "var(--font-mono)",
							minHeight: 14,
							userSelect: "none",
						}}
					>
						{cell.executionCount !== null ? `[${cell.executionCount}]` : ""}
					</span>

					<button
						title={runButtonTitle}
						onClick={handleRunClick}
						style={{
							background: "var(--control-bg)",
							border: "1px solid var(--border)",
							borderRadius: 999,
							cursor: "pointer",
							color: cell.state === "running" ? "var(--warning)" : "var(--accent)",
							fontSize: 12,
							width: 24,
							height: 24,
							lineHeight: 1,
							boxShadow: "var(--control-shadow)",
							userSelect: "none",
						}}
					>
						{runButtonContent}
					</button>
				</div>

				<div
					ref={editorContainerRef}
					style={{
						flex: 1,
						minWidth: 0,
						backgroundColor: "var(--editor-bg)",
					}}
				/>
			</div>

			<CellOutputView outputs={cell.outputs} />
		</div>
	);
}

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
				background: "var(--control-bg)",
				border: "1px solid var(--border)",
				borderRadius: 7,
				color: "var(--text-secondary)",
				cursor: "pointer",
				fontSize: 12,
				lineHeight: 1,
				padding: "3px 6px",
				boxShadow: "var(--control-shadow)",
				userSelect: "none",
			}}
		>
			{children}
		</button>
	);
}
