# SYSTEM_SPEC.md — Molt

## Overview

Molt is a macOS menu bar application providing a lightweight, always-available scratchpad of Python notebooks. It is inspired by Tot's minimal multi-tab design but replaces text editing with a Jupyter-style notebook interface: a sequence of executable Python cells per tab, each backed by an isolated kernel. The app prioritises near-zero time-to-interact: it runs persistently in the background and surfaces instantly on demand.

---

## Technology Stack

### Recommended Architecture: Tauri v2 (Rust + WebView)

Tauri is the recommended stack for the following reasons:

- **Native macOS menu bar support** via `tauri-plugin-positioner` and the `SystemTray` API — the window can be anchored to the tray icon and toggled with zero startup cost.
- **Rust backend** handles kernel process lifecycle (spawn, communicate, kill) using `tokio` for async I/O, keeping the UI thread unblocked.
- **WebView frontend** (WKWebView on macOS) renders the notebook UI with full CSS/JS flexibility and a small binary footprint — no Chromium bundled.
- **Small binary and fast cold-start** compared to Electron; the app can be kept alive in the background with negligible memory overhead.
- The frontend can be written in **React + TypeScript** (or plain TS if preferred), communicating with the Rust backend via Tauri's `invoke` / event bridge.

Alternative considered: a pure Rust TUI was rejected because rich cell output (images, formatted text) is significantly harder to render. A local-server approach was rejected because it requires a browser to be open.

---

## Application Lifecycle

- The app launches as a **macOS menu bar item** (no Dock icon by default; `LSUIElement = true` in `Info.plist`).
- On first launch, the main window is hidden. Clicking the menu bar icon **toggles** the window open/closed.
- The window is a **floating panel** anchored below the menu bar icon, similar to Tot or Fantastical.
- The window does **not** appear in Mission Control / Exposé and does not take focus from other apps unless clicked.
- On macOS login, the app should optionally auto-launch (configurable in settings).
- **All state is ephemeral.** Cell content, outputs, and kernel state are discarded on quit. No persistence layer is required in v1.

---

## Python Kernel Management

### Kernel Model

- Each tab maintains **one independent Python subprocess** acting as its kernel.
- Kernels are spawned using the Python interpreter resolved at startup (see Configuration).
- Kernels are **not shared** between tabs. Variables, imports, and side-effects in one tab are completely invisible to others.
- Within a tab, execution is **sequential and stateful**: cells share a single interpreter namespace, and variables defined in one cell are accessible in later cells (standard notebook semantics).

### Kernel Communication Protocol

Rather than implementing the full Jupyter kernel protocol (ZMQ/IPython), a simpler custom protocol is used to minimise dependencies:

- The Rust backend spawns a Python subprocess running a **thin REPL server** script bundled with the app.
- Communication uses **stdin/stdout with newline-delimited JSON messages**.
- The bundled server script (`kernel_server.py`) is written in pure stdlib Python and handles:
    - Receiving an `execute` message containing a code string.
    - Running the code in a persistent `exec` context (shared `globals()` dict).
    - Capturing `stdout`, `stderr`, and any unhandled exceptions.
    - Sending back a result message with `stdout`, `stderr`, `error` (if any), and `output_type`.
    - Responding to an `interrupt` signal (SIGINT to the subprocess).
    - Responding to a `restart` command by resetting the globals dict and clearing captured state.

Message schema (JSON, newline-terminated):

```
// Request
{ "id": "<uuid>", "type": "execute" | "restart" | "ping", "code": "<string>" }

// Response
{ "id": "<uuid>", "type": "result", "stdout": "<string>", "stderr": "<string>", "error": "<string | null>", "output_type": "text" }
```

### Rich Output (stdlib only)

Since only the standard library is required, rich output support is limited to:

- **Plain text** (`print`, expression reprs) — rendered as monospace text in the output area.
- **`pprint` output** — same treatment.
- **`turtle` / `tkinter`** — explicitly out of scope; these open their own windows and cannot be captured.
- Future: if `matplotlib` is ever added, the output area should support PNG image display via base64-encoded data URIs. A placeholder `output_type: "image/png"` value is reserved in the message schema for this purpose.

### Kernel Lifecycle

| Event                                         | Behaviour                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Tab first shown                               | Kernel subprocess is spawned                                                             |
| "Restart kernel" clicked                      | Current subprocess is killed; new one spawned; all cell outputs cleared                  |
| "Stop kernel" clicked                         | Subprocess is killed; kernel shown as stopped; cells become non-executable until restart |
| Cell execution requested while kernel stopped | Show inline error: "Kernel is not running. Restart to continue."                         |
| App quit                                      | All subprocesses are killed via Rust drop/cleanup                                        |
| Cell running; user clicks Stop button         | SIGINT sent to subprocess; if no response within 2s, SIGKILL                             |

---

## Configuration

A TOML config file is read at startup from `~/.config/molt/config.toml` (created with defaults on first run).

```toml
[python]
# Path to the Python interpreter to use for all kernels.
# Supports absolute paths or names resolvable on PATH.
# Default: "python3"
interpreter = "python3"

[app]
# Launch PyPad automatically at macOS login.
auto_launch = false

# Number of tabs. Currently fixed at 4; reserved for future use.
tab_count = 4
```

The Rust backend resolves and validates the interpreter path at startup. If the interpreter cannot be found or fails a `python3 --version` smoke test, the app should display a persistent warning banner in the window with the path that failed and instructions to update the config.

---

## UI Specification

### Window

- **Size:** approximately 680 × 720 px default; user-resizable.
- **Vibrancy / appearance:** native macOS `.hudWindow` or `.popover` material (frosted glass effect) to match the menu bar panel aesthetic.
- **Title bar:** hidden (borderless); draggable via a thin drag region at the top.

