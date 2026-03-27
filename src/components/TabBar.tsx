import { useNotebookStore } from "../store/notebookStore";

export function TabBar() {
	const activeTab = useNotebookStore((s) => s.activeTab);
	const setActiveTab = useNotebookStore((s) => s.setActiveTab);

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				padding: "8px 12px",
				borderBottom: "1px solid var(--border)",
				background: "var(--bg-secondary)",
			}}
		>
			<div
				style={{
					display: "inline-flex",
					padding: 3,
					gap: 2,
					borderRadius: 11,
					background: "var(--segment-control-bg)",
					border: "1px solid var(--border)",
					boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.6)",
				}}
			>
				{[0, 1, 2, 3].map((i) => {
					const isActive = activeTab === i;
					return (
						<button
							key={i}
							onClick={() => setActiveTab(i)}
							style={{
								padding: "4px 14px",
								background: isActive ? "var(--segment-control-active-bg)" : "transparent",
								color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
								border: "none",
								borderRadius: 8,
								cursor: "pointer",
								fontSize: 12,
								fontWeight: isActive ? 600 : 500,
								boxShadow: isActive ? "var(--control-shadow)" : "none",
							}}
						>
							Tab {i + 1}
						</button>
					);
				})}
			</div>
		</div>
	);
}