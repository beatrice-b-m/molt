import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Toolbar } from "./Toolbar";
import { useNotebookStore } from "../store/notebookStore";

const initialState = useNotebookStore.getState();

function nb(tab = 0) {
	return useNotebookStore.getState().notebooks.find((n) => n.tabIndex === tab)!;
}

function firstCellId(tab = 0) {
	return nb(tab).cells[0].id;
}

beforeEach(() => {
	useNotebookStore.setState(initialState, true);
});

describe("Toolbar clear button", () => {
	it("resets only the active tab to a fresh empty notebook", () => {
		const store = useNotebookStore.getState();
		store.setActiveTab(2);

		const activeCellId = firstCellId(2);
		store.updateCellSource(2, activeCellId, "print('x')");
		store.setCellOutputs(2, activeCellId, [{ outputType: "stream", text: "x" }]);
		store.setCellExecutionCount(2, activeCellId, 9);
		store.setCellState(2, activeCellId, "success");
		store.incrementExecutionCounter(2);
		store.updateKernelState(2, "busy");
		store.addCell(2, activeCellId);

		const tab1CellId = firstCellId(1);
		store.updateCellSource(1, tab1CellId, "keep=True");
		store.updateKernelState(1, "idle");

		render(<Toolbar />);
		fireEvent.click(screen.getByRole("button", { name: "Clear" }));

		const cleared = nb(2);
		expect(cleared.cells).toHaveLength(1);
		expect(cleared.cells[0].source).toBe("");
		expect(cleared.cells[0].outputs).toEqual([]);
		expect(cleared.cells[0].executionCount).toBeNull();
		expect(cleared.cells[0].state).toBe("idle");
		expect(cleared.executionCounter).toBe(0);
		expect(cleared.kernelState).toBe("stopped");

		expect(nb(1).cells[0].source).toBe("keep=True");
		expect(nb(1).kernelState).toBe("idle");
	});
});
