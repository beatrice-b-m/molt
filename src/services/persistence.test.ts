import { describe, it, expect, vi, afterEach } from "vitest";
import { createNotebookSaver, parseNotebooks } from "./persistence";

const snapshot = { version: 1, tabs: [{ tabIndex: 0, cells: [{ id: "a", type: "code", source: "x = 1" }] }] };

afterEach(() => vi.useRealTimers());

describe("saved notebook validation", () => {
	it("accepts valid sources and rejects unknown versions, invalid values, and duplicate IDs", () => {
		expect(parseNotebooks(JSON.stringify(snapshot))).toEqual(snapshot.tabs);
		for (const bad of [null, {}, { ...snapshot, version: 2 }, { version: 1, tabs: [null] }, { ...snapshot, tabs: [...snapshot.tabs, ...snapshot.tabs] }, { version: 1, tabs: [{ tabIndex: 0, cells: [{ id: "a", type: "code", source: 42 }] }] }]) {
			expect(() => parseNotebooks(JSON.stringify(bad))).toThrow();
		}
	});
});

describe("notebook writer", () => {
	it("serializes writes and saves the newest snapshot after a slow write", async () => {
		vi.useFakeTimers();
		let finish!: () => void;
		const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(undefined);
		const saver = createNotebookSaver(save, vi.fn(), "initial");
		saver.schedule("older");
		const writing = saver.flush();
		saver.schedule("newer");
		await vi.advanceTimersByTimeAsync(1500);
		expect(save).toHaveBeenCalledTimes(1);
		finish();
		await writing;
		expect(save.mock.calls.map(([data]) => data)).toEqual(["older", "newer"]);
	});

	it("does not mark failed writes saved and retries on flush", async () => {
		const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
		const errors = vi.fn();
		const saver = createNotebookSaver(save, errors, "initial");
		saver.schedule("changed");
		await saver.flush();
		await saver.flush();
		expect(save.mock.calls.map(([data]) => data)).toEqual(["changed", "changed"]);
		expect(errors).toHaveBeenLastCalledWith(null);
	});
});
