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
	fontSize: 11,
	padding: "2px 8px",
	background: "var(--bg-tertiary)",
	color: "var(--text-primary)",
	border: "1px solid var(--border)",
	borderRadius: 4,
	cursor: "pointer",
};

export function Toolbar() {
	const activeTab = useNotebookStore((s) => s.activeTab);
	const notebook = useNotebookStore((s) => s.notebooks[s.activeTab]);
	const updateKernelState = useNotebookStore((s) => s.updateKernelState);
	const clearTab = useNotebookStore((s) => s.clearTab);

	const kernelState = notebook.kernelState;
	const kernelStopped = kernelState === "stopped" || kernelState === "error";

	const handleRestart = async () => {
		// Confirm if kernel is busy
		if (kernelState === "busy") {
			if (!window.confirm("A cell is currently running. Restart kernel?")) return;
		}
		try {
			updateKernelState(activeTab, "starting");
			const state = await restartKernel(activeTab);
			updateKernelState(activeTab, state);
			// Clear all outputs on restart (spec requirement)
			useNotebookStore.getState().notebooks[activeTab].cells.forEach((cell) => {
				useNotebookStore.getState().setCellOutputs(activeTab, cell.id, []);
				useNotebookStore.getState().setCellExecutionCount(activeTab, cell.id, 0);
				useNotebookStore.getState().setCellState(activeTab, cell.id, "idle");
			});
		} catch (e) {
			console.error("restart failed", e);
			updateKernelState(activeTab, "error");
		}
	};

	const handleStop = async () => {
		if (kernelStopped) return;
		try {
			await stopKernel(activeTab);
			updateKernelState(activeTab, "stopped");
		} catch (e) {
			console.error("stop failed", e);
			updateKernelState(activeTab, "stopped");
		}
	};

	const handleRunAll = async () => {
		const cells = useNotebookStore.getState().notebooks[activeTab].cells;
		for (const cell of cells) {
			if (cell.source.trim()) {
				await executeSingleCell(activeTab, cell.id);
			}
		}
	};

	const handleClear = async () => {
		if (!window.confirm("Clear all cells in this tab?")) return;
		if (!kernelStopped) {
			try {
				await stopKernel(activeTab);
			} catch (e) {
				console.error("clear stop failed", e);
			}
		}
		clearTab(activeTab);
	};

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "4px 12px",
				borderBottom: "1px solid var(--border)",
				background: "var(--bg-secondary)",
			}}
		>
			{/* Kernel status dot */}
			<span
				style={{
					width: 8,
					height: 8,
					borderRadius: "50%",
					background: STATE_COLOR[kernelState] ?? "var(--text-secondary)",
					display: "inline-block",
				}}
				title={kernelState}
			/>
			<span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
				{kernelState}
			</span>
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
				style={{ ...buttonStyle, opacity: kernelStopped ? 0.5 : 1 }}
				disabled={kernelStopped}
			>
				■ Stop
			</button>
		</div>
	);
}
