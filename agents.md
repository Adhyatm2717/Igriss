# Igriss

Igriss is a Mac notch AI agent. The user types or speaks a request, reviews a plan, approves it, and Igriss runs it. Every command can be undone with Flashback (last 7 commands).

## Stack
Electron + React + Tailwind. Node for the main process.

## Architecture rules
- The LLM only produces a JSON plan. It never touches the file system.
- Our own tools execute the plan. Allowed tools: move, rename, createFolder, writeFile, delete, find.
- Every tool returns its own inverse operation.
- Every executed command is appended to an action journal (JSON) with its inverses.
- Flashback undoes a command by running its inverses in reverse order.

## Plan format
{"steps":[{"tool":"move","args":{"from":"...","to":"..."}}]}

## Safety rules (never break these)
- Preview first: nothing runs until the user approves the plan.
- "delete" means move the file to ~/.igriss/temp and record its original path. Nothing else may delete.
- Only the purge function may permanently delete, and only inside ~/.igriss/temp.
- Every path must be inside Desktop, Downloads or Documents. Reject any other path.
- Validate every plan against a schema before showing it. Reject unknown tools.
- Send the LLM only file names, types, dates and sizes, never file contents.

## Working rules
- One small feature per task. Add tests with each feature.
- Tests may only touch temporary folders, never real user folders.
- Never commit secrets. API keys live in .env.
