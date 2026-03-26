# Molt

A macOS desktop application for quick Python computation. Four independent notebook tabs, each backed by an isolated Python kernel, with full syntax highlighting and customizable themes.

## Install

Precompiled `.dmg` installers for macOS are available on the [Releases](../../releases) page:

- **Apple Silicon** (M1/M2/M3/M4): `Molt_<version>_aarch64.dmg`
- **Intel**: `Molt_<version>_x86_64.dmg`

Download the `.dmg` for your architecture, open it, and drag Molt to Applications. The only runtime requirement is **Python 3** (`python3` on PATH or configured in Settings).

> **macOS Gatekeeper notice:** Release builds are not yet Apple-notarized. On first launch macOS may report the app is "damaged and can't be opened." To fix this, run:
>
> ```bash
> xattr -cr /Applications/Molt.app
> ```
>
> Then open the app normally.

## Features

- **4 independent notebook tabs** with isolated Python kernels (no shared state between tabs)
- **Jupyter-style execution** -- Shift+Enter runs a cell and advances, last expression auto-displays
- **Syntax highlighting** via CodeMirror 6 with full Python token coverage
- **Customizable themes** -- JSON theme files in `~/.config/molt/themes/`; ships with GitHub Dark and GitHub Light
- **Settings window** (File > Settings) for theme selection, Python interpreter path, and launch-at-login
- **Native macOS integration** -- vibrancy effect, standard Edit menu shortcuts, menu bar

## Keyboard Shortcuts

| Shortcut            | Action                        |
| ------------------- | ----------------------------- |
| `Shift+Enter`       | Run cell, advance/create next |
| `Cmd+Enter`         | Run cell, keep focus          |
| `Cmd+Shift+Enter`   | Run all cells in tab          |
| `Cmd+1..4`          | Switch to tab N               |
| `Esc`               | Enter command mode            |
| `A` (command mode)  | Insert cell above             |
| `B` (command mode)  | Insert cell below             |
| `DD` (command mode) | Delete focused cell           |

## Configuration

Settings are accessible from File > Settings, or by editing `~/.config/molt/config.toml` directly:

```toml
[python]
interpreter = "python3"    # Absolute path or PATH-resolvable name

[app]
auto_launch = false         # Start Molt at macOS login
tab_count = 4               # Fixed at 4
theme = "github-dark"       # Theme filename (without .json) from ~/.config/molt/themes/
```

If the configured Python interpreter is not found, a warning banner appears in the app.

### Themes

Theme JSON files live in `~/.config/molt/themes/`. Two defaults are bundled and copied there on first launch. Each theme controls UI chrome, editor colors, syntax highlighting, cell output styling, and fonts. See the bundled themes for the schema.

## Development

### Prerequisites

- **macOS** 10.15+
- **Rust** 1.77+ with `cargo`
- **Bun** (frontend package manager)
- **Python 3** on PATH
- **Tauri CLI**: `cargo install tauri-cli --version "^2"`

### Setup

```bash
bun install
```

### Run

```bash
bun run dev
# or directly:
cargo tauri dev
```

### Production Build

```bash
bun run build:app
```

> **Note:** DMG bundling runs an AppleScript to customize Finder appearance. This hangs in non-GUI environments (e.g. tmux, SSH). The `build:app` script sets `CI=true` to skip that step.

### Testing

```bash
# Rust tests
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

## Architecture

- **Rust backend** (`src-tauri/`): Tauri v2 app with native menu bar, multi-window management, and kernel process lifecycle via `tokio`
- **Frontend** (`src/`): React + TypeScript + Zustand + CodeMirror 6 in macOS WKWebView
- **Python kernels** (`src-tauri/resources/kernel_server.py`): Pure stdlib REPL server, one per tab, communicating via newline-delimited JSON on stdin/stdout

### Project Structure

```
molt/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # App entry
│   │   ├── lib.rs            # Menu, windows, vibrancy, shutdown
│   │   ├── kernel.rs         # Kernel subprocess manager
│   │   ├── config.rs         # Config read/write/validation
│   │   ├── commands.rs       # Tauri IPC command handlers
│   │   └── theme.rs          # Theme file I/O
│   ├── resources/
│   │   ├── kernel_server.py  # Python REPL server (stdlib only)
│   │   └── themes/           # Bundled default theme JSON files
│   └── tauri.conf.json
├── src/
│   ├── App.tsx               # Main window root + global shortcuts
│   ├── main.tsx              # Main window React entry
│   ├── settings-main.tsx     # Settings window React entry
│   ├── pages/
│   │   └── Settings.tsx      # Settings window UI
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
│   ├── theme/
│   │   ├── store.ts           # Theme Zustand store
│   │   ├── load.ts            # Tauri invoke wrappers for themes
│   │   ├── css.ts             # Applies theme to CSS custom properties
│   │   └── codemirror.ts      # Builds CodeMirror theme + syntax highlighting
│   └── types/
│       ├── notebook.ts        # Notebook/cell types
│       └── theme.ts           # Theme JSON schema types
├── settings.html              # Settings window HTML entry
├── index.html                 # Main window HTML entry
└── tests/
    └── python/
        └── test_kernel_server.py
```
