use std::path::PathBuf;

/// Returns the path to the notebooks persistence file: ~/.config/molt/notebooks.json
fn notebooks_path() -> PathBuf {
	let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
	base.join("molt").join("notebooks.json")
}

/// Reads the notebooks file and returns its contents as a JSON string.
/// Returns Ok(None) if the file does not yet exist (first launch), Err on other I/O failures.
pub fn load_notebooks() -> Result<Option<String>, String> {
	let path = notebooks_path();
	match std::fs::read_to_string(&path) {
		Ok(contents) => Ok(Some(contents)),
		Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
		Err(e) => Err(format!("Failed to read notebooks: {}", e)),
	}
}

/// Writes the given JSON string to the notebooks file, creating the directory if needed.
pub fn save_notebooks(data: &str) -> Result<(), String> {
	let path = notebooks_path();
	if let Some(parent) = path.parent() {
		std::fs::create_dir_all(parent)
			.map_err(|e| format!("Failed to create config directory: {}", e))?;
	}
	std::fs::write(&path, data).map_err(|e| format!("Failed to write notebooks: {}", e))
}
