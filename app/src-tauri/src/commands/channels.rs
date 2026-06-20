//! Filesystem commands backing the channel registry.
//!
//! Channels are first-class: a flow references a channel by id, and channels
//! live in their own LIBRARY at `<dir>/.flowstate/channels/<name>.json`,
//! mirroring the flow library (see `flows.rs`). The frontend authors a
//! `ChannelDefinition` (see `app/src/lib/flow/types.ts`) and exchanges it as
//! JSON; this layer only persists -- the TypeScript types are the schema
//! authority. The binding is a serde-tagged enum so the discriminated union in
//! TypeScript (`{ kind: "ui" } | { kind: "flow"; flowId } | { kind: "service";
//! scope }`) round-trips byte-for-byte.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// What implements the far side of a channel. Tagged by `kind` to match the
/// TypeScript discriminated union exactly.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChannelBinding {
    Ui,
    #[serde(rename_all = "camelCase")]
    Flow {
        flow_id: String,
    },
    Service {
        scope: String,
    },
}

/// A single typed field within a channel message payload.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct ChannelField {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
}

/// One message in a channel's typed contract.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct ChannelMessage {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    pub fields: Vec<ChannelField>,
}

/// A registered channel. Mirrors `ChannelDefinition` in `types.ts`.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct ChannelDefinition {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    /// "inbound" | "outbound" | "both" (free-form here; TS is the authority).
    pub direction: String,
    pub binding: ChannelBinding,
    pub accepts: Vec<ChannelMessage>,
    pub returns: Vec<ChannelMessage>,
}

/// One entry in the on-disk channel library, for the list/picker views.
#[derive(Serialize)]
pub struct ChannelMeta {
    /// Bare file stem == `channels/<id>.json`.
    pub id: String,
    /// The channel's `title` (falls back to the id if the file fails to parse).
    pub title: String,
    /// "ui" | "flow" | "service" (empty if the file fails to parse).
    pub binding_kind: String,
}

/// `<dir>/.flowstate/channels`.
fn channels_dir(dir: &str) -> PathBuf {
    Path::new(dir).join(".flowstate").join("channels")
}

/// Reject any name that could escape the channels directory.
fn safe_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.contains(':')
    {
        return Err(format!(
            "invalid channel name {name:?} (must be a bare file name)"
        ));
    }
    Ok(())
}

/// The binding's discriminant string, for `ChannelMeta`.
fn binding_kind(b: &ChannelBinding) -> &'static str {
    match b {
        ChannelBinding::Ui => "ui",
        ChannelBinding::Flow { .. } => "flow",
        ChannelBinding::Service { .. } => "service",
    }
}

