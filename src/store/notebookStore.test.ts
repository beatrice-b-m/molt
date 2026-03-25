import { describe, it, expect, beforeEach } from "vitest";
import { useNotebookStore } from "./notebookStore";

// Capture the initial state once — all action functions are stable references,
// so a shallow spread plus replace=true is sufficient for reset.
const initialState = useNotebookStore.getState();

beforeEach(() => {
	// Replace the entire store state with the initial snapshot.
	// Second argument `true` = replace (not merge) so no stale cell ids persist.
	useNotebookStore.setState(initialState, true);
});

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Return the notebook for the given tab. */
function nb(tab = 0) {
	return useNotebookStore.getState().notebooks.find((n) => n.tabIndex === tab)!;
}

/** Return the cells array for the given tab. */
function cells(tab = 0) {
	return nb(tab).cells;
}

/** Return the first cell id on a tab. */
function firstCellId(tab = 0) {
	return cells(tab)[0].id;
}

// ─── initialization ───────────────────────────────────────────────────────────

describe("initialization", () => {
	it("creates 4 notebooks", () => {
		expect(useNotebookStore.getState().notebooks).toHaveLength(4);
	});

	it("assigns tabIndex 0–3 to each notebook", () => {
		const indices = useNotebookStore
			.getState()
			.notebooks.map((n) => n.tabIndex);
		expect(indices).toEqual([0, 1, 2, 3]);
	});

	it("each notebook starts with exactly 1 cell", () => {
		for (const notebook of useNotebookStore.getState().notebooks) {
			expect(notebook.cells).toHaveLength(1);
		}
	});

	it("activeTab starts at 0", () => {
		expect(useNotebookStore.getState().activeTab).toBe(0);
	});

	it("isCommandMode starts false", () => {
		expect(useNotebookStore.getState().isCommandMode).toBe(false);
	});

	it("each initial cell has correct defaults", () => {
		const cell = cells(0)[0];
		expect(cell.type).toBe("code");
		expect(cell.source).toBe("");
		expect(cell.executionCount).toBeNull();
		expect(cell.outputs).toEqual([]);
		expect(cell.state).toBe("idle");
		expect(typeof cell.id).toBe("string");
		expect(cell.id.length).toBeGreaterThan(0);
	});

	it("each notebook starts with kernelState=stopped and executionCounter=0", () => {
		for (const notebook of useNotebookStore.getState().notebooks) {
			expect(notebook.kernelState).toBe("stopped");
			expect(notebook.executionCounter).toBe(0);
		}
	});
});

// ─── setActiveTab ─────────────────────────────────────────────────────────────

describe("setActiveTab", () => {
	it("changes activeTab", () => {
		useNotebookStore.getState().setActiveTab(2);
		expect(useNotebookStore.getState().activeTab).toBe(2);
	});

	it("resets isCommandMode to false", () => {
		useNotebookStore.getState().setCommandMode(true);
		expect(useNotebookStore.getState().isCommandMode).toBe(true);

		useNotebookStore.getState().setActiveTab(1);
		expect(useNotebookStore.getState().isCommandMode).toBe(false);
	});

	it("does not affect other notebooks", () => {
		const cellsBefore = cells(1);
		useNotebookStore.getState().setActiveTab(3);
		expect(cells(1)).toEqual(cellsBefore);
	});
});

// ─── addCell ──────────────────────────────────────────────────────────────────

describe("addCell", () => {
	it("appends a cell when afterCellId is not provided", () => {
		useNotebookStore.getState().addCell(0);
		expect(cells(0)).toHaveLength(2);
	});

	it("returns the new cell's id", () => {
		const id = useNotebookStore.getState().addCell(0);
		expect(typeof id).toBe("string");
		expect(cells(0).map((c) => c.id)).toContain(id);
	});

	it("inserts after the specified cell id", () => {
		const existingId = firstCellId(0);
		useNotebookStore.getState().addCell(0);
		// Add a third cell after the original first
		const newId = useNotebookStore.getState().addCell(0, existingId);
		const allCells = cells(0);
		// newId should be at index 1, immediately after existingId
		expect(allCells[0].id).toBe(existingId);
		expect(allCells[1].id).toBe(newId);
	});

	it("new cell has correct defaults", () => {
		const id = useNotebookStore.getState().addCell(0);
		const cell = cells(0).find((c) => c.id === id)!;
		expect(cell.type).toBe("code");
		expect(cell.source).toBe("");
		expect(cell.executionCount).toBeNull();
		expect(cell.outputs).toEqual([]);
		expect(cell.state).toBe("idle");
	});

	it("only affects the target tab", () => {
		useNotebookStore.getState().addCell(0);
		expect(cells(1)).toHaveLength(1);
	});
});

// ─── insertCellAbove ──────────────────────────────────────────────────────────

