use std::io::Write;
use std::path::{Path, PathBuf};

/// On macOS, dirs::config_dir() is ~/Library/Application Support.
pub fn data_path(filename: &str) -> Result<PathBuf, String> {
    dirs::config_dir()
        .map(|base| base.join("molt").join(filename))
        .ok_or_else(|| "Could not resolve the application data directory".into())
}

/// Replace a complete snapshot, never truncate the last valid file in place.
pub fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing parent directory")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!(".molt-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_snapshot_and_cleans_up_failed_write() {
        let dir = std::env::temp_dir().join(format!("molt-storage-{}", uuid::Uuid::new_v4()));
        let path = dir.join("notebooks.json");
        atomic_write(&path, "old snapshot").unwrap();
        atomic_write(&path, "new snapshot").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new snapshot");
        let destination_directory = dir.join("directory");
        std::fs::create_dir(&destination_directory).unwrap();
        assert!(atomic_write(&destination_directory, "fails").is_err());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 2);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
