export type CellState = "idle" | "running" | "error" | "success";

export type KernelState = "starting" | "idle" | "busy" | "stopped" | "error";

export interface CellOutput {
	outputType: "stream" | "error" | "image/png";
	streamName?: "stdout" | "stderr";
	text?: string;
	imageData?: string;
}

export interface Cell {
	id: string;
	type: "code" | "markdown";
	source: string;
	executionCount: number | null;
	outputs: CellOutput[];
	state: CellState;
}

export interface Notebook {
	tabIndex: number;
	cells: Cell[];
	kernelState: KernelState;
	executionCounter: number;
}

export type KernelResponse = {
	id: string;
	type: string;
	stdout: string;
	stderr: string;
	error: string | null;
	output_type: string;
};