describe("insertCellAbove", () => {
	it("inserts before the target cell", () => {
		const targetId = firstCellId(0);
		const newId = useNotebookStore
			.getState()
			.insertCellAbove(0, targetId);
		const allCells = cells(0);
		expect(allCells).toHaveLength(2);
		expect(allCells[0].id).toBe(newId);
		expect(allCells[1].id).toBe(targetId);
	});

	it("returns the new cell's id", () => {
		const id = useNotebookStore
			.getState()
			.insertCellAbove(0, firstCellId(0));
		expect(typeof id).toBe("string");
		expect(cells(0).map((c) => c.id)).toContain(id);
	});

	it("only affects the target tab", () => {
		useNotebookStore.getState().insertCellAbove(0, firstCellId(0));
		expect(cells(1)).toHaveLength(1);
	});
});

// ─── deleteCell ───────────────────────────────────────────────────────────────

describe("deleteCell", () => {
	it("removes the cell", () => {
		// Add a second cell so we can delete the first without hitting the guard.
		const secondId = useNotebookStore.getState().addCell(0);
		const firstId = firstCellId(0);
		useNotebookStore.getState().deleteCell(0, firstId);
		expect(cells(0).map((c) => c.id)).not.toContain(firstId);
		expect(cells(0).map((c) => c.id)).toContain(secondId);
	});

	it("never leaves a notebook with zero cells", () => {
		const onlyId = firstCellId(0);
		useNotebookStore.getState().deleteCell(0, onlyId);
		expect(cells(0)).toHaveLength(1);
	});

	it("replacement cell after guarded delete has correct defaults", () => {
		const onlyId = firstCellId(0);
		useNotebookStore.getState().deleteCell(0, onlyId);
		const replacement = cells(0)[0];
		expect(replacement.type).toBe("code");
		expect(replacement.source).toBe("");
		expect(replacement.state).toBe("idle");
	});

	it("only affects the target tab", () => {
		const id1 = useNotebookStore.getState().addCell(1);
		useNotebookStore.getState().deleteCell(1, id1);
		expect(cells(0)).toHaveLength(1);
	});
});

// ─── moveCellUp ───────────────────────────────────────────────────────────────

describe("moveCellUp", () => {
	it("swaps a cell with the one above it", () => {
		const firstId = firstCellId(0);
		const secondId = useNotebookStore.getState().addCell(0);
		useNotebookStore.getState().moveCellUp(0, secondId);
		expect(cells(0)[0].id).toBe(secondId);
		expect(cells(0)[1].id).toBe(firstId);
	});

	it("is a no-op when the cell is already first", () => {
		const onlyId = firstCellId(0);
		useNotebookStore.getState().moveCellUp(0, onlyId);
		expect(cells(0)[0].id).toBe(onlyId);
	});

	it("only affects the target tab", () => {
		const firstId = firstCellId(1);
		const secondId = useNotebookStore.getState().addCell(1);
		useNotebookStore.getState().moveCellUp(0, firstCellId(0));
		// Tab 1 unchanged
		expect(cells(1)[0].id).toBe(firstId);
		expect(cells(1)[1].id).toBe(secondId);
	});
});

// ─── moveCellDown ─────────────────────────────────────────────────────────────

describe("moveCellDown", () => {
	it("swaps a cell with the one below it", () => {
		const firstId = firstCellId(0);
		const secondId = useNotebookStore.getState().addCell(0);
		useNotebookStore.getState().moveCellDown(0, firstId);
		expect(cells(0)[0].id).toBe(secondId);
		expect(cells(0)[1].id).toBe(firstId);
	});

	it("is a no-op when the cell is already last", () => {
		const firstId = firstCellId(0);
		const secondId = useNotebookStore.getState().addCell(0);
		useNotebookStore.getState().moveCellDown(0, secondId);
		expect(cells(0)[1].id).toBe(secondId);
		expect(cells(0)[0].id).toBe(firstId);
	});

	it("is a no-op when notebook has only one cell", () => {
		const onlyId = firstCellId(0);
		useNotebookStore.getState().moveCellDown(0, onlyId);
		expect(cells(0)[0].id).toBe(onlyId);
		expect(cells(0)).toHaveLength(1);
	});
});

// ─── updateCellSource ─────────────────────────────────────────────────────────

describe("updateCellSource", () => {
	it("updates the source of the target cell", () => {
		const id = firstCellId(0);
		useNotebookStore.getState().updateCellSource(0, id, "print('hello')");
		const cell = cells(0).find((c) => c.id === id)!;
		expect(cell.source).toBe("print('hello')");
	});

	it("does not affect other cells on the same tab", () => {
		const firstId = firstCellId(0);
		const secondId = useNotebookStore.getState().addCell(0);
		useNotebookStore
			.getState()
			.updateCellSource(0, firstId, "x = 1");
		const second = cells(0).find((c) => c.id === secondId)!;
		expect(second.source).toBe("");
	});

	it("does not affect other tabs", () => {
		useNotebookStore
			.getState()
			.updateCellSource(0, firstCellId(0), "x = 1");
		expect(cells(1)[0].source).toBe("");
	});
});

