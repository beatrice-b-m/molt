import { create } from "zustand";
import type { PersistedTab } from "../services/persistence";
import type { Cell, CellOutput, KernelState, Notebook } from "../types/notebook";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeCell(): Cell {
	return {
		id: crypto.randomUUID(),
		type: "code",
		source: "",
		executionCount: null,
		outputs: [],
		state: "idle",
	};
}

function makeNotebook(tabIndex: number): Notebook {
	return {
		tabIndex,
		cells: [makeCell()],
		kernelState: "stopped",
		executionCounter: 0,
	};
}

// Index of a cell within a notebook's cells array; returns -1 if not found.
function cellIndex(cells: Cell[], cellId: string): number {
	return cells.findIndex((c) => c.id === cellId);
}

// Immutably replace one cell in the array.
function patchCell(
	cells: Cell[],
	cellId: string,
	patch: Partial<Cell>,
): Cell[] {
	return cells.map((c) => (c.id === cellId ? { ...c, ...patch } : c));
}

// ─── store interface ──────────────────────────────────────────────────────────

export interface NotebookStore {
	notebooks: Notebook[];
	activeTab: number;
	/** Cell that has editor focus (null = nothing focused). */
	focusedCellId: string | null;
	/** True when the user is in Vim-like command mode (after Esc). */
	isCommandMode: boolean;

	// ── navigation ──────────────────────────────────────────────────────────
	setActiveTab: (tab: number) => void;
	setFocusedCellId: (id: string | null) => void;
	setCommandMode: (mode: boolean) => void;

	// ── kernel ──────────────────────────────────────────────────────────────
	updateKernelState: (tabIndex: number, state: KernelState) => void;

	// ── cell mutations ───────────────────────────────────────────────────────
	/**
	 * Append a new cell after `afterCellId`, or at the end if null/undefined.
	 * Returns the new cell's id.
	 */
	addCell: (tabIndex: number, afterCellId?: string | null) => string;
	/** Insert a new cell immediately above `cellId`. Returns the new cell's id. */
	insertCellAbove: (tabIndex: number, cellId: string) => string;
	/** Insert a new cell immediately below `cellId`. Returns the new cell's id. */
	insertCellBelow: (tabIndex: number, cellId: string) => string;
	deleteCell: (tabIndex: number, cellId: string) => void;
	moveCellUp: (tabIndex: number, cellId: string) => void;
	moveCellDown: (tabIndex: number, cellId: string) => void;
	updateCellSource: (
		tabIndex: number,
		cellId: string,
		source: string,
	) => void;

	// ── execution state ──────────────────────────────────────────────────────
	setCellState: (
		tabIndex: number,
		cellId: string,
		state: Cell["state"],
	) => void;
	setCellOutputs: (
		tabIndex: number,
		cellId: string,
		outputs: CellOutput[],
	) => void;
	setCellExecutionCount: (
		tabIndex: number,
		cellId: string,
		count: number,
	) => void;
	/**
	 * Increment and return the notebook's execution counter (the [N] gutter label).
	 * Called once per cell run so counts are monotonically increasing per tab.
	 */
	incrementExecutionCounter: (tabIndex: number) => number;
	/** Replace cell contents from persisted data (source only, no outputs). */
	initializeFromPersisted: (tabs: PersistedTab[]) => void;
	/** Reset a tab to its initial base state. */
	clearTab: (tabIndex: number) => void;
	resetExecution: (tabIndex: number) => void;
}

// ─── store implementation ─────────────────────────────────────────────────────

