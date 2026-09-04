use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// Application configuration in the platform application data directory.
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

/// Read saved configuration, creating defaults on first launch.
pub fn load_config() -> AppConfig {
    let result = (|| -> Result<AppConfig, String> {
        let path = crate::storage::data_path("config.toml")?;
        match std::fs::read_to_string(&path) {
            Ok(contents) => toml::from_str(&contents).map_err(|e| e.to_string()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let config = AppConfig::default();
                save_config(&config)?;
                Ok(config)
            }
            Err(e) => Err(e.to_string()),
        }
    })();
    result.unwrap_or_else(|error| {
        log::warn!("Could not load configuration; using defaults: {}", error);
        AppConfig::default()
    })
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let content = toml::to_string_pretty(config).map_err(|e| e.to_string())?;
    crate::storage::atomic_write(&crate::storage::data_path("config.toml")?, &content)
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
            "Python interpreter '{}' not found: {}. Update the Python interpreter in Settings and relaunch Molt",
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
    fn interpreter_with_quotes_and_backslashes_round_trips() {
        let mut config = AppConfig::default();
        config.python.interpreter = "a\"b\\c/python3".into();
        let serialized = toml::to_string_pretty(&config).unwrap();
        let parsed: AppConfig = toml::from_str(&serialized).unwrap();
        assert_eq!(parsed.python.interpreter, config.python.interpreter);
    }

    #[test]
    fn default_config_has_expected_values() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.python.interpreter, "python3");
        assert!(!cfg.app.auto_launch);
        assert_eq!(cfg.app.tab_count, 4);
        assert!(cfg.app.native_effects);
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
        assert!(cfg.app.auto_launch);
        assert_eq!(cfg.app.tab_count, 2);
        assert!(cfg.app.native_effects);
    }

    #[test]
    fn toml_empty_string_produces_defaults() {
        let cfg: AppConfig = toml::from_str("").expect("parse failed");
        assert_eq!(cfg.python.interpreter, "python3");
        assert!(!cfg.app.auto_launch);
        assert_eq!(cfg.app.tab_count, 4);
        assert!(cfg.app.native_effects);
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
        assert!(!cfg.app.auto_launch);
        assert_eq!(cfg.app.tab_count, 4);
        assert!(cfg.app.native_effects);
    }
    #[test]
    fn toml_parses_native_effects_field() {
        let toml = r#"
[app]
native_effects = false
"#;
        let cfg: AppConfig = toml::from_str(toml).expect("parse failed");
        assert!(!cfg.app.native_effects);
    }

    #[test]
    fn toml_legacy_theme_field_is_ignored() {
        let toml = r#"
[app]
theme = "github-light"
"#;
        let cfg: AppConfig = toml::from_str(toml).expect("parse failed");
        assert!(cfg.app.native_effects);
    }
}
