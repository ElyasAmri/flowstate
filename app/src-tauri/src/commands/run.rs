//! Run-time side effects for the in-app flow runner.
//!
//! The interpreter that walks an authored flow lives in the frontend
//! (`app/src/lib/flow/run/`); it stays deterministic and testable by delegating
//! the only two impure node kinds to these commands: `run_shell` executes an
//! action node's command, and `run_agent` calls Fanar for an agent node. Both
//! run relative to the project dir so they see the same `.maestro/` config the
//! Compile step writes to.

use std::path::Path;

use serde::{Deserialize, Serialize};

/// Result of running a shell action: the process exit code and combined output.
#[derive(Serialize)]
pub struct ShellResult {
    pub exit: i32,
    pub text: String,
}

/// Run `command` in `dir` using the platform's native shell: PowerShell on
/// Windows (`-NoProfile -ExecutionPolicy Bypass`, mirroring the harness) and
/// `/bin/sh -c` on macOS/Linux. Synchronous: Tauri runs it off the UI thread.
#[tauri::command]
pub fn run_shell(dir: String, command: String) -> Result<ShellResult, String> {
    let mut cmd = if cfg!(windows) {
        let mut c = std::process::Command::new("powershell");
        c.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &command,
        ]);
        c
    } else {
        let mut c = std::process::Command::new("/bin/sh");
        c.args(["-c", &command]);
        c
    };
    let output = cmd
        .current_dir(&dir)
        .output()
        .map_err(|e| e.to_string())?;
    let mut text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let err = String::from_utf8_lossy(&output.stderr);
    if !err.trim().is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(err.trim());
    }
    Ok(ShellResult {
        exit: output.status.code().unwrap_or(-1),
        text,
    })
}

/// One backend entry from `.maestro/backends.json` (only the fields we need).
#[derive(Deserialize)]
struct BackendSpec {
    name: String,
    base_url: String,
    model: String,
    #[serde(default)]
    api_key: Option<String>,
    #[serde(default)]
    api_key_env: Option<String>,
}

/// Find the named backend in `<dir>/.maestro/backends.json`.
fn load_backend(dir: &str, name: &str) -> Result<BackendSpec, String> {
    let path = Path::new(dir).join(".maestro").join("backends.json");
    let raw =
        std::fs::read_to_string(&path).map_err(|e| format!("reading {}: {e}", path.display()))?;
    let specs: Vec<BackendSpec> =
        serde_json::from_str(&raw).map_err(|e| format!("parsing backends.json: {e}"))?;
    specs
        .into_iter()
        .find(|b| b.name == name)
        .ok_or_else(|| format!("no backend named {name:?} in backends.json"))
}

/// Read a `KEY=value` from `<dir>/.env.local` (the harness's secret file). Used
/// as a fallback when the secret isn't already in the process environment.
fn read_env_local(dir: &str, key: &str) -> Option<String> {
    let raw = std::fs::read_to_string(Path::new(dir).join(".env.local")).ok()?;
    for line in raw.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix(key) {
            if let Some(val) = rest.strip_prefix('=') {
                return Some(val.trim().trim_matches('"').to_string());
            }
        }
    }
    None
}

/// Resolve a backend's API key: inline, else env var, else `.env.local`.
fn resolve_key(dir: &str, b: &BackendSpec) -> Result<String, String> {
    if let Some(k) = &b.api_key {
        return Ok(k.clone());
    }
    if let Some(env_name) = &b.api_key_env {
        if let Ok(k) = std::env::var(env_name) {
            return Ok(k);
        }
        if let Some(k) = read_env_local(dir, env_name) {
            return Ok(k);
        }
        return Err(format!("API key {env_name} not set (env or .env.local)"));
    }
    Err("backend has no api_key or api_key_env".into())
}

#[derive(Deserialize)]
struct ChatResp {
    choices: Vec<Choice>,
}
#[derive(Deserialize)]
struct Choice {
    message: ChatMsg,
}
#[derive(Deserialize)]
struct ChatMsg {
    content: Option<String>,
}

/// Run an agent node by calling the `fanar` backend's chat-completions endpoint
/// with `prompt`. Returns the assistant's text. `dir` locates the backend config
/// and secret. This is the only place flowstate talks to Fanar at run time.
#[tauri::command]
pub async fn run_agent(dir: String, prompt: String) -> Result<String, String> {
    let backend = load_backend(&dir, "fanar")?;
    let key = resolve_key(&dir, &backend)?;
    let url = format!(
        "{}/chat/completions",
        backend.base_url.trim_end_matches('/')
    );
    let body = serde_json::json!({
        "model": backend.model,
        "messages": [{ "role": "user", "content": prompt }],
        "max_tokens": 1024,
        "temperature": 0,
    });
    let resp = reqwest::Client::new()
        .post(&url)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Fanar request failed: {e}"))?;
    if !resp.status().is_success() {
        let code = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        return Err(format!("Fanar returned {code}: {detail}"));
    }
    let parsed: ChatResp = resp
        .json()
        .await
        .map_err(|e| format!("decoding Fanar response: {e}"))?;
    parsed
        .choices
        .into_iter()
        .next()
        .and_then(|c| c.message.content)
        .ok_or_else(|| "Fanar response had no content".to_string())
}
