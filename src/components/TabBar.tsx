import { useNotebookStore } from "../store/notebookStore";

export function TabBar() {
	const activeTab = useNotebookStore((s) => s.activeTab);
	const setActiveTab = useNotebookStore((s) => s.setActiveTab);

	return (
		<div
			style={{
				display: "flex",
				borderBottom: "1px solid var(--border)",
				background: "var(--bg-secondary)",
			}}
		>
			{[0, 1, 2, 3].map((i) => (
				<button
					key={i}
					onClick={() => setActiveTab(i)}
					style={{
						padding: "6px 16px",
						background: activeTab === i ? "var(--bg-primary)" : "transparent",
						color:
							activeTab === i
								? "var(--text-primary)"
								: "var(--text-secondary)",
						border: "none",
						borderBottom:
							activeTab === i
								? "2px solid var(--accent)"
								: "2px solid transparent",
						cursor: "pointer",
						fontSize: 13,
					}}
				>
					{i + 1}
				</button>
			))}
		</div>
	);
}
