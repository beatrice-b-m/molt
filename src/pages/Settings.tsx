import { useEffect, useState } from "react";
import { getConfig, saveConfig, setNativeEffects, type AppConfig } from "../services/backend";
import { setEffectsClass } from "../theme/appearance";
import { emit } from "@tauri-apps/api/event";

const DEFAULT_CONFIG: AppConfig = {
	python: { interpreter: "python3" },
	app: { auto_launch: false, tab_count: 4, native_effects: true },
};

export function SettingsForm() {
	const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
	const [saveError, setSaveError] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);

	useEffect(() => {
		getConfig().then(setConfig)
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

		setNativeEffects(enabled)
			.then(() => emit("native-effects-changed", { enabled }))
			.catch((e) => {
				setPreviewError(String(e));
			});
	}

	function handleSave() {
		saveConfig(config)
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
					<div className="ui-fade-enter" style={{ color: "var(--error)", fontSize: 12 }}>
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
					<input className="settings-input"
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
						}}
					/>
					<div
						style={{
							color: "var(--text-secondary)",
							fontSize: 11,
							marginTop: 4,
						}}
					>
						Path to the Python interpreter. Absolute path or name on PATH. Save and relaunch Molt to use the new interpreter.
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
						transition: "background var(--motion-base) var(--ease-standard), opacity var(--motion-fast) var(--ease-standard)",
					}}
				>
					Save
				</button>

				{saveStatus === "saved" && (
					<span className="ui-fade-enter" style={{ color: "var(--success)", fontSize: 13 }}>Saved</span>
				)}
			</div>

			{saveStatus === "error" && saveError && (
				<div className="ui-fade-enter"
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