### Tab Bar

- Four tabs, displayed as a horizontal row at the top of the window.
- Tabs are labelled **1, 2, 3, 4** (single character, like Tot).
- Active tab is visually distinguished (e.g. accent underline or filled chip).
- Each tab is independent — switching tabs does not affect kernel state of the other tabs.

### Per-Tab Toolbar

Displayed below the tab bar for the active tab:

- **Kernel status indicator:** small coloured dot — green (idle), yellow (busy), red (stopped/error).
- **Restart kernel** button: circular arrow icon. Prompts for confirmation if a cell is currently running. Clears all outputs on confirm.
- **Stop kernel** button: square stop icon. Kills the kernel without clearing cell content.
- Tab-level keyboard shortcut: `Cmd+Shift+Enter` runs all cells in order from top to bottom.

### Notebook Area

Scrollable vertical list of cells below the toolbar.

#### Cell Component

Each cell consists of:

1. **Gutter / run button** (left side, vertically centred to the input area):
    - Default state: a "run" triangle icon (▶).
    - While cell is executing: transitions to a spinner/stop icon (■ or animated ring). Clicking it sends an interrupt to the kernel.
    - Disabled state (kernel stopped): greyed out triangle.

2. **Code input area:**
    - Monospace font, syntax-highlighted (Python).
    - Auto-expanding height (no vertical scroll within a cell; the cell grows).
    - `Shift+Enter`: execute this cell (and optionally advance focus to next cell or create a new one — see Execution Behaviour).
    - `Cmd+Enter`: execute this cell, keep focus here.
    - Tab key inserts 4 spaces (no tab completion required in v1).

3. **Output area** (below input, shown only when output exists or cell has been run):
    - Monospace text for stdout.
    - Stderr rendered in a muted red/amber colour.
    - Exception tracebacks rendered in red with the error type bolded.
    - A thin separator line between input and output.
    - Output is cleared when the cell is re-executed.

4. **Cell controls** (appear on hover, top-right of cell):
    - **Delete cell** (trash icon).
    - **Move up / move down** arrows.
    - **Cell type indicator** (reserved for future use — currently always `code`).

#### Adding Cells

- A faint **"+ Add cell"** button appears below the last cell and between cells on hover.
- Keyboard shortcut: when focused on the last cell's input, pressing `Shift+Enter` after execution creates and focuses a new cell below.

#### Execution Behaviour

- Cells execute **one at a time per tab**. If a cell is already running and another run is requested, the request is queued (or rejected with a tooltip "Kernel busy").
- Execution is non-blocking in the UI — the user can edit other cells or switch tabs while a cell runs.
- Each cell displays an **execution count** (e.g. `[3]`) in the gutter after it has been run, matching standard Jupyter convention.

---

## Data Structures

### Cell

```typescript
interface Cell {
	id: string; // UUID
	type: "code" | "markdown"; // "markdown" is reserved; not functional in v1
	source: string; // Raw source text
	executionCount: number | null;
	outputs: CellOutput[];
	state: "idle" | "running" | "error" | "success";
}
```

### CellOutput

```typescript
interface CellOutput {
	outputType: "stream" | "error" | "image/png"; // "image/png" reserved
	streamName?: "stdout" | "stderr"; // for outputType "stream"
	text?: string;
	imageData?: string; // base64, for future use
}
```

### Notebook (per tab)

```typescript
interface Notebook {
	tabIndex: number; // 0–3
	cells: Cell[];
	kernelState: "starting" | "idle" | "busy" | "stopped" | "error";
	executionCounter: number;
}
```

---

## Keyboard Shortcuts (Summary)

| Shortcut            | Action                                        |
| ------------------- | --------------------------------------------- |
| `Shift+Enter`       | Run focused cell; advance or create next cell |
| `Cmd+Enter`         | Run focused cell; keep focus                  |
| `Cmd+Shift+Enter`   | Run all cells in current tab (top to bottom)  |
| `Cmd+1..4`          | Switch to tab N                               |
| `Esc`               | Blur cell input (enter "command mode")        |
| `A` (command mode)  | Insert cell above focused cell                |
| `B` (command mode)  | Insert cell below focused cell                |
| `DD` (command mode) | Delete focused cell                           |

---

## Project Structure (Suggested)

```
molt/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # App entry, tray setup, window management
│   │   ├── kernel.rs         # Kernel process spawn, I/O, lifecycle
│   │   └── config.rs         # Config file reading/writing
│   ├── resources/
│   │   └── kernel_server.py  # Bundled Python REPL server (stdlib only)
│   └── tauri.conf.json
├── src/                      # Frontend (React + TypeScript)
│   ├── App.tsx
│   ├── components/
│   │   ├── TabBar.tsx
│   │   ├── Notebook.tsx
│   │   ├── Cell.tsx
│   │   ├── CellOutput.tsx
│   │   └── Toolbar.tsx
│   ├── store/                # State management (Zustand recommended)
│   │   └── notebookStore.ts
│   └── hooks/
│       └── useKernel.ts      # Tauri invoke wrappers
├── ~/.config/molt/
│   └── config.toml           # User config (created on first run)
└── SYSTEM_SPEC.md
```

---

## Out of Scope (v1)

- Cell persistence between sessions.
- Markdown cell rendering (data structure reserved; toggle UI not implemented).
- Third-party package support (`pip install` within kernels).
- Multiple windows or detached tabs.
- Cell drag-and-drop reordering.
- Export to `.ipynb` format.
- Windows / Linux support.
- Tab renaming.
- `matplotlib` or other rich output beyond stdlib text.
