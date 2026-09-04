import { beforeEach, describe, expect, it, vi } from "vitest";
import * as backend from "./backend";
import { executeAllCells, executeSingleCell, initializeTab, restartTab, stopTab, clearNotebook } from "./execution";
import { useNotebookStore } from "../store/notebookStore";
import type { KernelResponse } from "../types/notebook";

vi.mock("./backend", () => ({
	ensureKernel: vi.fn(), executeCell: vi.fn(), getKernelStatus: vi.fn(), restartKernel: vi.fn(), stopKernel: vi.fn(),
}));
const initial = useNotebookStore.getState();
const result: KernelResponse = { id: "cell", type: "result", stdout: "42\n", stderr: "", error: null, output_type: "text" };
const store = () => useNotebookStore.getState();
const nb = (tab = 0) => store().notebooks[tab];
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

beforeEach(() => {
	useNotebookStore.setState(initial, true);
	vi.resetAllMocks();
	vi.mocked(backend.ensureKernel).mockResolvedValue("idle");
	vi.mocked(backend.getKernelStatus).mockResolvedValue("idle");
	vi.mocked(backend.restartKernel).mockResolvedValue("idle");
	vi.mocked(backend.stopKernel).mockResolvedValue(undefined);
	vi.mocked(backend.executeCell).mockResolvedValue(result);
	store().updateCellSource(0, nb().cells[0].id, "42");
});

describe("execution orchestration", () => {
	it("reserves before startup, rejects duplicate runs, and reports busy until complete", async () => {
		const start = deferred<"idle">();
		vi.mocked(backend.ensureKernel).mockReturnValue(start.promise);
		const id = nb().cells[0].id;
		const run = executeSingleCell(0, id);
		await executeSingleCell(0, id);
		expect(nb().kernelState).toBe("busy");
		expect(backend.ensureKernel).toHaveBeenCalledTimes(1);
		start.resolve("idle");
		await run;
		expect(backend.executeCell).toHaveBeenCalledTimes(1);
		expect(nb().cells[0].state).toBe("success");
		expect(nb().kernelState).toBe("idle");
	});

	it("restart invalidates old results and resets numbering and outputs", async () => {
		const response = deferred<KernelResponse>();
		vi.mocked(backend.executeCell).mockReturnValueOnce(response.promise);
		const id = nb().cells[0].id;
		const run = executeSingleCell(0, id);
		await vi.waitFor(() => expect(backend.executeCell).toHaveBeenCalledOnce());
		await restartTab(0);
		response.resolve(result);
		await run;
		expect(nb().cells[0].outputs).toEqual([]);
		expect(nb().cells[0].executionCount).toBeNull();
		expect(nb().executionCounter).toBe(0);
		await executeSingleCell(0, id);
		expect(nb().cells[0].executionCount).toBe(1);
	});

	it("stop cancels the remaining Run All cells", async () => {
		store().updateCellSource(0, store().addCell(0), "43");
		const response = deferred<KernelResponse>();
		vi.mocked(backend.executeCell).mockReturnValueOnce(response.promise);
		const run = executeAllCells(0);
		await vi.waitFor(() => expect(backend.executeCell).toHaveBeenCalledOnce());
		await stopTab(0);
		response.resolve(result);
		await run;
		expect(backend.executeCell).toHaveBeenCalledTimes(1);
		expect(nb().kernelState).toBe("stopped");
		expect(nb().cells[0].state).toBe("error");
	});

	it("clear stops the actual kernel before replacing cells", async () => {
		await clearNotebook(0);
		expect(backend.stopKernel).toHaveBeenCalledWith(0);
		expect(nb().cells[0].source).toBe("");
		expect(nb().kernelState).toBe("stopped");
	});

	it("advances only when requested and does not steal focus from another tab", async () => {
		const id = nb().cells[0].id;
		store().setFocusedCellId(id);
		await executeSingleCell(0, id);
		expect(nb().cells).toHaveLength(1);
		expect(store().focusedCellId).toBe(id);
		await executeSingleCell(0, id, true);
		expect(nb().cells).toHaveLength(2);
		expect(store().focusedCellId).toBe(nb().cells[1].id);
		store().setActiveTab(1);
		await executeSingleCell(0, id, true);
		expect(store().focusedCellId).toBeNull();
	});

	it("does not execute a deleted cell after awaiting startup", async () => {
		const start = deferred<"idle">();
		vi.mocked(backend.ensureKernel).mockReturnValue(start.promise);
		const id = nb().cells[0].id;
		const run = executeSingleCell(0, id);
		store().deleteCell(0, id);
		start.resolve("idle");
		await run;
		expect(backend.executeCell).not.toHaveBeenCalled();
	});

	it("coalesces initialization and cannot overwrite a later stop", async () => {
		const start = deferred<"idle">();
		vi.mocked(backend.ensureKernel).mockReturnValue(start.promise);
		const initializing = initializeTab(0);
		await initializeTab(0);
		await stopTab(0);
		start.resolve("idle");
		await initializing;
		expect(backend.ensureKernel).toHaveBeenCalledTimes(1);
		expect(nb().kernelState).toBe("stopped");
	});
});
