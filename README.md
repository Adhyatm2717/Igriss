# Igriss

**An AI agent that lives in your MacBook's notch and does your file chores. You see the plan first, approve it, and undo it with one click.**

> **Status:** early development, built for the Product × AI Hackathon (Track A). The safe-tools layer and the action journal with undo are built and tested. The preview/approve flow, the LLM planner and voice input are still in progress. See [Current status](#current-status) for the exact state.

---

## Why Igriss exists

Chatbots can explain how to organize a messy Desktop, but you still do all the clicking. Agents that act on your computer exist, but most people don't trust them: one misread command can move or delete the wrong files, and there is no easy way to see or reverse what happened.

Igriss is built around that trust gap. It turns one sentence into a plan you can read, waits for your approval, runs it with a small set of safe tools, and can reverse any recent command.

**Who it is for:** busy college students on Macs whose Desktop and Downloads fill up with screenshots, PDFs and project files. Anyone on a Mac who does repetitive file chores can use it.

## What it does (target experience)

1. Hover over the notch. A panel grows out of it.
2. Type (or later, speak) a request, for example: *"Put all my screenshots in folders by date."*
3. Igriss shows exactly what it will do, for example *"Move 43 files into 6 folders"*, with shell-style lines you can inspect.
4. You approve. Risky steps (anything that deletes) need extra confirmation.
5. Igriss runs the plan. If you change your mind, **Flashback** undoes any of your last 7 commands.

Deleted files are never removed immediately. They go to a holding folder and are only erased for good once the command can no longer be undone.

## Current status

| Component | Status |
|---|---|
| Notch window: always-visible notch-shaped shell, hover expand, text input | Built |
| Menu-bar tray icon with Open and Quit | Built |
| Safe file tools (`move`, `rename`, `createFolder`, `removeEmptyFolder`, `writeFile`, `delete`, `purge`) with path guard | Built, with adversarial and mutation testing |
| Action journal with undo (last 7 commands) | Built, with adversarial and mutation testing |
| Plan schema, selectors, validator, executor, lifecycle events | In progress |
| Plan preview and approve UI wired to the notch | Planned |
| First end-to-end demo with a fixed task on a dummy folder | Planned |
| LLM planner (natural-language requests) | Planned |
| Flashback scrubber UI | Planned |
| Voice input | Planned |
| Activity timeline | Planned |
| Edge glow while a task runs | Planned |
| Signed, downloadable app and website (`igriss.in`) | Planned |

## How it works

```
 your sentence
      │
      ▼
 ┌──────────┐   structured JSON plan    ┌───────────┐
 │ Planner  │ ────────────────────────▶ │ Validator │
 │ (LLM)    │   (never touches files)   └─────┬─────┘
 └──────────┘                                 │ rejects unknown tools,
                                              │ paths outside allowed folders,
                                              ▼ conflicts
                                        ┌───────────┐
                                        │  Preview  │  you approve (or cancel)
                                        └─────┬─────┘
                                              ▼
                                        ┌───────────┐     ┌───────────┐
                                        │ Executor  │ ──▶ │  Journal  │
                                        │ safe tools│     │ + inverses│
                                        └───────────┘     └─────┬─────┘
                                                                ▼
                                                        Undo (no LLM involved)
```

The key idea: **the LLM only produces a plan. It never touches the file system.** Our own tools execute the plan, and every step records its exact inverse at the moment it runs, so undo is a lookup, not a guess.

## Safety model

These rules are enforced in code and covered by tests:

- **Preview first.** Nothing runs until the user approves the plan.
- **Allowed folders only.** Every path must resolve (including symlinks) to a location inside Desktop, Downloads or Documents. `..`, encoded traversal, null bytes, relative paths and symlink escapes are rejected, and the allowed roots themselves cannot be moved, renamed or deleted.
- **Never overwrite.** Moves, renames and writes throw if the destination already exists.
- **Deletes are recoverable.** `delete` moves the item to `~/.igriss/temp/<id>/` and records its original path. Only the separate `purge` function can erase anything permanently, and it only works inside `~/.igriss/temp`.
- **Inverses are computed in code**, at execution time, and stored as plain data with absolute paths. No wildcards, no model involved.
- **Undo checks before acting.** Before each inverse runs, its preconditions are checked (the source still exists, the destination is free, a written file is unchanged). If a check fails, undo stops and reports a partial undo instead of forcing anything.
- **Atomic, crash-tolerant journal.** The journal is written atomically, and a corrupt journal is backed up and replaced, never fatal.
- **The model sees names, not contents.** Only file names, types, dates and sizes are intended to be sent to a model.

## Tools

| Tool | What it does | Inverse |
|---|---|---|
| `move` | Moves a file or folder | Move it back |
| `rename` | Renames in place | Rename back (case-only renames supported) |
| `createFolder` | Creates a folder (parent must exist) | Remove the empty folder |
| `removeEmptyFolder` | Removes a folder only if it is empty | Recreate the folder |
| `writeFile` | Creates a new file; records a SHA-256 checksum | Recoverable delete; refuses if the file was modified |
| `delete` | Moves to the holding folder | Restore to the original path; fails if that path is occupied |
| `purge` | Permanently erases, only inside `~/.igriss/temp` | None (this is the only irreversible operation) |

Each tool can also render itself as a display-only, shell-style line, for example `mv ~/Desktop/'Screenshot 01.png' ~/Desktop/2026-10-30/'Screenshot 01.png'`. These lines are for the preview and activity views and are never executed.

## Plan format

The planner returns steps in this shape (the schema is being finalized):

```json
{
  "summary": "Sort screenshots into folders by date",
  "steps": [
    { "tool": "createFolder", "args": { "path": "/Users/you/Desktop/2026-10-30" } },
    { "tool": "move", "args": { "from": "/Users/you/Desktop/Screenshot 01.png",
                               "to": "/Users/you/Desktop/2026-10-30/Screenshot 01.png" } }
  ]
}
```

For large jobs the planner will describe files with a **selector** (for example, "screenshots on the Desktop") and our code expands it into explicit steps from a real folder listing. The model never writes long lists of file names.

## Getting started

### Prerequisites

- macOS (developed and tested on a 14-inch MacBook Pro)
- Node.js 22 LTS recommended. Node 26 caused Electron install failures during development.
- Git

### Install and run

```bash
git clone https://github.com/Adhyatm2717/Igriss.git
cd Igriss
npm install
npm run dev
```

The notch shell appears at the top of your screen. Right-click the menu-bar icon for Open and Quit.

If `npm run dev` says `Electron failed to install correctly`, check that `node_modules/electron/path.txt` exists. If not, delete `node_modules`, switch to Node 22 and reinstall.

### Run the tests

```bash
npm test
node scripts/smoke-tools.mjs     # tools: sort, delete, undo, checksum verification
node scripts/smoke-journal.mjs   # journal: executeAndRecord, undo(2)
```

All tests and smoke scripts run inside temporary folders with `HOME` redirected, so they never touch your real files. A test setup file fails the run if the real `~/.igriss` is created or modified.

### macOS permissions

The first time Igriss touches Desktop, Documents or Downloads, macOS asks for permission. Allow it, or the tools will fail with permission errors.

## Project structure

```
Igriss/
├── AGENTS.md                 Architecture and safety rules for coding agents
├── assets/                   Tray icon template images
├── scripts/                  Smoke scripts (sandboxed)
├── src/
│   ├── main/                 Electron main process: windows, hover detection, tray
│   ├── preload/              Safe bridge between main and renderer
│   ├── renderer/             React + Tailwind UI shown inside the notch
│   └── core/
│       ├── notchBounds.cjs   Notch and panel geometry
│       ├── tools/            Safe file tools, path guard, purge, display lines
│       ├── journal/          Action journal and undo
│       └── plan/             Plan schema, validator, executor (in progress)
└── vite.config.js
```

## Testing approach

The tools and journal are the only code that can damage real files, so they get more than unit tests:

- **Adversarial tests:** traversal, symlink escapes and loops, overwrite attempts, moving a folder into itself, hidden files, name collisions, macOS screenshot names with the narrow no-break space, case-only renames, and failures mid-command.
- **Round-trip checks:** after any tool and its inverse, a recursive listing with checksums must match the original sandbox byte for byte.
- **Mutation checks:** for each safety rule, the code is deliberately broken and the test suite must fail. A rule whose break goes unnoticed has no real protection, so a missing test gets added. This found real bugs early on, including encoded-traversal paths slipping through.

## Notch geometry

The always-visible notch shell is drawn to match the hardware notch so it also shows up in screenshots and screen sharing. The constants in `src/core/notchBounds.cjs` were measured on a 14-inch MacBook Pro at its default 1512×982 point resolution. Other models and display scaling modes have different notch sizes and need their own values.

## Roadmap

1. Plan schema, selectors, validator, executor with write-ahead journaling, and lifecycle events
2. Preview and approve UI, then a first end-to-end task on a dummy folder with undo
3. LLM planner behind a single swappable function, tested against a fixed set of prompts to choose the model
4. Clarifying questions, Flashback scrubber, retention rules for the holding folder
5. Voice input, activity timeline, edge glow, packaging, website and download

## Known limitations

- Early-stage software. Run it only on test folders until the end-to-end demo passes.
- The notch constants are calibrated for one MacBook model.
- Unsigned builds trigger macOS Gatekeeper warnings. Signing and notarization need a paid Apple developer account.
- Only file chores inside Desktop, Downloads and Documents are supported. There is no arbitrary shell execution, by design.
- The LLM planner is not integrated yet, so natural-language requests are not understood.

## Contributing

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(tools): ...`, `fix(journal): ...`, `test(...)`, `docs: ...`, `chore: ...`).
- One logical change per commit, with its tests.
- Read `AGENTS.md` before changing anything in `src/core`. Do not add any code path that can delete permanently outside `purge`.
- Never commit secrets. API keys belong in `.env`, which is git-ignored.

## Team

Team **Doritoz**: Harshita Jain, Sunny Kushwaha, Adhyatm Mudgal.

## License

Not yet chosen.