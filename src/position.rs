const PILL_HEIGHT: f64 = 28.0;
const OPEN_HEIGHT: f64 = 340.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    fn right(self) -> f64 {
        self.x + self.width
    }

    fn bottom(self) -> f64 {
        self.y + self.height
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Display {
    pub bounds: Rect,
    pub work_area: Rect,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IslandSize {
    Compact,
    Normal,
    Large,
}

impl Default for IslandSize {
    fn default() -> Self {
        Self::Normal
    }
}

impl IslandSize {
    fn zoom(self) -> f64 {
        match self {
            Self::Compact => 0.88,
            Self::Normal => 1.0,
            Self::Large => 1.15,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IslandStyle {
    Attached,
    Float,
}

impl Default for IslandStyle {
    fn default() -> Self {
        Self::Attached
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Position {
    pub x: f64,
    pub y: f64,
    pub up: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct IslandSettings {
    pub size: IslandSize,
    pub style: IslandStyle,
    pub position: Option<Position>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WindowTarget {
    pub x: i32,
    pub y: i32,
    pub free: bool,
    pub up: bool,
    pub attached: bool,
}

pub struct PositionEngine {
    displays: Vec<Display>,
    primary_display: usize,
    settings: IslandSettings,
    window_width: f64,
    window_height: f64,
}

impl PositionEngine {
    pub fn new(
        displays: Vec<Display>,
        primary_display: usize,
        settings: IslandSettings,
        window_width: f64,
        window_height: f64,
    ) -> Self {
        assert!(!displays.is_empty(), "at least one display is required");
        let display_count = displays.len();
        Self {
            displays,
            primary_display: primary_display.min(display_count - 1),
            settings,
            window_width,
            window_height,
        }
    }

    pub fn set_settings(&mut self, settings: IslandSettings) {
        self.settings = settings;
    }

    pub fn zoom(&self) -> f64 {
        self.settings.size.zoom()
    }

    pub fn target(&self) -> WindowTarget {
        let Some(position) = self.settings.position else {
            let display = self.displays[self.primary_display].bounds;
            return WindowTarget {
                x: round(display.x + display.width / 2.0 - self.window_width / 2.0),
                y: round(display.y),
                free: false,
                up: false,
                attached: false,
            };
        };

        let display = self.nearest_display(position.x, position.y);
        let bounds = display.bounds;
        let work_area = display.work_area;
        let half = 210.0 * self.zoom() + 8.0;
        let x = clamp(position.x, bounds.x + half, bounds.right() - half);
        let up = position.up;
        let y = if up {
            clamp(position.y, work_area.y + 30.0, work_area.bottom())
        } else {
            clamp(position.y, bounds.y, work_area.bottom() - 30.0)
        };
        let attached = !up && y <= bounds.y + 2.0 && self.settings.style != IslandStyle::Float;
        let y = if attached {
            y
        } else if up {
            y + 10.0 - self.window_height
        } else {
            y - 10.0
        };

        WindowTarget {
            x: round(x - self.window_width / 2.0),
            y: round(y),
            free: true,
            up,
            attached,
        }
    }

    pub fn finalize(&self, center_x: f64, top: f64) -> Position {
        let display = self.nearest_display(center_x, top);
        let bounds = display.bounds;
        let work_area = display.work_area;
        let zoom = self.zoom();
        let pill_height = PILL_HEIGHT * zoom;
        let half = 210.0 * zoom + 8.0;
        let mut x = clamp(center_x, bounds.x + half, bounds.right() - half);
        if (x - (bounds.x + bounds.width / 2.0)).abs() < 14.0 {
            x = bounds.x + bounds.width / 2.0;
        }
        let mut y = clamp(top, bounds.y, work_area.bottom() - pill_height - 4.0);
        let below = work_area.bottom() - y;
        let above = y + pill_height - work_area.y;
        if below < OPEN_HEIGHT * zoom + 12.0 && above > below {
            return Position {
                x: x.round(),
                y: (y + pill_height).round(),
                up: true,
            };
        }
        if y < bounds.y + 22.0 {
            y = bounds.y;
        }
        Position {
            x: x.round(),
            y: y.round(),
            up: false,
        }
    }

    pub fn current(&self) -> Position {
        let target = self.target();
        Position {
            x: target.x as f64 + self.window_width / 2.0,
            y: if target.up {
                target.y as f64 + self.window_height - 10.0
            } else if target.attached || !target.free {
                target.y as f64
            } else {
                target.y as f64 + 10.0
            },
            up: target.up,
        }
    }

    fn nearest_display(&self, x: f64, y: f64) -> Display {
        self.displays
            .iter()
            .copied()
            .min_by(|a, b| {
                distance_to_rect(a.bounds, x, y)
                    .partial_cmp(&distance_to_rect(b.bounds, x, y))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap_or(self.displays[self.primary_display])
    }
}

fn distance_to_rect(rect: Rect, x: f64, y: f64) -> f64 {
    let dx = if x < rect.x {
        rect.x - x
    } else if x > rect.right() {
        x - rect.right()
    } else {
        0.0
    };
    let dy = if y < rect.y {
        rect.y - y
    } else if y > rect.bottom() {
        y - rect.bottom()
    } else {
        0.0
    };
    dx * dx + dy * dy
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.min(max.max(min)).max(min)
}

fn round(value: f64) -> i32 {
    value.round() as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn display() -> Display {
        Display {
            bounds: Rect {
                x: 0.0,
                y: 0.0,
                width: 1920.0,
                height: 1080.0,
            },
            work_area: Rect {
                x: 0.0,
                y: 0.0,
                width: 1920.0,
                height: 1040.0,
            },
        }
    }

    fn engine(position: Option<Position>) -> PositionEngine {
        PositionEngine::new(
            vec![display()],
            0,
            IslandSettings {
                position,
                ..Default::default()
            },
            520.0,
            400.0,
        )
    }

    #[test]
    fn defaults_to_centered_primary_display() {
        assert_eq!(
            engine(None).target(),
            WindowTarget {
                x: 700,
                y: 0,
                free: false,
                up: false,
                attached: false
            }
        );
    }

    #[test]
    fn top_position_attaches_when_using_attached_style() {
        let target = engine(Some(Position {
            x: 960.0,
            y: 0.0,
            up: false,
        }))
        .target();
        assert_eq!(
            target,
            WindowTarget {
                x: 700,
                y: 0,
                free: true,
                up: false,
                attached: true
            }
        );
    }

    #[test]
    fn low_position_flips_opening_direction() {
        let position = engine(Some(Position {
            x: 960.0,
            y: 1000.0,
            up: false,
        }))
        .finalize(960.0, 1000.0);
        assert!(position.up);
        assert_eq!(position.y, 1028.0);
    }

    #[test]
    fn compact_size_changes_zoom() {
        let mut e = engine(None);
        e.set_settings(IslandSettings {
            size: IslandSize::Compact,
            ..Default::default()
        });
        assert_eq!(e.zoom(), 0.88);
    }
}
