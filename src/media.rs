use serde::{Deserialize, Serialize};
use std::{fmt, str::FromStr};

/// The playback state reported by a media session.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum PlaybackStatus {
    Playing,
    Paused,
    Stopped,
}

impl PlaybackStatus {
    /// Normalize a raw SMTC-style status. `Opened` is treated as paused because
    /// it describes an available item without active playback.
    pub fn normalize(raw: &str) -> Result<Self, InvalidPlaybackStatus> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "playing" => Ok(Self::Playing),
            "paused" | "opened" => Ok(Self::Paused),
            "stopped" => Ok(Self::Stopped),
            _ => Err(InvalidPlaybackStatus(raw.trim().to_owned())),
        }
    }
}

impl FromStr for PlaybackStatus {
    type Err = InvalidPlaybackStatus;

    fn from_str(raw: &str) -> Result<Self, Self::Err> {
        Self::normalize(raw)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InvalidPlaybackStatus(String);

impl fmt::Display for InvalidPlaybackStatus {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid playback status: {}", self.0)
    }
}

impl std::error::Error for InvalidPlaybackStatus {}

/// Current track information and its position in seconds.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub position: f64,
    pub duration: f64,
    pub source: String,
}

impl NowPlaying {
    pub fn new(
        title: impl Into<String>,
        artist: impl Into<String>,
        position: f64,
        duration: f64,
        source: impl Into<String>,
    ) -> Self {
        let (position, duration) = validate_timeline(position, duration);
        Self {
            title: title.into(),
            artist: artist.into(),
            position,
            duration,
            source: source.into(),
        }
    }

    pub fn with_timeline(mut self, position: f64, duration: f64) -> Self {
        (self.position, self.duration) = validate_timeline(position, duration);
        self
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum MediaCommand {
    Play,
    Next,
    Previous,
}

/// Sanitize seconds received from a native media API.
///
/// Non-finite and negative values become zero. Position is also capped at the
/// duration, unless the duration is zero.
pub fn validate_timeline(position: f64, duration: f64) -> (f64, f64) {
    let duration = if duration.is_finite() {
        duration.max(0.0)
    } else {
        0.0
    };
    let position = if position.is_finite() {
        position.max(0.0)
    } else {
        0.0
    };
    (
        if duration > 0.0 {
            position.min(duration)
        } else {
            0.0
        },
        duration,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_smtc_statuses() {
        assert_eq!(
            PlaybackStatus::normalize(" Playing "),
            Ok(PlaybackStatus::Playing)
        );
        assert_eq!(
            PlaybackStatus::normalize("PAUSED"),
            Ok(PlaybackStatus::Paused)
        );
        assert_eq!(
            PlaybackStatus::normalize("Opened"),
            Ok(PlaybackStatus::Paused)
        );
        assert_eq!(
            PlaybackStatus::normalize("stopped"),
            Ok(PlaybackStatus::Stopped)
        );
    }

    #[test]
    fn rejects_invalid_statuses() {
        assert!(PlaybackStatus::normalize("Buffering").is_err());
        assert!(PlaybackStatus::normalize("").is_err());
    }

    #[test]
    fn clamps_invalid_timeline_values() {
        assert_eq!(validate_timeline(-2.0, 100.0), (0.0, 100.0));
        assert_eq!(validate_timeline(120.0, 100.0), (100.0, 100.0));
        assert_eq!(validate_timeline(10.0, -1.0), (0.0, 0.0));
        assert_eq!(validate_timeline(f64::NAN, f64::INFINITY), (0.0, 0.0));
    }
}
