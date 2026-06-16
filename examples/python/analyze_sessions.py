#!/usr/bin/env python3
"""
Example: Python offline session analyzer.

Demonstrates the cross-language path: this script does NOT import any npm
package. It reads `~/.claude/projects/**/*.jsonl` directly, validates each
entry against the JSON Schema shipped with `@claude-code-local/session-store`,
and prints aggregate stats.

Setup:

    pip install jsonschema

Run:

    python3 examples/python/analyze_sessions.py
    # or with a custom config root:
    CLAUDE_CONFIG_DIR=/some/other/.claude python3 examples/python/analyze_sessions.py

What it produces:

    Total sessions: 1284
    Projects:        58
    Total messages:  38742
    Top projects by message count:
      /Users/shadow/Documents/GitHub/cc-haha          4732
      ...
    Earliest session: 2024-09-12T...
    Latest session:   2026-06-16T...
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

try:
    import jsonschema
except ImportError:
    sys.stderr.write(
        "Missing dependency: jsonschema\n"
        "Install with: pip install jsonschema\n"
    )
    sys.exit(2)


CONFIG_ROOT = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude"))
PROJECTS_DIR = CONFIG_ROOT / "projects"

# The schema shipped alongside this example. In a real consumer you would
# install the npm package and read schemas from
# `node_modules/@claude-code-local/session-store/schema/`.
SCHEMA_DIR = Path(__file__).resolve().parent.parent.parent / "schema"


def load_schema(name: str) -> dict:
    path = SCHEMA_DIR / f"{name}.schema.json"
    if name == "index":
        path = SCHEMA_DIR / "index.json"
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def discover_session_files() -> list[Path]:
    """Return every top-level session JSONL under projects/."""
    if not PROJECTS_DIR.is_dir():
        return []
    files: list[Path] = []
    for project_dir in PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        for jsonl in project_dir.glob("*.jsonl"):
            files.append(jsonl)
    return files


def iter_entries(path: Path):
    """Yield (parsed_entry, raw_line) for each non-empty JSONL line."""
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line), line
            except json.JSONDecodeError:
                # Skip malformed lines silently (matches the JS scanner's
                # skip-on-error behaviour).
                continue


def main() -> int:
    raw_entry_schema = load_schema("RawEntry")

    # Compile the validator once and reuse — recompiling per-entry against
    # thousands of entries is the difference between seconds and minutes.
    # `Draft7Validator` is fine for Draft 2020-12 schemas that don't use
    # 2020-only features (none of the RawEntry fields do).
    from jsonschema import Draft7Validator

    validator = Draft7Validator(raw_entry_schema)

    session_files = discover_session_files()
    if not session_files:
        sys.stderr.write(f"No sessions found under {PROJECTS_DIR}\n")
        return 1

    project_msg_counts: dict[str, int] = defaultdict(int)
    project_session_counts: dict[str, int] = defaultdict(int)
    earliest: str | None = None
    latest: str | None = None
    total_messages = 0
    validated = 0
    skipped_invalid = 0

    for session_file in session_files:
        project_label = session_file.parent.name  # sanitized project dir
        project_session_counts[project_label] += 1

        for entry, _raw in iter_entries(session_file):
            # Validate; skip silently on failure (matches JS scanner behavior).
            if validator.is_valid(entry):
                validated += 1
            else:
                skipped_invalid += 1
                continue

            entry_type = entry.get("type")
            message = entry.get("message") or {}
            if entry_type in ("user", "assistant", "system") and message.get("role"):
                total_messages += 1
                project_msg_counts[project_label] += 1

            ts = entry.get("timestamp")
            if ts:
                if earliest is None or ts < earliest:
                    earliest = ts
                if latest is None or ts > latest:
                    latest = ts

    total_sessions = sum(project_session_counts.values())

    print(f"Total sessions:     {total_sessions}")
    print(f"Projects:           {len(project_session_counts)}")
    print(f"Total messages:     {total_messages}")
    print(f"Entries validated:  {validated}")
    if skipped_invalid:
        print(f"Entries skipped:    {skipped_invalid}")
    print(f"Earliest session:   {earliest}")
    print(f"Latest session:     {latest}")
    print()
    print("Top projects by message count:")
    for project, count in sorted(
        project_msg_counts.items(), key=lambda kv: kv[1], reverse=True
    )[:10]:
        print(f"  {count:>7}  {project}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
