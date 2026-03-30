import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNotebookStore } from "../store/notebookStore";

// ─── helpers ──────────────────────────────────────────────────────────────────

// Extracts only the fields we persist — source, id, type — stripping outputs,
// execution counts, and kernel state which are always rebuilt from a fresh start.
function extractPersistableState(): string {
	const { notebooks } = useNotebookStore.getState();
	return JSON.stringify({
		version: 1,
		tabs: notebooks.map((nb) => ({
			tabIndex: nb.tabIndex,
			cells: nb.cells.map((c) => ({
				id: c.id,
				type: c.type,
				source: c.source,
			})),
		})),
	});
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function usePersistence(): boolean {
	const [loaded, setLoaded] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Track the last JSON snapshot that was successfully sent to the backend,
	// so we can skip redundant writes when only non-persisted state changed.
	const lastSavedDataRef = useRef<string | null>(null);

	// Phase 1 — load persisted data once on mount, then signal ready.
	useEffect(() => {
		invoke<string | null>("load_notebooks")
			.then((result) => {
				if (result != null) {
					try {
						const parsed = JSON.parse(result) as {
							version: number;
							tabs: Array<{
								tabIndex: number;
								cells: Array<{
									id: string;
									type: "code" | "markdown";
									source: string;
								}>;
							}>;
						};
						useNotebookStore.getState().initializeFromPersisted(parsed.tabs);
						// Snapshot the just-loaded state so the first subscription
						// callback doesn't immediately re-save the same data.
						lastSavedDataRef.current = extractPersistableState();
					} catch (e) {
						console.error("Failed to parse persisted notebooks", e);
					}
				}
			})
			.catch((e) => {
				// Non-fatal: render with defaults if load fails.
				console.error("load_notebooks failed", e);
			})
			.finally(() => {
				setLoaded(true);
			});
	}, []);

	// Phase 2 — subscribe to store changes and debounce-save.
	// Guard on `loaded` so we never overwrite persisted data with blank defaults
	// during the initial render before phase 1 completes.
	useEffect(() => {
		if (!loaded) return;

		const unsubscribe = useNotebookStore.subscribe(() => {
			// Clear any pending save and reset the debounce window.
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
			}
			timerRef.current = setTimeout(() => {
				timerRef.current = null;
				const data = extractPersistableState();
				if (data === lastSavedDataRef.current) return;
				lastSavedDataRef.current = data;
				invoke("save_notebooks", { data }).catch(
					(e) => console.error("save_notebooks failed", e),
				);
			}, 1500);
		});

		return () => {
			unsubscribe();
			// Flush any pending save on unmount (best-effort; cannot await in cleanup).
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
				const data = extractPersistableState();
				if (data !== lastSavedDataRef.current) {
					lastSavedDataRef.current = data;
					invoke("save_notebooks", { data }).catch(
						(e) => console.error("save_notebooks flush failed", e),
					);
				}
			}
		};
	}, [loaded]);

	return loaded;
}
