//! Commands invokable from the frontend via `invoke("name", ...)`.

/// Channel-registry filesystem commands (the first-class channel concept).
pub mod channels;
/// Flow-library filesystem commands for the visual flow editor.
pub mod flows;
