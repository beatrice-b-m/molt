# Working in Molt

Molt is an implemented macOS Python scratchpad built with Tauri 2, React,
TypeScript, Zustand, and CodeMirror. It currently opens a desktop window; it has
no tray controller. Each of four tabs owns a stdlib Python subprocess. Cell sources
persist; interpreter state and output do not.

## Start here

- Read `CONTRIBUTING.md` for code ownership, commands, and runtime boundaries.
- Implementation and tests describe current behavior. Do not restore assumptions
  from retired design documents in Git history.
- Public documentation belongs in `beatrice-b-m/molt-docs`. That repository tracks
  a released commit; do not publish checkout behavior as released behavior.
- Keep this file focused on agent instructions, the contributor guide on working
  in this checkout, and the README on users and getting started. Avoid duplicate
  schemas, feature inventories, planning notes, or review reports in the repository.

## Conventions

- Use npm and the committed `package-lock.json`. Use `npm ci` for reproducible installs.
- Put typed Tauri command wrappers in `src/services/backend.ts`; components must not
  call `invoke` directly. Actual React lifecycle hooks belong in `src/hooks/`.
- Keep notebook mutations in the Zustand store. Coordinate asynchronous execution,
  cancellation, and kernel lifecycle in `src/services/execution.ts`.
- Rust kernel commands are async. Return errors to the frontend rather than panicking.
  Preserve per-tab process ownership, sequential execution, and shutdown cleanup.
- The bundled `kernel_server.py` must remain pure Python stdlib. Cell code may import
  packages already available in the selected environment.
- Validate disk data at the boundary. Keep saved sources separate from runtime state;
  use atomic replacement and serialized notebook writes.
- Preserve the existing macOS-only scope. Environment management, rich output,
  notebook import/export, and other feature additions require a task requesting them.
- Use focused regression tests for changed failure paths. Follow the validation and
  manual checks in `CONTRIBUTING.md`; report checks that could not run.

## Commits

Make a granular commit after each completed logical task. Stage only its relevant
files, use a clear descriptive message, and leave completed work committed. Do not
amend or rewrite history without an explicit request. Check `git status --short`
before finishing.