export const useNotebookStore = create<NotebookStore>((set, get) => ({
	notebooks: [0, 1, 2, 3].map(makeNotebook),
	activeTab: 0,
	focusedCellId: null,
	isCommandMode: false,

	setActiveTab: (tab) => {
		if (!Number.isInteger(tab) || tab < 0 || tab >= get().notebooks.length) return;
		set({ activeTab: tab, isCommandMode: false, focusedCellId: null });
	},

	setFocusedCellId: (id) => {
		set({ focusedCellId: id });
	},

	setCommandMode: (mode) => {
		set({ isCommandMode: mode });
	},

	updateKernelState: (tabIndex, state) => {
		const nb = get().notebooks.find((n) => n.tabIndex === tabIndex);
		if (!nb || nb.kernelState === state) return;
		set((s) => ({
			notebooks: s.notebooks.map((nb) =>
				nb.tabIndex === tabIndex ? { ...nb, kernelState: state } : nb,
			),
		}));
	},

	addCell: (tabIndex, afterCellId) => {
		const cell = makeCell();
		set((s) => ({
			notebooks: s.notebooks.map((nb) => {
				if (nb.tabIndex !== tabIndex) return nb;
				const cells = [...nb.cells];
				if (!afterCellId) {
					cells.push(cell);
				} else {
					const idx = cellIndex(cells, afterCellId);
					cells.splice(idx === -1 ? cells.length : idx + 1, 0, cell);
				}
				return { ...nb, cells };
			}),
		}));
		return cell.id;
	},

	insertCellAbove: (tabIndex, cellId) => {
		const cell = makeCell();
		set((s) => ({
			notebooks: s.notebooks.map((nb) => {
				if (nb.tabIndex !== tabIndex) return nb;
				const cells = [...nb.cells];
				const idx = cellIndex(cells, cellId);
				cells.splice(idx === -1 ? 0 : idx, 0, cell);
				return { ...nb, cells };
			}),
		}));
		return cell.id;
	},

	insertCellBelow: (tabIndex, cellId) => {
		// Delegates to addCell — identical "insert after" semantics.
		return get().addCell(tabIndex, cellId);
	},

	deleteCell: (tabIndex, cellId) => {
		set((s) => ({
			notebooks: s.notebooks.map((nb) => {
				if (nb.tabIndex !== tabIndex) return nb;
				const cells = nb.cells.filter((c) => c.id !== cellId);
				// Always keep at least one cell so the notebook is never empty.
				return { ...nb, cells: cells.length > 0 ? cells : [makeCell()] };
			}),
		}));
	},

	moveCellUp: (tabIndex, cellId) => {
		set((s) => ({
			notebooks: s.notebooks.map((nb) => {
				if (nb.tabIndex !== tabIndex) return nb;
				const cells = [...nb.cells];
				const idx = cellIndex(cells, cellId);
				if (idx <= 0) return nb; // already at top
				[cells[idx - 1], cells[idx]] = [cells[idx], cells[idx - 1]];
				return { ...nb, cells };
			}),
		}));
	},

	moveCellDown: (tabIndex, cellId) => {
		set((s) => ({
			notebooks: s.notebooks.map((nb) => {
				if (nb.tabIndex !== tabIndex) return nb;
				const cells = [...nb.cells];
				const idx = cellIndex(cells, cellId);
				if (idx === -1 || idx >= cells.length - 1) return nb; // already at bottom
				[cells[idx], cells[idx + 1]] = [cells[idx + 1], cells[idx]];
				return { ...nb, cells };
			}),
		}));
	},

	updateCellSource: (tabIndex, cellId, source) => {
		const nb = get().notebooks.find((n) => n.tabIndex === tabIndex);
		if (!nb) return;
		const cell = nb.cells.find((c) => c.id === cellId);
		if (!cell || cell.source === source) return;
		set((s) => ({
			notebooks: s.notebooks.map((nb) =>
				nb.tabIndex !== tabIndex
					? nb
					: { ...nb, cells: patchCell(nb.cells, cellId, { source }) },
			),
		}));
	},

	setCellState: (tabIndex, cellId, state) => {
		const nb = get().notebooks.find((n) => n.tabIndex === tabIndex);
		if (!nb) return;
		const cell = nb.cells.find((c) => c.id === cellId);
		if (!cell || cell.state === state) return;
		set((s) => ({
			notebooks: s.notebooks.map((nb) =>
				nb.tabIndex !== tabIndex
					? nb
					: { ...nb, cells: patchCell(nb.cells, cellId, { state }) },
			),
		}));
	},

	setCellOutputs: (tabIndex, cellId, outputs) => {
		const nb = get().notebooks.find((n) => n.tabIndex === tabIndex);
		if (!nb) return;
		const cell = nb.cells.find((c) => c.id === cellId);
		if (!cell || cell.outputs === outputs) return;
		set((s) => ({
			notebooks: s.notebooks.map((nb) =>
				nb.tabIndex !== tabIndex
					? nb
					: { ...nb, cells: patchCell(nb.cells, cellId, { outputs }) },
			),
		}));
	},

	setCellExecutionCount: (tabIndex, cellId, count) => {
		const nb = get().notebooks.find((n) => n.tabIndex === tabIndex);
		if (!nb) return;
		const cell = nb.cells.find((c) => c.id === cellId);
		if (!cell || cell.executionCount === count) return;
		set((s) => ({
			notebooks: s.notebooks.map((nb) =>
				nb.tabIndex !== tabIndex
					? nb
					: {
						...nb,
						cells: patchCell(nb.cells, cellId, {
							executionCount: count,
						}),
					},
			),
		}));
	},

	incrementExecutionCounter: (tabIndex) => {
		let next = 0;
		set((s) => ({
			notebooks: s.notebooks.map((nb) => {
				if (nb.tabIndex !== tabIndex) return nb;
				next = nb.executionCounter + 1;
				return { ...nb, executionCounter: next };
			}),
		}));
		return next;
	},

	initializeFromPersisted: (tabs) => {
		set((s) => ({
			notebooks: s.notebooks.map((nb) => {
				const entry = tabs.find((t) => t.tabIndex === nb.tabIndex);
				if (!entry) return nb;
				const cells: Cell[] =
					entry.cells.length > 0
						? entry.cells.map((pc) => ({
								id: pc.id,
								type: pc.type,
								source: pc.source,
								executionCount: null,
								outputs: [],
								state: "idle" as const,
							}))
						: [makeCell()];
				return { ...nb, cells };
			}),
		}));
	},

	resetExecution: (tabIndex) => {
		set((s) => ({
			notebooks: s.notebooks.map((nb) => nb.tabIndex !== tabIndex ? nb : {
				...nb, executionCounter: 0,
				cells: nb.cells.map((cell) => ({ ...cell, state: "idle", executionCount: null, outputs: [] })),
			}),
		}));
	},

	clearTab: (tabIndex) => {
		set((s) => ({
			notebooks: s.notebooks.map((nb) =>
				nb.tabIndex !== tabIndex ? nb : makeNotebook(tabIndex),
			),
			focusedCellId: null,
			isCommandMode: false,
		}));
	},
}));
