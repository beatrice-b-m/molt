# Development

## Setup and checks

Develop on macOS with Xcode Command Line Tools, Node.js 24 (`.nvmrc`), npm,
Rust 1.88+, and Python 3. The Rust minimum reflects the locked dependency graph;
CI also verifies with the stable toolchain.

```bash
npm ci
cargo install tauri-cli --version 2.10.1 --locked
npm run dev
```

`npm run dev:fe` runs the frontend alone, but kernel and settings operations require
Tauri. `npm run build:app` produces the macOS app and DMG; it sets `CI=true` to skip
Finder customization that can hang outside a GUI session.

Run from the repository root:

```bash
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Install Python test dependencies in an isolated environment:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install pytest
.venv/bin/python -m pytest tests/python/ -q
```

## Code ownership

| Area | Files | Responsibility |
| --- | --- | --- |
| App and settings | `src/App.tsx`, `src/pages/Settings.tsx` | Window UI, shortcuts, appearance events |
| Notebook UI | `src/components/` | Cell editor lifecycle, controls, text output |
| Notebook state | `src/store/notebookStore.ts`, `src/types/notebook.ts` | Synchronous mutations and runtime types |
| Desktop API | `src/services/backend.ts` | Typed wrappers for all Tauri commands |
| Execution | `src/services/execution.ts` | Tab reservations, Run All, stale-result cancellation, stop/restart/clear |
| Saved sources | `src/hooks/usePersistence.ts`, `src/services/persistence.ts` | Startup loading, format validation, serialized debounced saves |
| Appearance | `src/styles.css`, `src/theme/` | Fixed palette and CodeMirror styles |
| Native shell | `src-tauri/src/lib.rs`, `commands.rs` | Menus, windows, command registration, shutdown |
| Kernel owner | `src-tauri/src/kernel.rs` | Process ownership, readiness handshake, FIFO protocol I/O, interrupts |
| Python server | `src-tauri/resources/kernel_server.py` | Persistent namespace, expression display, stream/error capture |
| Disk I/O | `src-tauri/src/config.rs`, `persistence.rs`, `storage.rs` | Configuration and atomic file replacement |
| Branding source | `assets/molt-icon-source.svg` | Source artwork; bundled icon files live in `src-tauri/icons/` |

## Runtime boundaries

A UI action reserves a tab in the execution service and calls the typed desktop
API. Rust sends newline-delimited JSON to that tab's Python process and returns
the matching response through the command promise. There is no kernel event bus
or Jupyter dependency. Keep Rust request/response types, frontend types, and Python
handlers aligned when changing the protocol.

Only one frontend execution sequence runs per tab. Duplicate run requests are
ignored while that tab has an operation in progress. Rust queues accepted requests
in FIFO order. Stop, Restart, and Clear invalidate older frontend completions;
Run All stops on errors or cancellation. Changing tabs does not cancel execution.

Kernel startup requires a successful ping within five seconds. Interrupt sends
SIGINT, then kills the owned process after two seconds only if the same execution
is still busy. Stop retains a sentinel so viewing the tab cannot respawn it;
Restart explicitly creates a fresh process. The app shuts down kernels on exit.

`dirs::config_dir()` resolves to `~/Library/Application Support` on macOS.
`molt/config.toml` stores configuration; `molt/notebooks.json` stores the versioned
source snapshot. The persisted schema is defined and validated in
`src/services/persistence.ts`. Never persist outputs, counters, or live kernel state.
Invalid notebook files must not be silently overwritten with empty defaults.

## Manual validation and current constraints

For changes involving native windows or lifecycle, verify both development and
packaged builds: launch, edit cells, switch tabs, interrupt a long computation,
stop/restart/clear, change settings, close windows, quit, and inspect child-process
cleanup. Unit tests do not verify WKWebView, Finder launching, or signing.

Known boundaries to consider when extending the app:

- Native Quit does not await debounced frontend saves. The unmount flush is best
  effort; a reliable close/quit handshake remains needed.
- Kernel cleanup owns direct Python children, not arbitrary descendant processes.
  Native writes to stdout can invalidate the JSON protocol; output is unbounded.
- Interpreter selection is read at app startup. Paths from Finder may differ from
  a shell PATH. Invalid TOML uses logged defaults; interpreter validation is synchronous.
- `auto_launch` and `tab_count` remain compatibility fields, not implemented options.
  The settings form exposes neither. There is no live theme loader.
- `Info.plist` still declares `LSUIElement` despite the desktop window design. There
  is no main-window reopen action or tray controller. Window lifecycle needs a
  deliberate product decision before distribution.
- macOS 10.15 is the configured deployment floor, not a tested compatibility promise.
  Native compatibility, code signing, and notarization need release validation.

## Documentation and releases

Keep public guides and reference material in [molt-docs](https://github.com/beatrice-b-m/molt-docs).
That repository's `docs-source.json` identifies its released source. Coordinate a
separate documentation synchronization when releasing behavior or IPC changes.
Retired specifications and design notes remain available in Git history.

The release workflow builds both macOS architectures when a GitHub release is
published. It sets the embedded bundle version from the release tag and uploads
one DMG per architecture. Local package versions remain development defaults.
Do not publish or upload releases as part of routine validation.

Application source is licensed under MIT. The Molt name, logo, icon, and other
project marks are excluded from that grant; see `LICENSE`.
