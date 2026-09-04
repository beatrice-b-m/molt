import type { Notebook } from "../types/notebook";

export interface PersistedTab {
	tabIndex: number;
	cells: Array<{ id: string; type: "code" | "markdown"; source: string }>;
}

export function parseNotebooks(raw: string): PersistedTab[] {
	const data = JSON.parse(raw);
	if (data?.version !== 1 || !Array.isArray(data.tabs)) {
		throw new Error("Unsupported notebook file format");
	}
	const tabs = new Set<number>();
	const ids = new Set<string>();
	for (const tab of data.tabs) {
		if (!Number.isInteger(tab?.tabIndex) || tab.tabIndex < 0 || tab.tabIndex >= 4 || tabs.has(tab.tabIndex) || !Array.isArray(tab.cells)) {
			throw new Error("Invalid or duplicate notebook tab");
		}
		tabs.add(tab.tabIndex);
		for (const cell of tab.cells) {
			if (!cell || typeof cell.id !== "string" || !cell.id || ids.has(cell.id) || typeof cell.source !== "string" || !["code", "markdown"].includes(cell.type)) {
				throw new Error("Invalid or duplicate notebook cell");
			}
			ids.add(cell.id);
		}
	}
	return data.tabs;
}

export function serializeNotebooks(notebooks: Notebook[]): string {
	return JSON.stringify({
		version: 1,
		tabs: notebooks.map(({ tabIndex, cells }) => ({
			tabIndex,
			cells: cells.map(({ id, type, source }) => ({ id, type, source })),
		})),
	});
}

/** One writer per window: saves cannot complete out of order. */
export function createNotebookSaver(
	save: (data: string) => Promise<void>,
	onError: (error: string | null) => void,
	initial: string,
) {
	let saved = initial;
	let pending: string | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let running: Promise<void> | null = null;

	function flush(): Promise<void> {
		clearTimeout(timer);
		if (running) return running;
		running = (async () => {
			while (pending !== null) {
				const data = pending;
				pending = null;
				if (data === saved) continue;
				try {
					await save(data);
					saved = data;
					onError(null);
				} catch (error) {
					pending ??= data;
					onError(`Notebook save failed: ${String(error)}`);
					break;
				}
			}
		})();
		return running.finally(() => { running = null; });
	}

	return {
		schedule(data: string) {
			// Even reverting to the saved content must supersede an in-flight write.
			pending = data;
			clearTimeout(timer);
			timer = setTimeout(() => { void flush(); }, 1500);
		},
		flush,
	};
}
