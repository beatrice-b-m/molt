# Molt

A macOS menu bar application providing a lightweight, always-available scratchpad of Python notebooks. Inspired by Tot's minimal multi-tab design, with executable Python cells per tab backed by isolated kernels.

## Install

Precompiled `.dmg` installers for macOS are available on the [Releases](../../releases) page:

- **Apple Silicon** (M1/M2/M3/M4): `Molt_<version>_aarch64.dmg`
- **Intel**: `Molt_<version>_x86_64.dmg`

Download the `.dmg` for your architecture, open it, and drag Molt to Applications. The only runtime requirement is **Python 3** (`python3` on PATH or configured in `~/.config/molt/config.toml`).

> **macOS Gatekeeper notice:** Release builds are not yet Apple-notarized. On first launch macOS may report the app is "damaged and can't be opened." To fix this, run:
>
> ```bash
> xattr -cr /Applications/Molt.app
> ```
>
> Then open the app normally. This removes the quarantine flag macOS applies to unsigned downloads.

## Development Prerequisites

- **macOS** 10.15+
- **Rust** 1.77+ with `cargo`
- **Bun** (frontend package manager)
- **Python 3** (`python3` on PATH or configured in `~/.config/molt/config.toml`)
- **Tauri CLI**: `cargo install tauri-cli --version "^2"`

## Setup

```bash
# Install frontend dependencies
bun install
```

## Development

```bash
# Run in development mode (hot-reload frontend + Rust rebuild)
bun run dev
# or directly:
cargo tauri dev
```

The app launches as a **menu bar icon** (no Dock icon). Click the tray icon to toggle the notebook panel.

## Production Build

```bash
bun run build:app
```

> **Note:** DMG bundling runs an AppleScript to customize Finder appearance. This hangs in non-GUI environments (e.g. tmux, SSH). The `build:app` script sets `CI=true` to skip that step. The resulting DMG works identically; only the icon layout inside the mounted volume is uncustomized.

## Testing

```bash
# Rust tests (config parsing)
cd src-tauri && cargo test

# Rust lint
cd src-tauri && cargo clippy

# Python kernel server tests
python3 -m pytest tests/python/ -v

# Frontend store tests
bun run test

# TypeScript type check
bun run typecheck

# ESLint
bun run lint
```

## Configuration

On first launch, a config file is created at `~/.config/molt/config.toml`:

```toml
[python]
interpreter = "python3"  # Absolute path or PATH-resolvable name

[app]
auto_launch = false
tab_count = 4
```

If the configured Python interpreter is not found, a warning banner appears in the app.

## Architecture

- **Rust backend** (`src-tauri/`): Tauri v2 app with system tray, window management, and kernel process lifecycle via `tokio`
- **Frontend** (`src/`): React + TypeScript + Zustand + CodeMirror 6 in macOS WKWebView
- **Python kernels** (`src-tauri/resources/kernel_server.py`): Pure stdlib REPL server, one per tab, communicating via newline-delimited JSON on stdin/stdout

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Shift+Enter` | Run cell, advance/create next |
| `Cmd+Enter` | Run cell, keep focus |
| `Cmd+Shift+Enter` | Run all cells in tab |
| `Cmd+1..4` | Switch to tab N |
| `Esc` | Enter command mode |
| `A` (command mode) | Insert cell above |
| `B` (command mode) | Insert cell below |
| `DD` (command mode) | Delete focused cell |

## Project Structure

```
molt/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # App entry
│   │   ├── lib.rs            # Tray, window, vibrancy, shutdown
│   │   ├── kernel.rs         # Kernel subprocess manager
│   │   ├── config.rs         # Config reading/validation
│   │   └── commands.rs       # Tauri IPC command handlers
│   ├── resources/
│   │   └── kernel_server.py  # Python REPL server (stdlib only)
│   └── tauri.conf.json
├── src/
│   ├── App.tsx               # Root layout + global shortcuts
│   ├── components/
│   │   ├── TabBar.tsx         # 4-tab selector
│   │   ├── Toolbar.tsx        # Kernel status, restart/stop/run-all
│   │   ├── Notebook.tsx       # Scrollable cell list
│   │   ├── Cell.tsx           # CodeMirror editor + gutter
│   │   └── CellOutput.tsx     # stdout/stderr/error rendering
│   ├── store/
│   │   └── notebookStore.ts   # Zustand state for 4 notebooks
│   ├── hooks/
│   │   ├── useKernel.ts       # Tauri invoke wrappers
│   │   └── execution.ts       # Cell execution logic
│   └── types/
│       └── notebook.ts        # Shared TypeScript types
└── tests/
    └── python/
        └── test_kernel_server.py
```
