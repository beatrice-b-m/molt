import { memo } from "react";
import { useNotebookStore } from "../store/notebookStore";
import { clearNotebook, executeAllCells, restartTab, stopTab } from "../services/execution";

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

// Read the active tab at click time; subscribe only to visible kernel status.
export const Toolbar = memo(function Toolbar() {
	// Primitive selector — only re-renders when the value actually changes.
	const kernelState = useNotebookStore((s) => s.notebooks[s.activeTab].kernelState);
	const kernelStopped = kernelState === "stopped" || kernelState === "error";
	const changing = kernelState === "starting";

	const handleRestart = () => {
		const tab = useNotebookStore.getState().activeTab;
		if (kernelState === "busy" && !window.confirm("A cell is currently running. Restart kernel?")) return;
		void restartTab(tab).catch((error) => console.error("Restart failed", error));
	};
	const handleStop = () => {
		void stopTab(useNotebookStore.getState().activeTab).catch((error) => console.error("Stop failed", error));
	};
	const handleRunAll = () => { void executeAllCells(useNotebookStore.getState().activeTab); };
	const handleClear = () => {
		void clearNotebook(useNotebookStore.getState().activeTab).catch((error) => console.error("Clear failed", error));
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
			<button onClick={handleClear} disabled={changing} style={buttonStyle}>
				Clear
			</button>
			<div style={{ flexGrow: 1 }} />
			<button onClick={handleRunAll} disabled={kernelStopped || changing || kernelState === "busy"} style={buttonStyle}>
				Run All
			</button>
			<button onClick={handleRestart} disabled={changing} style={buttonStyle}>
				↻ Restart
			</button>
			<button
				onClick={handleStop}
				style={{ ...buttonStyle, opacity: kernelStopped ? 0.45 : 1 }}
				disabled={kernelStopped || changing}
			>
				■ Stop
			</button>
		</div>
	);
});
