use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

use crate::position::{IslandSettings as PositionSettings, IslandSize, IslandStyle, Position};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub version: u32,
    pub name: String,
    pub user_name: String,
    pub spotify_id: String,
    pub player: String,
    pub lyric_offset: f64,
    pub widgets: Vec<String>,
    pub widget_order: Vec<String>,
    pub theme: String,
    pub profile: String,
    pub greetings: bool,
    pub apps: Vec<String>,
    pub custom_apps: Vec<CustomApp>,
    pub island: StoredIslandSettings,
    pub sounds: SoundSettings,
    pub discord: DiscordSettings,
    pub game_mode_shortcut: String,
    pub open_shortcut: String,
    pub collapse_shortcut: String,
    pub game_mode_auto: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default)]
pub struct CustomApp {
    pub id: String,
    pub name: String,
    pub target: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct StoredIslandSettings {
    pub size: String,
    pub style: String,
    pub alpha: u8,
    pub open: String,
    pub left: String,
    pub right: String,
    pub eyes: bool,
    pub clock: String,
    pub lyrics: bool,
    pub music: bool,
    pub position: Option<SavedPosition>,
    pub lock: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
pub struct SavedPosition {
    pub x: f64,
    pub y: f64,
    pub up: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct SoundSettings {
    pub enabled: bool,
    pub volume: f64,
    pub done: String,
    pub ask: String,
    pub focus: String,
    pub event: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default)]
pub struct DiscordSettings {
    pub mute: String,
    pub deafen: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 3,
            name: "Nib".into(),
            user_name: String::new(),
            spotify_id: String::new(),
            player: "Spotify".into(),
            lyric_offset: 0.0,
            widgets: [
                "music", "focus", "notes", "clip", "files", "calendar", "apps", "chat", "coffee",
                "claude",
            ]
            .into_iter()
            .map(str::to_owned)
            .collect(),
            widget_order: Vec::new(),
            theme: "dark".into(),
            profile: "normal".into(),
            greetings: true,
            apps: [
                "spotify", "discord", "gcal", "browser", "vscode", "explorer", "calc", "settings",
            ]
            .into_iter()
            .map(str::to_owned)
            .collect(),
            custom_apps: Vec::new(),
            island: StoredIslandSettings::default(),
            sounds: SoundSettings::default(),
            discord: DiscordSettings::default(),
            game_mode_shortcut: "Ctrl+Alt+G".into(),
            open_shortcut: String::new(),
            collapse_shortcut: String::new(),
            game_mode_auto: false,
        }
    }
}

impl Default for StoredIslandSettings {
    fn default() -> Self {
        Self {
            size: "normal".into(),
            style: "attached".into(),
            alpha: 0,
            open: "hover".into(),
            left: "nothing".into(),
            right: "time".into(),
            eyes: true,
            clock: "auto".into(),
            lyrics: true,
            music: true,
            position: None,
            lock: false,
        }
    }
}

impl StoredIslandSettings {
    pub fn position_settings(&self) -> PositionSettings {
        PositionSettings {
            size: match self.size.as_str() {
                "compact" => IslandSize::Compact,
                "large" => IslandSize::Large,
                _ => IslandSize::Normal,
            },
            style: match self.style.as_str() {
                "float" => IslandStyle::Float,
                _ => IslandStyle::Attached,
            },
            position: self.position.as_ref().map(|position| Position {
                x: position.x,
                y: position.y,
                up: position.up,
            }),
        }
    }
}

impl Default for SoundSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            volume: 0.7,
            done: "chime".into(),
            ask: "bell".into(),
            focus: "marimba".into(),
            event: "soft".into(),
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> io::Result<Settings> {
        match fs::read_to_string(&self.path) {
            Ok(contents) => serde_json::from_str(&contents)
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Settings::default()),
            Err(error) => Err(error),
        }
    }

    pub fn save(&self, settings: &Settings) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let contents = serde_json::to_string_pretty(settings)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        let temporary = self.path.with_extension("json.tmp");
        fs::write(&temporary, contents)?;
        fs::rename(temporary, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_current_app_behavior() {
        let settings = Settings::default();
        assert_eq!(settings.version, 3);
        assert!(settings.widgets.iter().any(|widget| widget == "music"));
        assert_eq!(settings.game_mode_shortcut, "Ctrl+Alt+G");
        assert!(settings.sounds.enabled);
    }

    #[test]
    fn settings_round_trip_through_json() {
        let mut settings = Settings::default();
        settings.name = "Test Nib".into();
        settings.island.position = Some(SavedPosition {
            x: 900.0,
            y: 40.0,
            up: false,
        });
        let json = serde_json::to_string(&settings).expect("settings should serialize");
        let restored: Settings = serde_json::from_str(&json).expect("settings should deserialize");
        assert_eq!(restored, settings);
    }

    #[test]
    fn missing_settings_file_uses_defaults() {
        let path =
            std::env::temp_dir().join(format!("nib-settings-{}-missing.json", std::process::id()));
        let _ = fs::remove_file(&path);
        assert_eq!(
            SettingsStore::new(path).load().unwrap(),
            Settings::default()
        );
    }

    #[test]
    fn island_settings_map_to_position_engine_settings() {
        let island = StoredIslandSettings {
            size: "compact".into(),
            style: "float".into(),
            position: Some(SavedPosition {
                x: 400.0,
                y: 80.0,
                up: true,
            }),
            ..Default::default()
        };
        assert_eq!(
            island.position_settings(),
            PositionSettings {
                size: IslandSize::Compact,
                style: IslandStyle::Float,
                position: Some(Position {
                    x: 400.0,
                    y: 80.0,
                    up: true,
                }),
            }
        );
    }
}