/// List every channel under `<dir>/.flowstate/channels`. A missing directory is
/// not an error -- it yields an empty list (a project may have no channels yet).
#[tauri::command]
pub fn list_channels(dir: String) -> Result<Vec<ChannelMeta>, String> {
    let d = channels_dir(&dir);
    let mut out = Vec::new();
    let rd = match std::fs::read_dir(&d) {
        Ok(r) => r,
        Err(_) => return Ok(out),
    };
    for entry in rd.flatten() {
        let p = entry.path();
        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
        if ext != "json" {
            continue;
        }
        let id = p
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        // Best-effort: a file that doesn't parse still appears (so it can be
        // opened and fixed) with title=id and an empty binding kind.
        let parsed = std::fs::read_to_string(&p)
            .ok()
            .and_then(|raw| serde_json::from_str::<ChannelDefinition>(&raw).ok());
        let (title, kind) = match parsed {
            Some(c) => (c.title, binding_kind(&c.binding).to_string()),
            None => (id.clone(), String::new()),
        };
        out.push(ChannelMeta {
            id,
            title,
            binding_kind: kind,
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

/// Read a channel and return it as a typed `ChannelDefinition`.
#[tauri::command]
pub fn read_channel(dir: String, name: String) -> Result<ChannelDefinition, String> {
    safe_name(&name)?;
    let p = channels_dir(&dir).join(format!("{name}.json"));
    if !p.is_file() {
        return Err(format!("no channel named {name:?}"));
    }
    let raw = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// Serialize a channel to pretty JSON and write atomically (write-temp +
/// rename), with a unique temp name per call so concurrent writes never race.
/// Same shape as `write_flow` (see its docs).
#[tauri::command]
pub fn write_channel(dir: String, name: String, channel: ChannelDefinition) -> Result<(), String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    safe_name(&name)?;
    let json = serde_json::to_string_pretty(&channel).map_err(|e| e.to_string())?;
    let d = channels_dir(&dir);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let path = d.join(format!("{name}.json"));

    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = d.join(format!(
        ".{name}.json.{}-{}-{}.tmp",
        std::process::id(),
        seq,
        nanos
    ));

    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::rename(&tmp, &path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(())
}

/// Delete a channel. A missing file is not an error (idempotent).
#[tauri::command]
pub fn delete_channel(dir: String, name: String) -> Result<(), String> {
    safe_name(&name)?;
    let p = channels_dir(&dir).join(format!("{name}.json"));
    if p.is_file() {
        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A unique temp dir per test, removed on drop.
    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new(tag: &str) -> Self {
            use std::sync::atomic::{AtomicU64, Ordering};
            static COUNTER: AtomicU64 = AtomicU64::new(0);
            let n = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "flowstate-channels-{tag}-{}-{n}",
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).expect("create temp dir");
            TempDir { path }
        }
        fn dir(&self) -> String {
            self.path.display().to_string()
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    /// A channel bound to an external service.
    fn sample_channel() -> ChannelDefinition {
        ChannelDefinition {
            id: "ch-id-registry".into(),
            title: "National ID registry".into(),
            description: Some("External registry".into()),
            direction: "outbound".into(),
            binding: ChannelBinding::Service {
                scope: "external".into(),
            },
            accepts: vec![ChannelMessage {
                name: "lookup".into(),
                description: None,
                fields: vec![ChannelField {
                    name: "national_id".into(),
                    field_type: "string".into(),
                    required: None,
                    description: None,
                }],
            }],
            returns: vec![ChannelMessage {
                name: "result".into(),
                description: None,
                fields: vec![ChannelField {
                    name: "match".into(),
                    field_type: "boolean".into(),
                    required: None,
                    description: None,
                }],
            }],
        }
    }

    #[test]
    fn safe_name_rejects_traversal_and_separators() {
        assert!(safe_name("").is_err());
        assert!(safe_name("../escape").is_err());
        assert!(safe_name("a/b").is_err());
        assert!(safe_name("c:foo").is_err());
        assert!(safe_name("ch-ok").is_ok());
    }

    #[test]
    fn write_then_read_round_trips() {
        let tmp = TempDir::new("roundtrip");
        let ch = sample_channel();
        write_channel(tmp.dir(), ch.id.clone(), ch.clone()).expect("write");
        let back = read_channel(tmp.dir(), ch.id.clone()).expect("read");
        assert_eq!(back, ch, "read should equal what was written");
    }

    #[test]
    fn binding_is_tagged_and_field_type_renamed() {
        let tmp = TempDir::new("shape");
        let ch = sample_channel();
        write_channel(tmp.dir(), ch.id.clone(), ch).expect("write");
        let raw =
            std::fs::read_to_string(channels_dir(&tmp.dir()).join("ch-id-registry.json")).unwrap();
        // Binding is a tagged union: { "kind": "service", "scope": "external" }.
        assert!(raw.contains("\"kind\": \"service\""), "got: {raw}");
        assert!(raw.contains("\"scope\": \"external\""), "got: {raw}");
        // Field type serializes as "type", not "field_type".
        assert!(raw.contains("\"type\": \"string\""), "got: {raw}");
        assert!(!raw.contains("field_type"), "got: {raw}");
    }

    #[test]
    fn ui_and_flow_bindings_round_trip() {
        let tmp = TempDir::new("bindings");
        let mut ui = sample_channel();
        ui.id = "ch-ui".into();
        ui.binding = ChannelBinding::Ui;
        let mut flow = sample_channel();
        flow.id = "ch-flow".into();
        flow.binding = ChannelBinding::Flow {
            flow_id: "flow-other".into(),
        };
        write_channel(tmp.dir(), "ch-ui".into(), ui.clone()).expect("write ui");
        write_channel(tmp.dir(), "ch-flow".into(), flow.clone()).expect("write flow");
        assert_eq!(read_channel(tmp.dir(), "ch-ui".into()).unwrap(), ui);
        assert_eq!(read_channel(tmp.dir(), "ch-flow".into()).unwrap(), flow);

        // The flow binding stores flowId in camelCase on disk.
        let raw = std::fs::read_to_string(channels_dir(&tmp.dir()).join("ch-flow.json")).unwrap();
        assert!(raw.contains("\"flowId\": \"flow-other\""), "got: {raw}");
    }

    #[test]
    fn list_channels_handles_missing_dir_and_reports_metadata() {
        let tmp = TempDir::new("list");
        assert!(list_channels(tmp.dir()).expect("empty").is_empty());

        write_channel(tmp.dir(), "ch-id-registry".into(), sample_channel()).expect("write");
        let metas = list_channels(tmp.dir()).expect("list");
        assert_eq!(metas.len(), 1);
        assert_eq!(metas[0].id, "ch-id-registry");
        assert_eq!(metas[0].title, "National ID registry");
        assert_eq!(metas[0].binding_kind, "service");
    }

    #[test]
    fn delete_removes_channel_and_is_idempotent() {
        let tmp = TempDir::new("delete");
        write_channel(tmp.dir(), "ch-gone".into(), {
            let mut c = sample_channel();
            c.id = "ch-gone".into();
            c
        })
        .expect("write");
        assert!(channels_dir(&tmp.dir()).join("ch-gone.json").is_file());
        delete_channel(tmp.dir(), "ch-gone".into()).expect("delete");
        assert!(!channels_dir(&tmp.dir()).join("ch-gone.json").exists());
        delete_channel(tmp.dir(), "ch-gone".into()).expect("idempotent");
    }
}
