import { useEffect, useState } from "react";
import { loadNotebooks, saveNotebooks } from "../services/backend";
import { useNotebookStore } from "../store/notebookStore";
import { createNotebookSaver, parseNotebooks, serializeNotebooks } from "../services/persistence";

export function usePersistence(): { loaded: boolean; error: string | null } {
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;
		let saver: ReturnType<typeof createNotebookSaver> | undefined;
		async function initialize() {
			try {
				const raw = await loadNotebooks();
				if (cancelled) return;
				if (raw !== null) useNotebookStore.getState().initializeFromPersisted(parseNotebooks(raw));
				let snapshot = serializeNotebooks(useNotebookStore.getState().notebooks);
				saver = createNotebookSaver(
					saveNotebooks,
					(message) => { if (!cancelled) setError(message); },
					snapshot,
				);
				unsubscribe = useNotebookStore.subscribe((state, previous) => {
					if (state.notebooks === previous.notebooks) return;
					const next = serializeNotebooks(state.notebooks);
					if (next !== snapshot) {
						snapshot = next;
						saver!.schedule(next);
					}
				});
			} catch (cause) {
				if (!cancelled) setError(`Could not load saved notebooks. Autosave is disabled to protect the file: ${String(cause)}`);
			} finally {
				if (!cancelled) setLoaded(true);
			}
		}
		void initialize();
		return () => {
			cancelled = true;
			unsubscribe?.();
			// Best effort only: native Quit does not wait for React cleanup.
			void saver?.flush();
		};
	}, []);

	return { loaded, error };
}
