import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePersistence } from "./usePersistence";
import { useNotebookStore } from "../store/notebookStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const initial = useNotebookStore.getState();
beforeEach(() => { useNotebookStore.setState(initial, true); vi.mocked(invoke).mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("ignores a stale StrictMode load after the current load and an edit", async () => {
	const resolve: Array<(value: string | null) => void> = [];
	vi.mocked(invoke).mockImplementation(() => new Promise((done) => { resolve.push(done as (value: string | null) => void); }));
	const { result } = renderHook(usePersistence, { wrapper: StrictMode });
	expect(resolve).toHaveLength(2);
	await act(async () => resolve[1](null));
	const id = useNotebookStore.getState().notebooks[0].cells[0].id;
	act(() => useNotebookStore.getState().updateCellSource(0, id, "keep this edit"));
	await act(async () => resolve[0](JSON.stringify({ version: 1, tabs: [{ tabIndex: 0, cells: [{ id, type: "code", source: "stale" }] }] })));
	expect(result.current.loaded).toBe(true);
	expect(useNotebookStore.getState().notebooks[0].cells[0].source).toBe("keep this edit");
});

it("does not overwrite an invalid saved file with defaults or new edits", async () => {
	vi.useFakeTimers();
	vi.mocked(invoke).mockResolvedValue('{"version":99}');
	const { result } = renderHook(usePersistence);
	await act(async () => {});
	expect(result.current.error).toContain("Autosave is disabled");
	const cell = useNotebookStore.getState().notebooks[0].cells[0];
	act(() => useNotebookStore.getState().updateCellSource(0, cell.id, "new work"));
	await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
	expect(invoke).toHaveBeenCalledTimes(1);
});
