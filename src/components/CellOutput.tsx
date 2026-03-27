import type { CellOutput as CellOutputType } from "../types/notebook";

interface Props {
	outputs: CellOutputType[];
}

export function CellOutput({ outputs }: Props) {
	if (outputs.length === 0) return null;

	return (
		<div
			style={{
				borderTop: "1px solid var(--border)",
				backgroundColor: "var(--output-bg)",
				padding: "10px 12px",
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
		fontFamily: "var(--font-mono)",
		fontSize: "var(--font-mono-size)",
		lineHeight: "1.52",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
	};

	if (output.outputType === "stream") {
		const color = output.streamName === "stderr" ? "var(--output-stderr)" : "var(--output-fg)";
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
			<pre style={{ ...basePreStyle, color: "var(--output-error-fg)", background: "var(--output-error-bg)", padding: "6px 8px", borderRadius: 8 }}>
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
