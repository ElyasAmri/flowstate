//! Commands invokable from the frontend via `invoke("name", ...)`.

/// Channel-registry filesystem commands (the first-class channel concept).
pub mod channels;
/// Flow-library filesystem commands for the visual flow editor.
pub mod flows;
/// Run-time side effects (shell + Fanar) for the in-app flow runner.
pub mod run;
