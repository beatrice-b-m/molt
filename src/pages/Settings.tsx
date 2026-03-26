import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { loadActiveTheme, loadThemeByName } from "../theme/load";
import { applyThemeToCss } from "../theme/css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppConfig {
	python: { interpreter: string };
	app: { auto_launch: boolean; tab_count: number; theme: string };
}

const DEFAULT_CONFIG: AppConfig = {
	python: { interpreter: "python3" },
	app: { auto_launch: false, tab_count: 4, theme: "github-dark" },
};

// ─── SettingsForm ─────────────────────────────────────────────────────────────

export function SettingsForm() {
	const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
	const [themes, setThemes] = useState<string[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
	const [saveError, setSaveError] = useState<string | null>(null);

	// Load config and theme list on mount.
	useEffect(() => {
		const loadConfig = invoke<string>("get_config")
			.then((raw) => {
				const parsed = JSON.parse(raw) as AppConfig;
				setConfig(parsed);
			});

		const loadThemes = invoke<string[]>("list_themes")
			.then((names) => setThemes(names));

		Promise.all([loadConfig, loadThemes]).catch((e) => {
			setLoadError(String(e));
		});
	}, []);

	// Apply live theme preview when the user picks a different theme.
	function handleThemeChange(name: string) {
		setConfig((prev) => ({
			...prev,
			app: { ...prev.app, theme: name },
		}));
		loadThemeByName(name)
			.then((theme) => {
				applyThemeToCss(theme);
				emit("theme-changed", { name });
			})
			.catch((e) => console.error("Theme preview failed", e));
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
			{/* Error banner — shown only when initial load failed */}
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

			{/* ── Appearance ─────────────────────────────────────────────────── */}
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
							display: "block",
							color: "var(--text-secondary)",
							fontSize: 13,
							marginBottom: 6,
						}}
					>
						Theme
					</label>
					<select
						value={config.app.theme}
						onChange={(e) => handleThemeChange(e.target.value)}
						style={{
							background: "var(--bg-tertiary)",
							color: "var(--text-primary)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							padding: "6px 10px",
							fontSize: 13,
							minWidth: 200,
							cursor: "pointer",
						}}
					>
						{themes.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
						{/* Fallback: ensure current value is always present even if list hasn't loaded */}
						{themes.length === 0 && (
							<option value={config.app.theme}>{config.app.theme}</option>
						)}
					</select>
				</div>
			</section>

			{/* ── Python ─────────────────────────────────────────────────────── */}
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
						Path to the Python interpreter. Absolute path or name on PATH.
						Changes take effect on next kernel restart.
					</div>
				</div>
			</section>

			{/* ── Application ────────────────────────────────────────────────── */}
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

			{/* ── Save ───────────────────────────────────────────────────────── */}
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

// ─── SettingsApp ──────────────────────────────────────────────────────────────

export function SettingsApp() {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		loadActiveTheme()
			.then((theme) => {
				applyThemeToCss(theme);
				setReady(true);
			})
			.catch(() => setReady(true));
	}, []);

	if (!ready) return null;
	return <SettingsForm />;
}
