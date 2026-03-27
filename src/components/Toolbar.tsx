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
};

export function Toolbar() {
	const activeTab = useNotebookStore((s) => s.activeTab);
	const notebook = useNotebookStore((s) => s.notebooks[s.activeTab]);
	const updateKernelState = useNotebookStore((s) => s.updateKernelState);
	const clearTab = useNotebookStore((s) => s.clearTab);

	const kernelState = notebook.kernelState;
	const kernelStopped = kernelState === "stopped" || kernelState === "error";

	const handleRestart = async () => {
		if (kernelState === "busy") {
			if (!window.confirm("A cell is currently running. Restart kernel?")) return;
		}
		try {
			updateKernelState(activeTab, "starting");
			const state = await restartKernel(activeTab);
			updateKernelState(activeTab, state);
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

	const handleClear = () => {
		clearTab(activeTab);
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
				}}
			>
				<span
					style={{
						width: 7,
						height: 7,
						borderRadius: "50%",
						background: STATE_COLOR[kernelState] ?? "var(--text-secondary)",
						display: "inline-block",
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
}