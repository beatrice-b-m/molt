use std::path::PathBuf;
use tauri::Manager;

/// Returns the user's themes directory: ~/.config/molt/themes/
pub fn themes_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("molt").join("themes")
}

/// Copies bundled default themes into the user themes dir if they don't already exist.
/// Errors are ignored — a missing theme is non-fatal at startup.
pub fn ensure_default_themes(app_handle: &tauri::AppHandle) {
    let dir = themes_dir();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        log::warn!("ensure_default_themes: could not create themes dir: {}", e);
        return;
    }

    // Scan bundled themes directory and copy any .json files that don't
    // already exist in the user themes dir. This auto-discovers new themes
    // added to resources/themes/ without maintaining a hardcoded list.
    let src_dir = match app_handle.path().resource_dir() {
        Ok(d) => d.join("resources").join("themes"),
        Err(e) => {
            log::warn!("ensure_default_themes: could not resolve resource dir: {}", e);
            return;
        }
    };

    let entries = match std::fs::read_dir(&src_dir) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("ensure_default_themes: could not read {:?}: {}", src_dir, e);
            return;
        }
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let src = entry.path();
        if src.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(filename) = src.file_name() else { continue };
        let dest = dir.join(filename);
        if dest.exists() {
            continue;
        }
        if let Err(e) = std::fs::copy(&src, &dest) {
            log::warn!(
                "ensure_default_themes: could not copy {:?} -> {:?}: {}",
                src, dest, e
            );
        }
    }
}

/// Returns a sorted list of theme names (filenames without `.json`) from the themes dir.
/// Returns an empty vec if the directory doesn't exist or can't be read.
pub fn list_theme_names() -> Vec<String> {
    let dir = themes_dir();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };
    let mut names: Vec<String> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? == "json" {
                path.file_stem()?.to_str().map(|s| s.to_owned())
            } else {
                None
            }
        })
        .collect();
    names.sort();
    names
}

/// Reads and returns the raw JSON content for a theme by name.
/// Returns an error string if the file cannot be found or read.
pub fn load_theme_by_name(name: &str) -> Result<String, String> {
    let path = themes_dir().join(format!("{}.json", name));
    std::fs::read_to_string(&path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("Theme '{}' not found in themes directory", name)
        } else {
            format!("Failed to read theme '{}': {}", name, e)
        }
    })
}
