//! Filesystem commands backing the visual flow editor.
//!
//! These manage a flow LIBRARY at `<dir>/.flowstate/flows/<name>.json`. The
//! frontend authors a `FlowDefinition` (see `app/src/lib/flow/types.ts`) and
//! exchanges it as JSON; this layer (de)serializes it with serde so editor
//! round-trips are byte-stable. Node positions live INSIDE the definition
//! (`nodes[].position`), so unlike some editors there is no separate layout
//! sidecar -- one file per flow.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// A 2D position on the editor canvas. Mirrors `Position` in `types.ts`.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

/// A single node in the flow graph. Mirrors `FlowNode` in `types.ts`.
/// `kind` and `outcome` are kept as free-form strings here: this layer only
/// persists; the frontend's TypeScript union is the schema authority.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct FlowNode {
    pub id: String,
    pub kind: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    pub position: Position,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub outcome: Option<String>,
}

/// A directed connection between two nodes. Mirrors `FlowEdge` in `types.ts`.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct FlowEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub guard: Option<String>,
}

/// A complete authored flow. Mirrors `FlowDefinition` in `types.ts`.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FlowDefinition {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    pub start_node_id: String,
    pub nodes: Vec<FlowNode>,
    pub edges: Vec<FlowEdge>,
}

/// One entry in the on-disk flow library, for the list view.
#[derive(Serialize)]
pub struct FlowMeta {
    /// Bare file stem == `flows/<id>.json`.
    pub id: String,
    /// The flow's `title` (falls back to the id if the file fails to parse).
    pub title: String,
    /// Number of nodes (0 if the file fails to parse).
    pub node_count: usize,
}

/// Resolve the project directory whose `.flowstate/flows/` the editor manages.
///
/// `FLOWSTATE_PROJECT_DIR` overrides (keeps integration/e2e tests hermetic);
/// otherwise the process cwd is used.
#[tauri::command]
pub fn project_dir() -> Result<String, String> {
    if let Ok(p) = std::env::var("FLOWSTATE_PROJECT_DIR") {
        return Ok(p);
    }
    std::env::current_dir()
        .map(|p| p.display().to_string())
        .map_err(|e| e.to_string())
}

/// `<dir>/.flowstate/flows`.
fn flows_dir(dir: &str) -> PathBuf {
    Path::new(dir).join(".flowstate").join("flows")
}

/// Reject any name that could escape the flows directory.
fn safe_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.contains(':')
    {
        return Err(format!(
            "invalid flow name {name:?} (must be a bare file name)"
        ));
    }
    Ok(())
}