// ─── setCellState ─────────────────────────────────────────────────────────────

describe("setCellState", () => {
	it("sets the cell state to running", () => {
		const id = firstCellId(0);
		useNotebookStore.getState().setCellState(0, id, "running");
		expect(cells(0).find((c) => c.id === id)!.state).toBe("running");
	});

	it("sets the cell state to error", () => {
		const id = firstCellId(0);
		useNotebookStore.getState().setCellState(0, id, "error");
		expect(cells(0).find((c) => c.id === id)!.state).toBe("error");
	});

	it("sets the cell state to success", () => {
		const id = firstCellId(0);
		useNotebookStore.getState().setCellState(0, id, "success");
		expect(cells(0).find((c) => c.id === id)!.state).toBe("success");
	});

	it("does not affect other tabs", () => {
		useNotebookStore
			.getState()
			.setCellState(0, firstCellId(0), "running");
		expect(cells(1)[0].state).toBe("idle");
	});
});

// ─── setCellOutputs ───────────────────────────────────────────────────────────

describe("setCellOutputs", () => {
	it("replaces the outputs array", () => {
		const id = firstCellId(0);
		const outputs = [
			{ outputType: "stream" as const, streamName: "stdout" as const, text: "hi" },
		];
		useNotebookStore.getState().setCellOutputs(0, id, outputs);
		expect(cells(0).find((c) => c.id === id)!.outputs).toEqual(outputs);
	});

	it("can clear outputs by setting an empty array", () => {
		const id = firstCellId(0);
		useNotebookStore.getState().setCellOutputs(0, id, [
			{ outputType: "stream" as const, text: "x" },
		]);
		useNotebookStore.getState().setCellOutputs(0, id, []);
		expect(cells(0).find((c) => c.id === id)!.outputs).toEqual([]);
	});

	it("does not affect other tabs", () => {
		useNotebookStore.getState().setCellOutputs(0, firstCellId(0), [
			{ outputType: "stream" as const, text: "x" },
		]);
		expect(cells(1)[0].outputs).toEqual([]);
	});
});

// ─── incrementExecutionCounter ────────────────────────────────────────────────

describe("incrementExecutionCounter", () => {
	it("returns 1 on first call", () => {
		const n = useNotebookStore.getState().incrementExecutionCounter(0);
		expect(n).toBe(1);
	});

	it("increments monotonically across calls", () => {
		const s = useNotebookStore.getState();
		expect(s.incrementExecutionCounter(0)).toBe(1);
		expect(s.incrementExecutionCounter(0)).toBe(2);
		expect(s.incrementExecutionCounter(0)).toBe(3);
	});

	it("persists in notebook state", () => {
		useNotebookStore.getState().incrementExecutionCounter(0);
		useNotebookStore.getState().incrementExecutionCounter(0);
		expect(nb(0).executionCounter).toBe(2);
	});

	it("is independent per tab", () => {
		useNotebookStore.getState().incrementExecutionCounter(0);
		useNotebookStore.getState().incrementExecutionCounter(0);
		useNotebookStore.getState().incrementExecutionCounter(1);
		expect(nb(0).executionCounter).toBe(2);
		expect(nb(1).executionCounter).toBe(1);
	});
});

// ─── updateKernelState ────────────────────────────────────────────────────────

describe("updateKernelState", () => {
	it("updates kernelState for the target tab", () => {
		useNotebookStore.getState().updateKernelState(0, "idle");
		expect(nb(0).kernelState).toBe("idle");
	});

	it("does not affect other tabs", () => {
		useNotebookStore.getState().updateKernelState(0, "busy");
		expect(nb(1).kernelState).toBe("stopped");
	});

	it("can transition through all valid states", () => {
		const states = ["starting", "idle", "busy", "stopped", "error"] as const;
		for (const state of states) {
			useNotebookStore.getState().updateKernelState(2, state);
			expect(nb(2).kernelState).toBe(state);
		}
	});
});

// ─── setCommandMode ───────────────────────────────────────────────────────────

describe("setCommandMode", () => {
	it("sets command mode to true", () => {
		useNotebookStore.getState().setCommandMode(true);
		expect(useNotebookStore.getState().isCommandMode).toBe(true);
	});

	it("sets command mode to false", () => {
		useNotebookStore.getState().setCommandMode(true);
		useNotebookStore.getState().setCommandMode(false);
		expect(useNotebookStore.getState().isCommandMode).toBe(false);
	});

	it("does not touch activeTab or notebooks", () => {
		const tabBefore = useNotebookStore.getState().activeTab;
		const nbsBefore = useNotebookStore.getState().notebooks;
		useNotebookStore.getState().setCommandMode(true);
		expect(useNotebookStore.getState().activeTab).toBe(tabBefore);
		expect(useNotebookStore.getState().notebooks).toEqual(nbsBefore);
	});
});
