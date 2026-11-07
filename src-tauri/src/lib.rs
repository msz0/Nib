use std::sync::Mutex;

use nib_native_core::{
    FileOrganizer, MoveResult, Settings, SettingsStore,
};
use tauri::{AppHandle, Manager, State};

struct OrganizerState(Mutex<FileOrganizer>);

fn settings_store(app: &AppHandle) -> Result<SettingsStore, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("could not resolve app data directory: {error}"))?
        .join("settings.json");
    Ok(SettingsStore::new(path))
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<Settings, String> {
    settings_store(&app)
        .map_err(|error| error.to_string())?
        .load()
        .map_err(|error| format!("could not load settings: {error}"))
}

#[tauri::command]
fn set_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    settings_store(&app)
        .map_err(|error| error.to_string())?
        .save(&settings)
        .map_err(|error| format!("could not save settings: {error}"))
}

#[tauri::command]
fn organize_files(
    paths: Vec<String>,
    base: String,
    organizer: State<'_, OrganizerState>,
) -> Result<MoveResult, String> {
    let mut organizer = organizer
        .0
        .lock()
        .map_err(|_| "file organizer state is unavailable".to_owned())?;
    Ok(organizer.by_type(paths, base))
}

#[tauri::command]
fn organize_files_to(
    paths: Vec<String>,
    folder: String,
    organizer: State<'_, OrganizerState>,
) -> Result<MoveResult, String> {
    let mut organizer = organizer
        .0
        .lock()
        .map_err(|_| "file organizer state is unavailable".to_owned())?;
    Ok(organizer.to_folder(paths, folder))
}

#[tauri::command]
fn tidy_files(
    folder: String,
    organizer: State<'_, OrganizerState>,
) -> Result<MoveResult, String> {
    let mut organizer = organizer
        .0
        .lock()
        .map_err(|_| "file organizer state is unavailable".to_owned())?;
    organizer
        .tidy(folder)
        .map_err(|error| format!("could not tidy files: {error}"))
}

#[tauri::command]
fn undo_files(organizer: State<'_, OrganizerState>) -> Result<MoveResult, String> {
    let mut organizer = organizer
        .0
        .lock()
        .map_err(|_| "file organizer state is unavailable".to_owned())?;
    Ok(organizer.undo())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OrganizerState(Mutex::new(FileOrganizer::default())))
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            organize_files,
            organize_files_to,
            tidy_files,
            undo_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nib");
}
