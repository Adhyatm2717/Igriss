# Igriss

Igriss is a Mac notch AI agent. The user types or speaks a request, reviews a plan, approves it, and Igriss runs it. Every command can be undone with Flashback (last 7 commands).

## Stack
Electron + React + Tailwind. Node for the main process.

## Architecture rules
- The LLM only produces a JSON plan. It never touches the file system.
- Our own tools execute the plan. Allowed tools: move, rename, createFolder, removeEmptyFolder, writeFile, delete, find.
- Tool inverses are computed by code at execution time, never by the LLM.
- Rendered shell-style step lines are display-only and must never be executed.
- Every tool returns its own inverse operation.
- Every executed command is appended to an action journal (JSON) with its inverses.
- Flashback undoes a command by running its inverses in reverse order.

## Plan format
{"steps":[{"tool":"move","args":{"from":"...","to":"..."}}]}

## Safety rules (never break these)
- Preview first: nothing runs until the user approves the plan.
- "delete" means move the file or folder to ~/.igriss/temp/<uuid>/ and record its original path.
- "removeEmptyFolder" must fail if the folder contains anything; it moves the empty folder to temp so the action stays reversible.
- Only the purge function may permanently delete, and only inside ~/.igriss/temp.
- Every path must be absolute, concrete, and inside Desktop, Downloads or Documents, except approved temp operations. Reject traversal, glob patterns, symlink escapes, and any other path.
- Validate every plan against a schema before showing it. Reject unknown tools.
- Send the LLM only file names, types, dates and sizes, never file contents.

## Working rules
- One small feature per task. Add tests with each feature.
- Tests may only touch temporary folders, never real user folders.
- Never commit secrets. API keys live in .env.
