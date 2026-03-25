import type { CellOutput as CellOutputType } from "../types/notebook";

interface Props {
	outputs: CellOutputType[];
}

export function CellOutput({ outputs }: Props) {
	if (outputs.length === 0) return null;

	return (
		<div
			style={{
				borderTop: "1px solid #333",
				backgroundColor: "#161616",
				padding: "8px 12px",
				overflowX: "auto",
			}}
		>
			{outputs.map((output, i) => (
				<OutputItem key={i} output={output} />
			))}
		</div>
	);
}

function OutputItem({ output }: { output: CellOutputType }) {
	const basePreStyle: React.CSSProperties = {
		margin: 0,
		fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
		fontSize: "12px",
		lineHeight: "1.5",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
	};

	if (output.outputType === "stream") {
		const color = output.streamName === "stderr" ? "#ff9500" : "#e8e8e8";
		return (
			<pre style={{ ...basePreStyle, color }}>
				{output.text ?? ""}
			</pre>
		);
	}

	if (output.outputType === "error") {
		const raw = output.text ?? "";
		const lines = raw.split("\n");
		return (
			<pre style={{ ...basePreStyle, color: "#ff3b30" }}>
				{lines.map((line, i) =>
					i === 0 ? (
						<strong key={i}>{line}</strong>
					) : (
						<span key={i}>{"\n" + line}</span>
					),
				)}
			</pre>
		);
	}

	// "image/png" — reserved, not rendered in v1
	return null;
}
