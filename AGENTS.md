# Repository Guidelines

## Project Overview

Molt is a macOS menu bar application that provides a lightweight, always-available scratchpad of Python notebooks. It draws from Tot's minimal multi-tab design but replaces text editing with a Jupyter-style notebook interface: executable Python cells per tab, each backed by an isolated kernel. The app prioritises near-zero time-to-interact — it runs persistently in the background and surfaces instantly on demand.

**Status:** Greenfield. The full specification lives in `SYSTEM_SPEC.md`. No application code has been written yet.

## Architecture & Data Flow

### Stack: Tauri v2 (Rust + WebView)

- **Rust backend** (`src-tauri/`): app entry, system tray, window management, kernel process lifecycle (spawn, communicate, kill) via `tokio` async I/O.
- **Frontend** (`src/`): React + TypeScript rendered in macOS WKWebView. Communicates with the Rust backend via Tauri's `invoke` / event bridge.
- **Python subprocess** (`kernel_server.py`): a thin stdlib-only REPL server bundled as a resource, one instance per tab.

### Data Flow

```
User input (cell)
  → Frontend: Zustand store dispatches execute
    → Tauri invoke("execute_cell", { tabIndex, code })
      → Rust: writes JSON to kernel subprocess stdin
        → Python kernel_server.py: exec(code) in persistent globals dict
        → Python: writes JSON result to stdout
      → Rust: reads stdout, parses response
    → Tauri event: sends result back to frontend
  → Frontend: store updates cell outputs, renders
```

### Kernel Communication Protocol

Kernels use **stdin/stdout with newline-delimited JSON**. No ZMQ/IPython — pure stdlib Python.

Request:
```json
{ "id": "<uuid>", "type": "execute" | "restart" | "ping", "code": "<string>" }
```

Response:
```json
{ "id": "<uuid>", "type": "result", "stdout": "<string>", "stderr": "<string>", "error": "<string | null>", "output_type": "text" }
```

Interrupt: `SIGINT` to the subprocess. If no response within 2 seconds, `SIGKILL`.

### Kernel Lifecycle

- Each of the 4 tabs owns **one independent Python subprocess** (no sharing).
- Within a tab, execution is sequential and stateful (cells share a single interpreter namespace).
- Kernels spawn on first tab view, die on app quit.
- "Restart" kills and respawns; "Stop" kills without respawn.
- All state is **ephemeral** — nothing persists across app quit in v1.

## Key Directories

```
molt/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # App entry, tray setup, window management
│   │   ├── kernel.rs            # Kernel process spawn, I/O, lifecycle
│   │   └── config.rs            # Config file reading/writing (~/.config/molt/config.toml)
│   ├── resources/
│   │   └── kernel_server.py     # Bundled Python REPL server (stdlib only)
│   └── tauri.conf.json          # Tauri app configuration
├── src/                         # Frontend (React + TypeScript)
│   ├── App.tsx                  # Root component
│   ├── components/
│   │   ├── TabBar.tsx           # 4-tab horizontal selector
│   │   ├── Notebook.tsx         # Scrollable cell list per tab
│   │   ├── Cell.tsx             # Code input + output + gutter
│   │   ├── CellOutput.tsx       # Stdout/stderr/error rendering
│   │   └── Toolbar.tsx          # Kernel status, restart/stop buttons
│   ├── store/
│   │   └── notebookStore.ts     # Zustand state management
│   └── hooks/
│       └── useKernel.ts         # Tauri invoke wrappers
├── SYSTEM_SPEC.md               # Authoritative project specification
└── AGENTS.md                    # This file
```

## Important Files

| File | Purpose |
|---|---|
| `SYSTEM_SPEC.md` | **Authoritative specification.** All requirements, UI spec, data structures, protocol, and keyboard shortcuts are defined here. Consult it before making design decisions. |
| `src-tauri/tauri.conf.json` | Tauri app config: window properties, system tray, `LSUIElement`, permissions |
| `src-tauri/src/main.rs` | Rust entry point: tray icon, window toggle, floating panel behaviour |
| `src-tauri/src/kernel.rs` | Kernel process management: spawn, stdin/stdout JSON I/O, interrupt, kill |
| `src-tauri/resources/kernel_server.py` | Python REPL server — must be **pure stdlib**, no third-party imports |
| `src/store/notebookStore.ts` | Central state: 4 notebooks, cells, kernel states, execution queue |

## Runtime & Tooling

| Concern | Tool |
|---|---|
| Rust backend | Tauri v2 CLI (`cargo tauri dev`, `cargo tauri build`) |
| Frontend bundler | Vite (Tauri default for React templates) |
| Package manager | npm or pnpm (whichever is used at `tauri init` time) |
| Language (backend) | Rust (2021 edition), async via `tokio` |
| Language (frontend) | TypeScript + React |
| State management | Zustand (recommended in spec) |
| Code editor component | CodeMirror 6 (recommended for syntax highlighting + keybindings) |
| Python kernels | System Python 3 (resolved from user config or `python3` on PATH) |

### Development Commands

