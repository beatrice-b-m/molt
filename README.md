# Molt

A small macOS scratchpad for Python computation. Four notebook tabs each have their own Python process, so variables and imports stay separate. Run cells with CodeMirror syntax highlighting and see text output or the value of the last expression.

Cell sources and their order are saved locally. Outputs, variables, and execution counts start fresh when you relaunch the app.

[Documentation](https://molt-docs.beatricebm.workers.dev) · [Releases](https://github.com/beatrice-b-m/molt/releases) · [Development guide](CONTRIBUTING.md)

## Getting started

Download the `.dmg` for Apple Silicon (`aarch64`) or Intel (`x86_64`) from Releases and drag Molt into Applications. Release builds are not currently notarized; see the documentation's installation and troubleshooting instructions.

Molt uses an existing Python 3 installation. In **File → Settings**, choose an absolute interpreter path (including a virtual environment's Python), save, and relaunch Molt. Packages already installed in that environment can be imported; Molt does not install packages or manage environments.

Python runs with your user account's permissions. Use trusted code. Molt supports text output, not IPython magics, interactive `input()`, or rich notebook output.

## Working with cells

- `Shift+Enter` runs a cell and advances to the next one, creating it if needed.
- `Cmd+Enter` runs a cell and keeps focus there.
- `Cmd+Shift+Enter` runs all cells in order; `Cmd+1…4` switches tabs.
- `Esc` enters command mode; `A`/`B` inserts above/below and `DD` deletes the selected cell.
- **Restart** clears the Python namespace and execution results. **Stop** requires a restart before further execution. **Clear** stops the kernel and removes the tab's cells.

Configuration and saved notebooks are stored in `~/Library/Application Support/molt/`. Autosave is debounced; avoid quitting immediately after typing. Appearance uses a fixed light palette with an optional native glass effect.

This README describes the current source checkout. The documentation website tracks a specific release, so unreleased fixes may differ.

## Develop

Use macOS, Node.js 24 (see `.nvmrc`), Rust 1.88 or later, Python 3, and Xcode Command Line Tools.

```bash
npm ci
cargo install tauri-cli --version 2.10.1 --locked
npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, validation, and release commands.

## License

Application source is available under the [MIT License](LICENSE). The Molt name,
logo, icon, and other project marks are excluded from that grant.
