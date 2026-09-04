use crate::storage::{atomic_write, data_path};

/// Return the saved snapshot, or None on first launch. Validation lives in the frontend.
pub fn load_notebooks() -> Result<Option<String>, String> {
    match std::fs::read_to_string(data_path("notebooks.json")?) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Failed to read notebooks: {}", e)),
    }
}

pub fn save_notebooks(data: &str) -> Result<(), String> {
    atomic_write(&data_path("notebooks.json")?, data)
}
