import type { CellOutput } from "../types/notebook";
import { useNotebookStore } from "../store/notebookStore";
import { ensureKernel, executeCell } from "../hooks/useKernel";

/**
 * Execute a single cell in the given tab's kernel.
 * Updates store with running state, outputs, execution count, and final state.
 * Used by Cell's run button, Shift+Enter, and Toolbar's "Run All".
 */
export async function executeSingleCell(tabIndex: number, cellId: string): Promise<void> {
	const store = useNotebookStore.getState();
	const notebook = store.notebooks.find((nb) => nb.tabIndex === tabIndex);
	if (!notebook) return;

	const cell = notebook.cells.find((c) => c.id === cellId);
	if (!cell) return;

	// Empty source: no-op — caller decides whether to advance focus.
	if (!cell.source.trim()) return;


	// Ensure the kernel is fully started before sending work.
	try {
		const ks = await ensureKernel(tabIndex);
		store.updateKernelState(tabIndex, ks);
	} catch (e) {
		store.setCellOutputs(tabIndex, cellId, [
			{ outputType: "error", text: `Failed to start kernel: ${String(e)}` },
		]);
		store.setCellState(tabIndex, cellId, "error");
		return;
	}

	// Mark cell running and wipe prior outputs before the call.
	store.setCellState(tabIndex, cellId, "running");
	store.setCellOutputs(tabIndex, cellId, []);

	// Execution counter increments before the invoke so the gutter label
	// updates immediately (Jupyter-style optimistic numbering).
	const execCount = store.incrementExecutionCounter(tabIndex);
	store.setCellExecutionCount(tabIndex, cellId, execCount);

	try {
		// Re-read source in case the user edited while we were awaiting ensureKernel.
		const liveSource =
			useNotebookStore
				.getState()
				.notebooks.find((nb) => nb.tabIndex === tabIndex)
				?.cells.find((c) => c.id === cellId)?.source ?? cell.source;

		const response = await executeCell(tabIndex, cellId, liveSource);

		const outputs: CellOutput[] = [];
		if (response.stdout) {
			outputs.push({ outputType: "stream", streamName: "stdout", text: response.stdout });
		}
		if (response.stderr) {
			outputs.push({ outputType: "stream", streamName: "stderr", text: response.stderr });
		}
		if (response.error) {
			outputs.push({ outputType: "error", text: response.error });
		}

		store.setCellOutputs(tabIndex, cellId, outputs);
		store.setCellState(tabIndex, cellId, response.error ? "error" : "success");
	} catch (e) {
		store.setCellOutputs(tabIndex, cellId, [{ outputType: "error", text: String(e) }]);
		store.setCellState(tabIndex, cellId, "error");
	}

	// Jupyter convention: running the final cell in a tab auto-creates a
	// new empty cell beneath it so the user always has somewhere to type.
	const updated = useNotebookStore.getState();
	const nb = updated.notebooks.find((n) => n.tabIndex === tabIndex);
	if (nb && nb.cells.length > 0 && nb.cells[nb.cells.length - 1].id === cellId) {
		updated.addCell(tabIndex, cellId);
	}
}