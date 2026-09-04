import { useNotebookStore } from "../store/notebookStore";
import type { CellOutput } from "../types/notebook";
import { ensureKernel, executeCell, getKernelStatus, restartKernel, stopKernel } from "./backend";

// Reserve a tab synchronously, before any IPC await. A newer lifecycle operation
// invalidates previous completions, including the remaining cells in Run All.
const operations = new Map<number, symbol>();
const store = () => useNotebookStore.getState();
const notebook = (tab: number) => store().notebooks[tab];
const current = (tab: number, token: symbol) => operations.get(tab) === token;

export async function initializeTab(tab: number): Promise<void> {
	if (operations.has(tab) || notebook(tab)?.kernelState !== "stopped") return;
	const token = Symbol();
	operations.set(tab, token);
	store().updateKernelState(tab, "starting");
	try {
		const state = await ensureKernel(tab);
		if (current(tab, token)) store().updateKernelState(tab, state);
	} catch (error) {
		console.error("Kernel startup failed", error);
		if (current(tab, token)) store().updateKernelState(tab, "error");
	} finally {
		if (current(tab, token)) operations.delete(tab);
	}
}

async function runCell(tab: number, id: string, token: symbol): Promise<boolean> {
	const cell = notebook(tab)?.cells.find((cell) => cell.id === id);
	if (!cell || !cell.source.trim()) return true;
	store().setCellState(tab, id, "running");
	store().setCellOutputs(tab, id, []);
	try {
		const state = await ensureKernel(tab);
		if (!current(tab, token)) return false;
		if (state === "stopped" || state === "error") throw new Error("Kernel is not running. Restart to continue.");
		// A cell deleted during startup must not still execute its side effects.
		const source = notebook(tab)?.cells.find((cell) => cell.id === id)?.source;
		if (source === undefined) return false;
		store().setCellExecutionCount(tab, id, store().incrementExecutionCounter(tab));
		const response = await executeCell(tab, id, source);
		if (!current(tab, token)) return false;
		const outputs: CellOutput[] = [];
		if (response.stdout) outputs.push({ outputType: "stream", streamName: "stdout", text: response.stdout });
		if (response.stderr) outputs.push({ outputType: "stream", streamName: "stderr", text: response.stderr });
		if (response.error) outputs.push({ outputType: "error", text: response.error });
		store().setCellOutputs(tab, id, outputs);
		store().setCellState(tab, id, response.error ? "error" : "success");
		return !response.error;
	} catch (error) {
		if (current(tab, token)) {
			store().setCellOutputs(tab, id, [{ outputType: "error", text: String(error) }]);
			store().setCellState(tab, id, "error");
		}
		return false;
	}
}

async function runCells(tab: number, ids: string[], advance: boolean): Promise<void> {
	if (operations.has(tab) || !notebook(tab)) return;
	const token = Symbol();
	operations.set(tab, token);
	store().updateKernelState(tab, "busy");
	try {
		for (const id of ids) {
			if (!current(tab, token)) break;
			const succeeded = await runCell(tab, id, token);
			if (advance && current(tab, token)) {
				const cells = notebook(tab).cells;
				const index = cells.findIndex((cell) => cell.id === id);
				if (index >= 0) {
					const next = cells[index + 1]?.id ?? store().addCell(tab, id);
					if (store().activeTab === tab && store().focusedCellId === id) store().setFocusedCellId(next);
				}
			}
			if (!succeeded) break;
		}
	} finally {
		if (current(tab, token)) {
			const state = await getKernelStatus(tab).catch(() => "error" as const);
			if (current(tab, token)) {
				store().updateKernelState(tab, state);
				operations.delete(tab);
			}
		}
	}
}

export function executeSingleCell(tab: number, id: string, advance = false): Promise<void> {
	return runCells(tab, [id], advance);
}

export function executeAllCells(tab: number): Promise<void> {
	return runCells(tab, notebook(tab)?.cells.map((cell) => cell.id) ?? [], false);
}

async function changeKernel(tab: number, action: "restart" | "stop" | "clear"): Promise<void> {
	const token = Symbol();
	operations.set(tab, token);
	store().updateKernelState(tab, "starting");
	try {
		const state = action === "restart" ? await restartKernel(tab) : (await stopKernel(tab), "stopped" as const);
		if (!current(tab, token)) return;
		if (action === "clear") store().clearTab(tab);
		else if (action === "restart") store().resetExecution(tab);
		else {
			for (const cell of notebook(tab).cells) {
				if (cell.state === "running") {
					store().setCellOutputs(tab, cell.id, [{ outputType: "error", text: "Execution stopped" }]);
					store().setCellState(tab, cell.id, "error");
				}
			}
		}
		store().updateKernelState(tab, state);
	} catch (error) {
		if (current(tab, token)) store().updateKernelState(tab, "error");
		throw error;
	} finally {
		if (current(tab, token)) operations.delete(tab);
	}
}

export const restartTab = (tab: number) => changeKernel(tab, "restart");
export const stopTab = (tab: number) => changeKernel(tab, "stop");
export const clearNotebook = (tab: number) => changeKernel(tab, "clear");