/// List every flow under `<dir>/.flowstate/flows`. A missing directory is not an
/// error -- it just yields an empty list (a project may have no flows yet).
#[tauri::command]
pub fn list_flows(dir: String) -> Result<Vec<FlowMeta>, String> {
    let d = flows_dir(&dir);
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
        // Best-effort: a file that doesn't parse still appears in the list (so
        // the user can open and fix it) with title=id and a count of 0.
        let parsed = std::fs::read_to_string(&p)
            .ok()
            .and_then(|raw| serde_json::from_str::<FlowDefinition>(&raw).ok());
        let (title, node_count) = match parsed {
            Some(f) => (f.title, f.nodes.len()),
            None => (id.clone(), 0),
        };
        out.push(FlowMeta {
            id,
            title,
            node_count,
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

/// Read a flow and return it as a typed `FlowDefinition`.
#[tauri::command]
pub fn read_flow(dir: String, name: String) -> Result<FlowDefinition, String> {
    safe_name(&name)?;
    let p = flows_dir(&dir).join(format!("{name}.json"));
    if !p.is_file() {
        return Err(format!("no flow named {name:?}"));
    }
    let raw = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// Serialize a flow to pretty JSON and write atomically (write-temp + rename) so
/// a crash mid-write can never leave a half-written flow on disk.
#[tauri::command]
pub fn write_flow(dir: String, name: String, flow: FlowDefinition) -> Result<(), String> {
    safe_name(&name)?;
    let json = serde_json::to_string_pretty(&flow).map_err(|e| e.to_string())?;
    let d = flows_dir(&dir);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let path = d.join(format!("{name}.json"));
    let tmp = d.join(format!(".{name}.json.tmp"));
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a flow. A missing file is not an error (idempotent).
#[tauri::command]
pub fn delete_flow(dir: String, name: String) -> Result<(), String> {
    safe_name(&name)?;
    let p = flows_dir(&dir).join(format!("{name}.json"));
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
                "flowstate-flows-{tag}-{}-{n}",
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

    /// A minimal two-node flow.
    fn sample_flow() -> FlowDefinition {
        FlowDefinition {
            id: "demo".into(),
            title: "Demo Flow".into(),
            description: None,
            start_node_id: "a".into(),
            nodes: vec![
                FlowNode {
                    id: "a".into(),
                    kind: "start".into(),
                    label: "Start".into(),
                    description: None,
                    position: Position { x: 0.0, y: 0.0 },
                    outcome: None,
                },
                FlowNode {
                    id: "b".into(),
                    kind: "terminal".into(),
                    label: "End".into(),
                    description: None,
                    position: Position { x: 100.0, y: 0.0 },
                    outcome: Some("approved".into()),
                },
            ],
            edges: vec![FlowEdge {
                id: "e1".into(),
                from: "a".into(),
                to: "b".into(),
                label: None,
                guard: None,
            }],
        }
    }

    #[test]
    fn safe_name_rejects_traversal_and_separators() {
        assert!(safe_name("").is_err());
        assert!(safe_name("..").is_err());
        assert!(safe_name("../escape").is_err());
        assert!(safe_name("a/b").is_err());
        assert!(safe_name("a\\b").is_err());
        assert!(safe_name("c:foo").is_err());
        assert!(safe_name("ok_name").is_ok());
        assert!(safe_name("ok-name-1").is_ok());
    }

    #[test]
    fn write_then_read_round_trips() {
        let tmp = TempDir::new("roundtrip");
        let flow = sample_flow();
        write_flow(tmp.dir(), "demo".into(), flow.clone()).expect("write");
        let on_disk = flows_dir(&tmp.dir()).join("demo.json");
        assert!(on_disk.is_file(), "flow file should exist");
        let back = read_flow(tmp.dir(), "demo".into()).expect("read");
        assert_eq!(back, flow, "read should equal what was written");
    }

    #[test]
    fn write_uses_camel_case_start_node_id() {
        let tmp = TempDir::new("camel");
        write_flow(tmp.dir(), "demo".into(), sample_flow()).expect("write");
        let raw = std::fs::read_to_string(flows_dir(&tmp.dir()).join("demo.json")).unwrap();
        // The on-disk JSON must match the TS shape the frontend sends/reads.
        assert!(raw.contains("\"startNodeId\""), "got: {raw}");
        assert!(!raw.contains("start_node_id"), "got: {raw}");
    }

    #[test]
    fn list_flows_handles_missing_dir_and_reports_metadata() {
        let tmp = TempDir::new("list");
        // No flows dir yet -> empty list, not an error.
        assert!(list_flows(tmp.dir()).expect("list empty").is_empty());

        let mut alpha = sample_flow();
        alpha.id = "alpha".into();
        alpha.title = "Alpha".into();
        let mut beta = sample_flow();
        beta.id = "beta".into();
        beta.title = "Beta".into();
        write_flow(tmp.dir(), "alpha".into(), alpha).expect("write alpha");
        write_flow(tmp.dir(), "beta".into(), beta).expect("write beta");

        let metas = list_flows(tmp.dir()).expect("list");
        assert_eq!(metas.len(), 2);
        // Sorted by id.
        assert_eq!(metas[0].id, "alpha");
        assert_eq!(metas[0].title, "Alpha");
        assert_eq!(metas[0].node_count, 2);
        assert_eq!(metas[1].id, "beta");
    }

    #[test]
    fn delete_removes_flow_and_is_idempotent() {
        let tmp = TempDir::new("delete");
        write_flow(tmp.dir(), "gone".into(), sample_flow()).expect("write");
        assert!(flows_dir(&tmp.dir()).join("gone.json").is_file());

        delete_flow(tmp.dir(), "gone".into()).expect("delete");
        assert!(!flows_dir(&tmp.dir()).join("gone.json").exists());
        // Deleting again is a no-op, not an error.
        delete_flow(tmp.dir(), "gone".into()).expect("idempotent delete");
    }

    #[test]
    fn read_missing_flow_errors() {
        let tmp = TempDir::new("missing");
        let err = read_flow(tmp.dir(), "nope".into()).unwrap_err();
        assert!(err.contains("no flow named"), "got: {err}");
    }

    #[test]
    fn project_dir_honours_env_override() {
        std::env::set_var("FLOWSTATE_PROJECT_DIR", "/tmp/some-sandbox");
        assert_eq!(project_dir().unwrap(), "/tmp/some-sandbox");
        std::env::remove_var("FLOWSTATE_PROJECT_DIR");
    }
}
