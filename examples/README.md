# Examples

Each example is self-contained and demonstrates one of the three intended
consumers documented in the top-level `README.md`.

```
examples/
├── typescript/                            # ← JS / TS consumers
│   ├── web-browser.ts                     # minimal HTTP session browser
│   └── dump-all-sessions.ts               # bulk export to JSON archive
├── python/
│   └── analyze_sessions.py                # offline analyzer (jsonschema)
└── rust/
    ├── Cargo.toml
    └── src/main.rs                        # offline analyzer (jsonschema crate)
```

All examples read `~/.claude/projects/**/*.jsonl` directly — no server, no
ProviderService, no modelCost. Cross-language consumers depend on the JSON
Schema files in `../schema/` (which ship with the npm package) for validation
and on documented on-disk conventions for parsing.

## TypeScript / Bun

```bash
# HTTP session browser
bun run examples/typescript/web-browser.ts
curl http://localhost:3000/sessions
curl http://localhost:3000/sessions/<uuid>

# Bulk export
bun run examples/typescript/dump-all-sessions.ts
ls exports/sessions-*/
```

These import the package via its package name (`@claude-code-local/session-store`),
so they expect the package to be installed (`bun install` in the package root
or `npm link`). They run with **Bun**; the handler in `web-browser.ts` uses
Bun's built-in `Bun.serve` but the same logic transplants to Node, Deno,
Express, Hono, etc.

## Python

```bash
pip install jsonschema
python3 examples/python/analyze_sessions.py
```

The script walks the project tree manually and validates every line against
`schema/RawEntry.schema.json`. Useful as a starting point for notebooks,
pandas pipelines, or any non-JS analytics tooling.

## Rust

```bash
cd examples/rust
cargo run --release
```

Uses the `jsonschema` crate to validate each line. Cargo.toml is intentionally
minimal — copy it into your project and add `serde`, `walkdir`, `rayon`, etc.
as your analysis grows.

## Conventions

All examples assume:

- Config root is `$CLAUDE_CONFIG_DIR` or `~/.claude`.
- Project files live under `<config-root>/projects/<sanitized>/<sessionId>.jsonl`.
- Subagent transcripts (when needed) live under
  `<config-root>/projects/<sanitized>/<sessionId>/subagents/agent-<id>.jsonl`.

Sanitized paths use the same rules as the JS package: every non-alphanumeric
character becomes a single hyphen (e.g. `/Users/foo` → `-Users-foo`). On
Windows, drive letters double (`C:` → `C-`).

## Adding your own

If you build something with this package and want it listed here, open a PR.
The bar is low: a single self-contained file, a one-line description, and at
least one runnable command in the file's header comment.
