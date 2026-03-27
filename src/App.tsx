import { useEffect, useRef, useState } from "react";
import "./styles.css";
import { TabBar } from "./components/TabBar";
import { Toolbar } from "./components/Toolbar";
import { Notebook } from "./components/Notebook";
import { useNotebookStore } from "./store/notebookStore";
import { ensureKernel, getConfigWarning } from "./hooks/useKernel";
import { usePersistence } from "./hooks/usePersistence";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ─── WarningBanner ────────────────────────────────────────────────────────────

function WarningBanner({ message }: { message: string }) {
	return (
		<div
			style={{
				background: "var(--warning-bg)",
				borderBottom: "1px solid var(--warning)",
				color: "var(--warning)",
				fontSize: 12,
				padding: "6px 12px",
				fontFamily: "var(--font-system)",
			}}
		>
			⚠ {message}
		</div>
	);
}

interface AppearanceConfig {
	app: { native_effects: boolean };
}

function setEffectsClass(enabled: boolean) {
	const root = document.documentElement;
	root.classList.toggle("effects-on", enabled);
	root.classList.toggle("effects-off", !enabled);
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
	const activeTab = useNotebookStore((s) => s.activeTab);
	const notebooks = useNotebookStore((s) => s.notebooks);
	const setActiveTab = useNotebookStore((s) => s.setActiveTab);
	const focusedCellId = useNotebookStore((s) => s.focusedCellId);
	const isCommandMode = useNotebookStore((s) => s.isCommandMode);
	const setCommandMode = useNotebookStore((s) => s.setCommandMode);
	const insertCellAbove = useNotebookStore((s) => s.insertCellAbove);
	const insertCellBelow = useNotebookStore((s) => s.insertCellBelow);
	const deleteCell = useNotebookStore((s) => s.deleteCell);
	const setFocusedCellId = useNotebookStore((s) => s.setFocusedCellId);
	const updateKernelState = useNotebookStore((s) => s.updateKernelState);

	const [configWarning, setConfigWarning] = useState<string | null>(null);
	const notebooksLoaded = usePersistence();

	// Track the timestamp of the most recent 'd' keydown for DD detection.
	const lastDKeyTime = useRef<number>(0);

	// ── appearance: sync effect mode from persisted config and settings changes ──
	useEffect(() => {
		invoke<string>("get_config")
			.then((raw) => {
				const parsed = JSON.parse(raw) as AppearanceConfig;
				setEffectsClass(parsed.app.native_effects);
			})
			.catch((e) => console.error("get_config appearance sync failed", e));

		const unlisten = listen<{ enabled: boolean }>("native-effects-changed", (event) => {
			setEffectsClass(event.payload.enabled);
		});

		return () => { unlisten.then((f) => f()); };
	}, []);


	// ── boot: config warning + initial kernel ─────────────────────────────────
	useEffect(() => {
		getConfigWarning()
			.then((w) => setConfigWarning(w))
			.catch((e) => console.error("getConfigWarning failed", e));

		ensureKernel(activeTab)
			.then((state) => updateKernelState(activeTab, state))
			.catch((e) => console.error("ensureKernel failed", e));
		// Run once on mount — intentionally omitting activeTab from deps.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ── lazy kernel start on tab switch ──────────────────────────────────────
	useEffect(() => {
		// Skip if already started (not "stopped" means it was initialized).
		if (notebooks[activeTab].kernelState !== "stopped") return;

		ensureKernel(activeTab)
			.then((state) => updateKernelState(activeTab, state))
			.catch((e) =>
				console.error(`ensureKernel tab ${activeTab} failed`, e),
			);
	}, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

	// ── global keyboard shortcuts ─────────────────────────────────────────────
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			// Cmd+1..4: switch tab
			if (e.metaKey && !e.shiftKey && !e.altKey) {
				if (e.key >= "1" && e.key <= "4") {
					e.preventDefault();
					setActiveTab(Number(e.key) - 1);
					return;
				}
			}

			// Esc: enter command mode + blur cell
			if (e.key === "Escape") {
				setCommandMode(true);
				(document.activeElement as HTMLElement)?.blur?.();
				return;
			}

			// Command-mode shortcuts require a focused cell.
			if (!isCommandMode || !focusedCellId) return;

			// 'a': insert cell above
			if (e.key === "a" && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				const newId = insertCellAbove(activeTab, focusedCellId);
				setFocusedCellId(newId);
				return;
			}

			// 'b': insert cell below
			if (e.key === "b" && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				const newId = insertCellBelow(activeTab, focusedCellId);
				setFocusedCellId(newId);
				return;
			}

			// 'dd': delete cell — requires two 'd' presses within 500ms
			if (e.key === "d" && !e.metaKey && !e.ctrlKey) {
				const now = Date.now();
				if (now - lastDKeyTime.current < 500) {
					e.preventDefault();
				deleteCell(activeTab, focusedCellId);
					setFocusedCellId(null);
					lastDKeyTime.current = 0;
				} else {
					lastDKeyTime.current = now;
				}
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [
		activeTab,
		isCommandMode,
		focusedCellId,
		setActiveTab,
		setCommandMode,
		insertCellAbove,
		insertCellBelow,
		deleteCell,
		setFocusedCellId,
	]);

	if (!notebooksLoaded) return null;

	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

			{/* Config warning banner — only shown when present */}
			{configWarning && <WarningBanner message={configWarning} />}

			<TabBar />
			<Toolbar />

			{/* Notebook takes remaining height and scrolls internally */}
			<Notebook />
		</div>
	);
}
