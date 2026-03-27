import { useState } from "react";
import { useNotebookStore } from "../store/notebookStore";
import { Cell } from "./Cell";

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
				padding: "2px 10px",
				opacity: visible ? 1 : 0,
				transition: "opacity 0.12s ease",
				pointerEvents: visible ? "auto" : "none",
			}}
		>
			<button
				onClick={handleClick}
				data-no-drag
				style={{
					fontSize: 11,
					fontWeight: 500,
					color: "var(--text-secondary)",
					background: "var(--bg-tertiary)",
					border: "1px dashed var(--border)",
					borderRadius: 8,
					padding: "3px 10px",
					cursor: "pointer",
					width: "100%",
				}}
			>
				+ Add cell
			</button>
		</div>
	);
}

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
			style={{ minHeight: 5 }}
		>
			<AddCellButton
				tabIndex={tabIndex}
				afterCellId={afterCellId}
				visible={hovered}
			/>
		</div>
	);
}

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
				padding: "10px 0 12px",
				background: "var(--bg-primary)",
			}}
		>
			{notebook.cells.map((cell, i) => (
				<div key={cell.id}>
					{i > 0 && (
						<BetweenCells
							tabIndex={activeTab}
							afterCellId={notebook.cells[i - 1].id}
						/>
					)}
					<Cell tabIndex={activeTab} cell={cell} isLast={i === notebook.cells.length - 1} />
				</div>
			))}

			<div style={{ padding: "6px 10px" }}>
				<AddCellButton
					tabIndex={activeTab}
					afterCellId={lastCellId}
					visible={true}
				/>
			</div>
		</div>
	);
}