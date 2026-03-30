import { memo } from "react";
import { useNotebookStore } from "../store/notebookStore";
import { restartKernel, stopKernel } from "../hooks/useKernel";
import { executeSingleCell } from "../hooks/execution";

const STATE_COLOR: Record<string, string> = {
	idle: "var(--success)",
	busy: "var(--warning)",
	starting: "var(--warning)",
	stopped: "var(--error)",
	error: "var(--error)",
};

const buttonStyle: React.CSSProperties = {
	fontSize: 12,
	padding: "4px 10px",
	background: "var(--control-bg)",
	color: "var(--text-primary)",
	border: "1px solid var(--border)",
	borderRadius: 8,
	cursor: "pointer",
	fontWeight: 500,
	boxShadow: "var(--control-shadow)",
	transition: "color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard), opacity var(--motion-fast) var(--ease-standard)",
};

/**
 * Toolbar subscribes only to `kernelState` (a primitive string), not the
 * full notebook object.  When switching between tabs that share the same
 * kernel state, Zustand's Object.is check returns true and no re-render
 * is triggered — eliminating the flicker caused by unnecessary DOM
 * reconciliation during heavy sibling (Notebook) updates.
 *
 * `activeTab` is read from getState() inside event handlers instead of
 * being subscribed to, because its value only matters at click-time.
 */
export const Toolbar = memo(function Toolbar() {
	// Primitive selector — only re-renders when the value actually changes.
	const kernelState = useNotebookStore((s) => s.notebooks[s.activeTab].kernelState);
	// Stable function references — never change, never cause re-renders.
	const updateKernelState = useNotebookStore((s) => s.updateKernelState);
	const clearTab = useNotebookStore((s) => s.clearTab);

	const kernelStopped = kernelState === "stopped" || kernelState === "error";

	const handleRestart = async () => {
		const tab = useNotebookStore.getState().activeTab;
		if (kernelState === "busy") {
			if (!window.confirm("A cell is currently running. Restart kernel?")) return;
		}
		try {
			updateKernelState(tab, "starting");
			const state = await restartKernel(tab);
			updateKernelState(tab, state);
			useNotebookStore.getState().notebooks[tab].cells.forEach((cell) => {
				useNotebookStore.getState().setCellOutputs(tab, cell.id, []);
				useNotebookStore.getState().setCellExecutionCount(tab, cell.id, 0);
				useNotebookStore.getState().setCellState(tab, cell.id, "idle");
			});
		} catch (e) {
			console.error("restart failed", e);
			updateKernelState(tab, "error");
		}
	};

	const handleStop = async () => {
		if (kernelStopped) return;
		const tab = useNotebookStore.getState().activeTab;
		try {
			await stopKernel(tab);
			updateKernelState(tab, "stopped");
		} catch (e) {
			console.error("stop failed", e);
			updateKernelState(tab, "stopped");
		}
	};

	const handleRunAll = async () => {
		const tab = useNotebookStore.getState().activeTab;
		const cells = useNotebookStore.getState().notebooks[tab].cells;
		for (const cell of cells) {
			if (cell.source.trim()) {
				await executeSingleCell(tab, cell.id);
			}
		}
	};

	const handleClear = () => {
		clearTab(useNotebookStore.getState().activeTab);
	};

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "7px 12px",
				borderBottom: "1px solid var(--border)",
				background: "var(--bg-secondary)",
			}}
		>
			<div
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					padding: "3px 8px",
					borderRadius: 999,
					background: "var(--bg-tertiary)",
					border: "1px solid var(--border)",
					// Fixed width prevents layout shift when kernel state text changes
					// (e.g. "starting" → "idle"). The longest label is "starting" (~8ch).
					minWidth: 78,
				}}
			>
				<span
					style={{
						width: 7,
						height: 7,
						borderRadius: "50%",
						background: STATE_COLOR[kernelState] ?? "var(--text-secondary)",
						display: "inline-block",
						transition: "background-color var(--motion-base) var(--ease-standard)",
					}}
					title={kernelState}
				/>
				<span style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "capitalize" }}>
					{kernelState}
				</span>
			</div>
			<button onClick={handleClear} style={buttonStyle}>
				Clear
			</button>
			<div style={{ flexGrow: 1 }} />
			<button onClick={handleRunAll} style={buttonStyle}>
				Run All
			</button>
			<button onClick={handleRestart} style={buttonStyle}>
				↻ Restart
			</button>
			<button
				onClick={handleStop}
				style={{ ...buttonStyle, opacity: kernelStopped ? 0.45 : 1 }}
				disabled={kernelStopped}
			>
				■ Stop
			</button>
		</div>
	);
});
