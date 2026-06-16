//! Example: Rust offline session analyzer.
//!
//! Mirrors the Python example — reads `~/.claude/projects/**/*.jsonl`
//! directly, validates each entry against the bundled JSON Schema, and
//! prints aggregate stats.
//!
//! Setup:
//!
//!     # 1. Install Rust: https://rustup.rs/
//!     # 2. From this directory:
//!     cargo run --release
//!
//!     # or with a custom config root:
//!     CLAUDE_CONFIG_DIR=/some/other/.claude cargo run --release

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use jsonschema::JSONSchema;
use serde_json::Value;

const SCHEMA_RELATIVE: &str = "../../schema/RawEntry.schema.json";

fn main() -> ExitCode {
    let config_root = env::var("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = env::var("HOME").expect("HOME not set");
            PathBuf::from(home).join(".claude")
        });
    let projects_dir = config_root.join("projects");

    if !projects_dir.is_dir() {
        eprintln!("No sessions found under {}", projects_dir.display());
        return ExitCode::from(1);
    }

    let schema_path = Path::new(env!("CARGO_MANIFEST_DIR")).join(SCHEMA_RELATIVE);
    let schema_text = match fs::read_to_string(&schema_path) {
        Ok(t) => t,
        Err(err) => {
            eprintln!(
                "Failed to read schema at {}: {}",
                schema_path.display(),
                err
            );
            return ExitCode::from(2);
        }
    };
    let schema_json: Value = match serde_json::from_str(&schema_text) {
        Ok(v) => v,
        Err(err) => {
            eprintln!("Schema is not valid JSON: {}", err);
            return ExitCode::from(2);
        }
    };
    let validator = match JSONSchema::compile(&schema_json) {
        Ok(v) => v,
        Err(err) => {
            eprintln!("Schema compile failed: {}", err);
            return ExitCode::from(2);
        }
    };

    let mut session_count: u64 = 0;
    let mut message_count: u64 = 0;
    let mut validated: u64 = 0;
    let mut skipped_invalid: u64 = 0;
    let mut project_messages: HashMap<String, u64> = HashMap::new();
    let mut project_sessions: HashMap<String, u64> = HashMap::new();
    let mut earliest: Option<String> = None;
    let mut latest: Option<String> = None;

    let entries = match fs::read_dir(&projects_dir) {
        Ok(d) => d,
        Err(err) => {
            eprintln!("Cannot read {}: {}", projects_dir.display(), err);
            return ExitCode::from(1);
        }
    };

    for project_entry in entries.flatten() {
        let project_path = project_entry.path();
        if !project_path.is_dir() {
            continue;
        }
        let project_label = project_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("<unknown>")
            .to_string();

        let files = match fs::read_dir(&project_path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        for file_entry in files.flatten() {
            let file_path = file_entry.path();
            if file_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }

            *project_sessions.entry(project_label.clone()).or_insert(0) += 1;
            session_count += 1;

            let content = match fs::read_to_string(&file_path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let entry: Value = match serde_json::from_str(trimmed) {
                    Ok(v) => v,
                    Err(_) => continue, // skip malformed
                };

                if validator.is_valid(&entry) {
                    validated += 1;
                } else {
                    skipped_invalid += 1;
                    continue;
                }

                let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
                let role = entry
                    .get("message")
                    .and_then(|m| m.get("role"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if matches!(entry_type, "user" | "assistant" | "system") && !role.is_empty() {
                    message_count += 1;
                    *project_messages.entry(project_label.clone()).or_insert(0) += 1;
                }

                if let Some(ts) = entry.get("timestamp").and_then(|v| v.as_str()) {
                    earliest = Some(match &earliest {
                        Some(prev) if prev.as_str() <= ts => prev.clone(),
                        _ => ts.to_string(),
                    });
                    latest = Some(match &latest {
                        Some(prev) if prev.as_str() >= ts => prev.clone(),
                        _ => ts.to_string(),
                    });
                }
            }
        }
    }

    println!("Total sessions:     {}", session_count);
    println!("Projects:           {}", project_sessions.len());
    println!("Total messages:     {}", message_count);
    println!("Entries validated:  {}", validated);
    if skipped_invalid > 0 {
        println!("Entries skipped:    {}", skipped_invalid);
    }
    println!("Earliest session:   {}", earliest.as_deref().unwrap_or("(none)"));
    println!("Latest session:     {}", latest.as_deref().unwrap_or("(none)"));
    println!();
    println!("Top projects by message count:");

    let mut ranked: Vec<_> = project_messages.iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(a.1));
    for (project, count) in ranked.into_iter().take(10) {
        println!("  {:>7}  {}", count, project);
    }

    ExitCode::SUCCESS
}
