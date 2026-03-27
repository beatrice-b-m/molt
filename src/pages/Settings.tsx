import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

interface AppConfig {
	python: { interpreter: string };
	app: { auto_launch: boolean; tab_count: number; native_effects: boolean };
}

const DEFAULT_CONFIG: AppConfig = {
	python: { interpreter: "python3" },
	app: { auto_launch: false, tab_count: 4, native_effects: true },
};

function setEffectsClass(enabled: boolean) {
	const root = document.documentElement;
	root.classList.toggle("effects-on", enabled);
	root.classList.toggle("effects-off", !enabled);
}

export function SettingsForm() {
	const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
	const [saveError, setSaveError] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);

	useEffect(() => {
		invoke<string>("get_config")
			.then((raw) => {
				const parsed = JSON.parse(raw) as AppConfig;
				setConfig(parsed);
			})
			.catch((e) => {
				setLoadError(String(e));
			});
	}, []);

	useEffect(() => {
		setEffectsClass(config.app.native_effects);
	}, [config.app.native_effects]);

	function handleNativeEffectsChange(enabled: boolean) {
		setConfig((prev) => ({
			...prev,
			app: { ...prev.app, native_effects: enabled },
		}));
		setPreviewError(null);

		invoke("set_native_effects", { enabled })
			.then(() => emit("native-effects-changed", { enabled }))
			.catch((e) => {
				setPreviewError(String(e));
			});
	}

	function handleSave() {
		invoke("save_config", { config: JSON.stringify(config) })
			.then(() => {
				setSaveStatus("saved");
				setSaveError(null);
				setTimeout(() => setSaveStatus("idle"), 2000);
			})
			.catch((e) => {
				setSaveStatus("error");
				setSaveError(String(e));
			});
	}

	return (
		<div
			style={{
				padding: 24,
				background: "var(--bg-primary)",
				minHeight: "100vh",
				fontFamily: "var(--font-system)",
				fontSize: "var(--font-system-size)",
				color: "var(--text-primary)",
				boxSizing: "border-box",
			}}
		>
			{loadError && (
				<div
					style={{
						background: "var(--bg-tertiary)",
						border: "1px solid var(--error)",
						color: "var(--error)",
						borderRadius: 4,
						padding: "8px 12px",
						marginBottom: 24,
						fontSize: 13,
					}}
				>
					Failed to load settings: {loadError}
				</div>
			)}

			<section style={{ marginBottom: 24 }}>
				<div
					style={{
						color: "var(--text-primary)",
						fontWeight: 600,
						fontSize: 14,
						marginBottom: 12,
					}}
				>
					Appearance
				</div>

				<div style={{ marginBottom: 12 }}>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							cursor: "pointer",
							color: "var(--text-secondary)",
							fontSize: 13,
						}}
					>
						<input
							type="checkbox"
							checked={config.app.native_effects}
							onChange={(e) => handleNativeEffectsChange(e.target.checked)}
							style={{ cursor: "pointer" }}
						/>
						Use native glass effects
					</label>
					<div
						style={{
							color: "var(--text-secondary)",
							fontSize: 11,
							marginTop: 4,
							marginLeft: 22,
						}}
					>
						Applies frosted glass depth effects. Disable for a flatter, higher-clarity presentation.
					</div>
				</div>

				{previewError && (
					<div style={{ color: "var(--error)", fontSize: 12 }}>
						Could not update window appearance live: {previewError}
					</div>
				)}
			</section>

			<section style={{ marginBottom: 24 }}>
				<div
					style={{
						color: "var(--text-primary)",
						fontWeight: 600,
						fontSize: 14,
						marginBottom: 12,
					}}
				>
					Python
				</div>

				<div style={{ marginBottom: 12 }}>
					<label
						style={{
							display: "block",
							color: "var(--text-secondary)",
							fontSize: 13,
							marginBottom: 6,
						}}
					>
						Interpreter
					</label>
					<input
						type="text"
						value={config.python.interpreter}
						placeholder="python3"
						onChange={(e) =>
							setConfig((prev) => ({
								...prev,
								python: { ...prev.python, interpreter: e.target.value },
							}))
						}
						style={{
							background: "var(--bg-tertiary)",
							color: "var(--text-primary)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							padding: "6px 10px",
							fontSize: 13,
							minWidth: 300,
							outline: "none",
						}}
					/>
					<div
						style={{
							color: "var(--text-secondary)",
							fontSize: 11,
							marginTop: 4,
						}}
					>
						Path to the Python interpreter. Absolute path or name on PATH. Changes take effect on next kernel restart.
					</div>
				</div>
			</section>

			<section style={{ marginBottom: 24 }}>
				<div
					style={{
						color: "var(--text-primary)",
						fontWeight: 600,
						fontSize: 14,
						marginBottom: 12,
					}}
				>
					Application
				</div>

				<div style={{ marginBottom: 12 }}>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							cursor: "pointer",
							color: "var(--text-secondary)",
							fontSize: 13,
						}}
					>
						<input
							type="checkbox"
							checked={config.app.auto_launch}
							onChange={(e) =>
								setConfig((prev) => ({
									...prev,
									app: { ...prev.app, auto_launch: e.target.checked },
								}))
							}
							style={{ cursor: "pointer" }}
						/>
						Launch at login
					</label>
					<div
						style={{
							color: "var(--text-secondary)",
							fontSize: 11,
							marginTop: 4,
							marginLeft: 22,
						}}
					>
						Start Molt automatically when you log in to macOS.
					</div>
				</div>
			</section>

			<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
				<button
					onClick={handleSave}
					style={{
						background: "var(--accent)",
						color: "white",
						border: "none",
						borderRadius: 4,
						padding: "6px 16px",
						fontSize: 13,
						cursor: "pointer",
						fontFamily: "var(--font-system)",
					}}
				>
					Save
				</button>

				{saveStatus === "saved" && (
					<span style={{ color: "var(--success)", fontSize: 13 }}>Saved</span>
				)}
			</div>

			{saveStatus === "error" && saveError && (
				<div
					style={{
						color: "var(--error)",
						fontSize: 13,
						marginTop: 8,
					}}
				>
					{saveError}
				</div>
			)}
		</div>
	);
}

export function SettingsApp() {
	return <SettingsForm />;
}