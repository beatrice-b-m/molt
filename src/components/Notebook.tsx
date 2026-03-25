import { useState } from "react";
import { useNotebookStore } from "../store/notebookStore";
import { Cell } from "./Cell";

// ─── AddCellButton ────────────────────────────────────────────────────────────

interface AddCellButtonProps {
	tabIndex: number;
	/** Cell after which the new cell is inserted; null = append to end. */
	afterCellId: string | null;
	visible: boolean;
}

function AddCellButton({ tabIndex, afterCellId, visible }: AddCellButtonProps) {
	const addCell = useNotebookStore((s) => s.addCell);
	const setFocusedCellId = useNotebookStore((s) => s.setFocusedCellId);

	const handleClick = () => {
		const newId = addCell(tabIndex, afterCellId);
		setFocusedCellId(newId);
	};

	return (
		<div
			style={{
				padding: "2px 8px",
				opacity: visible ? 1 : 0,
				transition: "opacity 0.1s",
				pointerEvents: visible ? "auto" : "none",
			}}
		>
			<button
				onClick={handleClick}
				data-no-drag
				style={{
					fontSize: 11,
					color: "var(--text-secondary)",
					background: "transparent",
					border: "1px dashed var(--border)",
					borderRadius: 4,
					padding: "1px 10px",
					cursor: "pointer",
					width: "100%",
				}}
			>
				+ Add cell
			</button>
		</div>
	);
}

// ─── BetweenCells ─────────────────────────────────────────────────────────────
// Thin hover-zone between two adjacent cells that reveals the add-cell button.

interface BetweenCellsProps {
	tabIndex: number;
	afterCellId: string;
}

function BetweenCells({ tabIndex, afterCellId }: BetweenCellsProps) {
	const [hovered, setHovered] = useState(false);

	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			// Min height ensures the zone is always hit-testable even when collapsed.
			style={{ minHeight: 4 }}
		>
			<AddCellButton
				tabIndex={tabIndex}
				afterCellId={afterCellId}
				visible={hovered}
			/>
		</div>
	);
}

// ─── Notebook ─────────────────────────────────────────────────────────────────

export function Notebook() {
	const activeTab = useNotebookStore((s) => s.activeTab);
	const notebook = useNotebookStore((s) => s.notebooks[s.activeTab]);

	const lastCellId =
		notebook.cells.length > 0
			? notebook.cells[notebook.cells.length - 1].id
			: null;

	return (
		<div
			style={{
				flexGrow: 1,
				overflowY: "auto",
				padding: "8px 0",
			}}
		>
			{notebook.cells.map((cell, i) => (
				<div key={cell.id}>
					{/* Between-cell insert zone: shown on hover, skipped before first cell */}
					{i > 0 && (
						<BetweenCells
							tabIndex={activeTab}
							afterCellId={notebook.cells[i - 1].id}
						/>
					)}
					<Cell tabIndex={activeTab} cell={cell} isLast={i === notebook.cells.length - 1} />
				</div>
			))}

			{/* After the last cell: always visible add button */}
			<div style={{ padding: "4px 8px" }}>
				<AddCellButton
					tabIndex={activeTab}
					afterCellId={lastCellId}
					visible={true}
				/>
			</div>
		</div>
	);
}
