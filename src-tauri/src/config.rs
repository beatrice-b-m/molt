use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// Application configuration from ~/.config/molt/config.toml
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_python")]
    pub python: PythonConfig,
    #[serde(default)]
    pub app: AppSection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonConfig {
    #[serde(default = "default_interpreter")]
    pub interpreter: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSection {
    #[serde(default)]
    pub auto_launch: bool,
    #[serde(default = "default_tab_count")]
    pub tab_count: u8,
    #[serde(default = "default_native_effects")]
    pub native_effects: bool,
}


fn default_python() -> PythonConfig {
    PythonConfig {
        interpreter: default_interpreter(),
    }
}

fn default_interpreter() -> String {
    "python3".to_string()
}

fn default_tab_count() -> u8 {
    4
}

fn default_native_effects() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            python: default_python(),
            app: AppSection::default(),
        }
    }
}

impl Default for AppSection {
    fn default() -> Self {
        Self {
            auto_launch: false,
            tab_count: default_tab_count(),
            native_effects: default_native_effects(),
        }
    }
}

/// Holds interpreter validation warning, if any.
pub struct ConfigState {
    pub warning: Mutex<Option<String>>,
}

impl ConfigState {
    pub fn new(warning: Option<String>) -> Self {
        Self {
            warning: Mutex::new(warning),
        }
    }
}

/// Returns the config file path: ~/.config/molt/config.toml
fn config_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("molt").join("config.toml")
}

/// Reads config from disk, creating the file with defaults if it doesn't exist.
pub fn load_config() -> AppConfig {
    let path = config_path();
    if !path.exists() {
        // Create parent directories and write defaults
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let default = AppConfig::default();
        let content = format!(
            "[python]\n# Path to the Python interpreter to use for all kernels.\n# Supports absolute paths or names resolvable on PATH.\n# Default: \"python3\"\ninterpreter = \"{}\"\n\n[app]\n# Launch Molt automatically at macOS login.\nauto_launch = {}\n\n# Number of tabs. Currently fixed at 4; reserved for future use.\ntab_count = {}\n\n# Enable native macOS glass/vibrancy window effects.\nnative_effects = {}\n",
            default.python.interpreter, default.app.auto_launch, default.app.tab_count, default.app.native_effects,
        );
        let _ = std::fs::write(&path, content);
        return default;
    }

    match std::fs::read_to_string(&path) {
        Ok(contents) => toml::from_str(&contents).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

/// Writes the given config to disk, preserving human-readable formatting.
pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    let content = format!(
        "[python]\n# Path to the Python interpreter to use for all kernels.\n# Supports absolute paths or names resolvable on PATH.\n# Default: \"python3\"\ninterpreter = \"{}\"\n\n[app]\n# Launch Molt automatically at macOS login.\nauto_launch = {}\n\n# Number of tabs. Currently fixed at 4; reserved for future use.\ntab_count = {}\n\n# Enable native macOS glass/vibrancy window effects.\nnative_effects = {}\n",
        config.python.interpreter, config.app.auto_launch, config.app.tab_count, config.app.native_effects,
    );
    std::fs::write(&path, content).map_err(|e| format!("Failed to write config: {}", e))
}

/// Resolves the configured interpreter string.
pub fn resolve_interpreter() -> String {
    load_config().python.interpreter
}

/// Validates that the configured interpreter can execute.
/// Returns None if valid, Some(error message) if invalid.
pub fn validate_interpreter() -> Option<String> {
    let interpreter = resolve_interpreter();
    match std::process::Command::new(&interpreter)
        .arg("--version")
        .output()
    {
        Ok(output) if output.status.success() => None,
        Ok(output) => Some(format!(
            "Python interpreter '{}' returned error: {}",
            interpreter,
            String::from_utf8_lossy(&output.stderr)
        )),
        Err(e) => Some(format!(
            "Python interpreter '{}' not found: {}. Update ~/.config/molt/config.toml",
            interpreter, e
        )),
    }
}

/// Resolves the path to the bundled kernel_server.py resource.
pub fn resolve_kernel_script_path(app_handle: &tauri::AppHandle) -> PathBuf {
    // In development, the resource is at src-tauri/resources/kernel_server.py
    // In production, Tauri bundles it into the app resources
    app_handle
        .path()
        .resource_dir()
        .ok()
        .map(|d: PathBuf| d.join("resources").join("kernel_server.py"))
        .unwrap_or_else(|| PathBuf::from("resources/kernel_server.py"))
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_has_expected_values() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.python.interpreter, "python3");
        assert_eq!(cfg.app.auto_launch, false);
        assert_eq!(cfg.app.tab_count, 4);
        assert_eq!(cfg.app.native_effects, true);
    }

    #[test]
    fn toml_parses_custom_interpreter() {
        let toml = r#"
[python]
interpreter = "/usr/local/bin/python3.12"

[app]
auto_launch = true
tab_count = 2
"#;
        let cfg: AppConfig = toml::from_str(toml).expect("parse failed");
        assert_eq!(cfg.python.interpreter, "/usr/local/bin/python3.12");
        assert_eq!(cfg.app.auto_launch, true);
        assert_eq!(cfg.app.tab_count, 2);
        assert_eq!(cfg.app.native_effects, true);
    }

    #[test]
    fn toml_empty_string_produces_defaults() {
        let cfg: AppConfig = toml::from_str("").expect("parse failed");
        assert_eq!(cfg.python.interpreter, "python3");
        assert_eq!(cfg.app.auto_launch, false);
        assert_eq!(cfg.app.tab_count, 4);
        assert_eq!(cfg.app.native_effects, true);
    }

    #[test]
    fn toml_partial_python_section_fills_app_defaults() {
        let toml = r#"
[python]
interpreter = "pypy3"
"#;
        let cfg: AppConfig = toml::from_str(toml).expect("parse failed");
        assert_eq!(cfg.python.interpreter, "pypy3");
        // app section absent — must fall back to defaults
        assert_eq!(cfg.app.auto_launch, false);
        assert_eq!(cfg.app.tab_count, 4);
        assert_eq!(cfg.app.native_effects, true);
    }
    #[test]
    fn toml_parses_native_effects_field() {
        let toml = r#"
[app]
native_effects = false
"#;
        let cfg: AppConfig = toml::from_str(toml).expect("parse failed");
        assert_eq!(cfg.app.native_effects, false);
    }

    #[test]
    fn toml_legacy_theme_field_is_ignored() {
        let toml = r#"
[app]
theme = "github-light"
"#;
        let cfg: AppConfig = toml::from_str(toml).expect("parse failed");
        assert_eq!(cfg.app.native_effects, true);
    }

}