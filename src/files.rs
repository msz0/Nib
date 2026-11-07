use std::{
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use serde::{Deserialize, Serialize};

const CATEGORIES: &[(&str, &[&str])] = &[
    (
        "Images",
        &[
            "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "tif", "tiff", "ico", "avif",
        ],
    ),
    (
        "Documents",
        &[
            "pdf", "doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "csv", "ppt", "pptx", "md",
            "epub",
        ],
    ),
    (
        "Videos",
        &["mp4", "mkv", "mov", "avi", "webm", "wmv", "m4v"],
    ),
    ("Audio", &["mp3", "wav", "flac", "m4a", "aac", "ogg", "wma"]),
    ("Archives", &["zip", "rar", "7z", "tar", "gz", "bz2", "iso"]),
    ("Installers", &["exe", "msi", "msix", "appx"]),
    (
        "Code",
        &[
            "js", "ts", "py", "java", "c", "cpp", "cs", "go", "rs", "html", "css", "json", "xml",
            "sh", "bat", "ps1", "sql", "ipynb",
        ],
    ),
];

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct MoveResult {
    pub moved: usize,
    pub failed: usize,
}

pub fn category_for(path: impl AsRef<Path>) -> &'static str {
    let extension = path
        .as_ref()
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    CATEGORIES
        .iter()
        .find(|(_, extensions)| extensions.contains(&extension.as_str()))
        .map(|(name, _)| *name)
        .unwrap_or("Other")
}

pub struct FileOrganizer {
    history: Vec<Vec<(PathBuf, PathBuf)>>,
    max_history: usize,
}

impl Default for FileOrganizer {
    fn default() -> Self {
        Self {
            history: Vec::new(),
            max_history: 20,
        }
    }
}

impl FileOrganizer {
    pub fn to_folder<I, P>(&mut self, paths: I, folder: impl AsRef<Path>) -> MoveResult
    where
        I: IntoIterator<Item = P>,
        P: AsRef<Path>,
    {
        let folder = folder.as_ref().to_path_buf();
        self.move_paths(paths, |_| folder.clone())
    }

    pub fn by_type<I, P>(&mut self, paths: I, base: impl AsRef<Path>) -> MoveResult
    where
        I: IntoIterator<Item = P>,
        P: AsRef<Path>,
    {
        let base = base.as_ref().to_path_buf();
        self.move_paths(paths, |source| base.join(category_for(source)))
    }

    pub fn tidy(&mut self, folder: impl AsRef<Path>) -> io::Result<MoveResult> {
        let now = SystemTime::now();
        let mut paths = Vec::new();
        for entry in fs::read_dir(folder.as_ref())? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            let path = entry.path();
            if !metadata.is_file() || is_partial_download(&path) {
                continue;
            }
            if now.duration_since(metadata.modified()?).unwrap_or_default()
                <= Duration::from_secs(120)
            {
                continue;
            }
            paths.push(path);
        }
        Ok(self.by_type(paths, folder))
    }

    pub fn undo(&mut self) -> MoveResult {
        let Some(batch) = self.history.pop() else {
            return MoveResult::default();
        };
        let mut restored = MoveResult::default();
        for (source, destination) in batch.into_iter().rev() {
            if !destination.exists() {
                restored.failed += 1;
                continue;
            }
            let target = unique_path(
                source.parent().unwrap_or_else(|| Path::new(".")),
                source.file_name().unwrap_or_default(),
            );
            match move_file(&destination, &target) {
                Ok(()) => restored.moved += 1,
                Err(_) => restored.failed += 1,
            }
        }
        restored
    }

    fn move_paths<I, P, F>(&mut self, paths: I, destination_for: F) -> MoveResult
    where
        I: IntoIterator<Item = P>,
        P: AsRef<Path>,
        F: Fn(&Path) -> PathBuf,
    {
        let mut batch = Vec::new();
        let mut result = MoveResult::default();
        for source in paths.into_iter().map(|path| path.as_ref().to_path_buf()) {
            let destination_dir = destination_for(&source);
            if fs::create_dir_all(&destination_dir).is_err()
                || source.parent().map(Path::to_path_buf) == Some(destination_dir.clone())
            {
                if source.parent().map(Path::to_path_buf) != Some(destination_dir) {
                    result.failed += 1;
                }
                continue;
            }
            let name = source.file_name().unwrap_or_default();
            let destination = unique_path(&destination_dir, name);
            match move_file(&source, &destination) {
                Ok(()) => {
                    batch.push((source, destination));
                    result.moved += 1;
                }
                Err(_) => result.failed += 1,
            }
        }
        if !batch.is_empty() {
            self.history.push(batch);
            if self.history.len() > self.max_history {
                self.history.remove(0);
            }
        }
        result
    }
}

fn is_partial_download(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("crdownload" | "part" | "tmp" | "download")
    )
}

fn unique_path(directory: &Path, name: &std::ffi::OsStr) -> PathBuf {
    let first = directory.join(name);
    if !first.exists() {
        return first;
    }
    let stem = Path::new(name)
        .file_stem()
        .unwrap_or(name)
        .to_string_lossy();
    let extension = Path::new(name)
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_default();
    for index in 1.. {
        let candidate = directory.join(format!("{stem} ({index}){extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

fn move_file(source: &Path, destination: &Path) -> io::Result<()> {
    match fs::rename(source, destination) {
        Ok(()) => Ok(()),
        Err(error) if error.raw_os_error() == Some(18) => {
            fs::copy(source, destination)?;
            fs::remove_file(source)
        }
        Err(error) => Err(error),
    }
}

#[allow(dead_code)]
fn category_map() -> HashMap<&'static str, &'static str> {
    CATEGORIES
        .iter()
        .flat_map(|(category, extensions)| {
            extensions
                .iter()
                .map(move |extension| (*extension, *category))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("nib-files-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn categorizes_known_and_unknown_extensions() {
        assert_eq!(category_for("photo.PNG"), "Images");
        assert_eq!(category_for("archive.zip"), "Archives");
        assert_eq!(category_for("unknown.xyz"), "Other");
    }

    #[test]
    fn moves_with_collision_safe_names_and_undoes() {
        let root = temp_dir("collision");
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(source.join("note.txt"), "first").unwrap();
        fs::write(destination.join("note.txt"), "existing").unwrap();
        let mut organizer = FileOrganizer::default();
        assert_eq!(
            organizer.to_folder([source.join("note.txt")], &destination),
            MoveResult {
                moved: 1,
                failed: 0
            }
        );
        assert!(destination.join("note (1).txt").exists());
        assert_eq!(
            organizer.undo(),
            MoveResult {
                moved: 1,
                failed: 0
            }
        );
        assert!(source.join("note.txt").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn tidy_skips_partial_and_recent_files() {
        let root = temp_dir("tidy");
        fs::write(root.join("ready.jpg"), "image").unwrap();
        fs::write(root.join("partial.tmp"), "partial").unwrap();
        fs::write(root.join("recent.txt"), "recent").unwrap();
        let mut organizer = FileOrganizer::default();
        let result = organizer.tidy(&root).unwrap();
        assert_eq!(result.moved, 0);
        assert!(root.join("ready.jpg").exists());
        assert!(root.join("partial.tmp").exists());
        let _ = fs::remove_dir_all(root);
    }
}
