pub mod error;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod mock;
pub mod session;
pub mod simulator;
#[cfg(target_os = "windows")]
pub mod windows;

pub use error::PasteError;
#[cfg(target_os = "macos")]
pub use macos::MacOsPasteSimulator;
pub use mock::MockPasteSimulator;
pub use session::{PasteMode, SequentialItemPayload, SequentialSessionManager, SequentialStatusDto};
pub use simulator::PasteSimulator;
#[cfg(target_os = "windows")]
pub use windows::WindowsPasteSimulator;