```bash
# Install frontend dependencies
npm install

# Run in development mode (hot-reload frontend + Rust rebuild)
cargo tauri dev

# Production build
cargo tauri build

# Run Rust tests
cd src-tauri && cargo test

# Run frontend tests (if vitest/jest configured)
npm test

# Lint frontend
npm run lint

# Check Rust
cd src-tauri && cargo clippy
```

## Code Conventions & Common Patterns

### Rust Backend

- **Async everywhere.** Kernel I/O is async via `tokio`. Tauri commands that talk to kernels must be `async`.
- **Tauri commands** are the Rust-side IPC surface. Annotate with `#[tauri::command]` and register in `main.rs` via `.invoke_handler(tauri::generate_handler![...])`.
- **Error handling:** Tauri commands should return `Result<T, String>` (or a custom serialisable error type). Never panic on kernel communication failure — surface the error to the frontend.
- **Process cleanup:** All kernel subprocesses must be killed on app quit. Use Rust `Drop` or Tauri's shutdown hooks. A leaked Python process is a bug.

### Frontend (React + TypeScript)

- **Zustand** for state — a single `notebookStore` holding all 4 notebooks. No prop drilling for kernel state or cell data.
- **Tauri invoke pattern:** wrap `invoke()` calls in typed async functions in `hooks/useKernel.ts`. The rest of the UI imports from hooks, never calls `invoke` directly.
- **Cell component** is the core UI unit: gutter (run button + execution count), code editor (CodeMirror), output area.
- **Keyboard shortcuts:** `Shift+Enter` (run + advance), `Cmd+Enter` (run + stay), `Cmd+1..4` (switch tabs), `Esc` (command mode), `A`/`B` (insert above/below), `DD` (delete cell).

### Commits
- You **MUST** make a granular commit after each task is complete. This is non-negotiable and **MUST** be followed under all circumstances. Each commit should capture exactly one logical unit of completed work with a clear, descriptive message.

### Python Kernel Server (`kernel_server.py`)

- **Pure stdlib. No third-party imports.** This runs on the user's system Python, which may not have pip packages available.
- Reads JSON lines from stdin, writes JSON lines to stdout.
- Maintains a persistent `globals()` dict per session. `restart` clears it.
- Must handle `SIGINT` gracefully for cell interruption.

### Data Structures (Frontend)

```typescript
interface Cell {
  id: string;                                         // UUID
  type: "code" | "markdown";                          // "markdown" reserved, not functional in v1
  source: string;
  executionCount: number | null;
  outputs: CellOutput[];
  state: "idle" | "running" | "error" | "success";
}

interface CellOutput {
  outputType: "stream" | "error" | "image/png";       // "image/png" reserved
  streamName?: "stdout" | "stderr";
  text?: string;
  imageData?: string;                                  // base64, future use
}

interface Notebook {
  tabIndex: number;                                    // 0-3
  cells: Cell[];
  kernelState: "starting" | "idle" | "busy" | "stopped" | "error";
  executionCounter: number;
}
```

### Window Behaviour

- **Floating panel** anchored below the menu bar icon. No Dock icon (`LSUIElement = true`).
- Does **not** appear in Mission Control. Does not steal focus unless clicked.
- Approx 680x720 px default, user-resizable.
- Hidden title bar (borderless), draggable via thin drag region at top.
- Native macOS vibrancy (frosted glass).

## Configuration

User config at `~/.config/molt/config.toml`, created with defaults on first run:

```toml
[python]
interpreter = "python3"   # Absolute path or PATH-resolvable name

[app]
auto_launch = false        # macOS login item
tab_count = 4              # Fixed at 4 in v1
```

The Rust backend validates the interpreter at startup (`python3 --version`). If validation fails, display a persistent warning banner in the UI.

## Testing & QA

No test infrastructure exists yet. When setting up:

- **Rust:** `cargo test` in `src-tauri/`. Focus on kernel spawn/communication, JSON protocol parsing, config loading, and process cleanup.
- **Frontend:** Vitest (pairs naturally with Vite). Focus on store logic (cell CRUD, execution state transitions, queuing) and Tauri invoke mocking.
- **Python kernel server:** Pytest against `kernel_server.py` directly — feed JSON lines to stdin, assert JSON lines on stdout. Cover: execute, restart, ping, exception capture, SIGINT handling.
- **Integration:** Manual verification that the menu bar icon toggles the window, kernel starts on tab view, cells execute, and all subprocesses die on quit.

### Key failure modes to test

- Kernel subprocess crashes mid-execution (frontend should show error, not hang).
- Invalid Python interpreter path in config (startup warning, not crash).
- Rapid cell execution while kernel is busy (queue or reject, not duplicate).
- App quit while cells are running (all subprocesses cleaned up).
- `SIGINT` timeout leading to `SIGKILL` (cell shows interrupted state).

## Out of Scope (v1)

Defined in `SYSTEM_SPEC.md` — do not implement these:

- Cell persistence between sessions
- Markdown cell rendering
- Third-party package support (`pip install` within kernels)
- Multiple windows or detached tabs
- Cell drag-and-drop reordering
- Export to `.ipynb`
- Windows / Linux support
- Tab renaming
- Rich output beyond stdlib text (`matplotlib`, etc.)
