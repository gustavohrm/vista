# Agent instructions

Vista is a user-facing application for managing notes and personal data directly on local folders (web and native desktop/mobile). Its target audience is normal end users, not external developers. It uses a pnpm monorepo workspace to organize shared application UI (`packages/app`) and platform hosts (`apps/web`, `apps/native`), but it is not a library or package-publishing repository.

This repository is docs-first. [`docs/README.md`](docs/README.md) indexes every document; start with [`docs/architecture.md`](docs/architecture.md). [`CONTRIBUTING.md`](CONTRIBUTING.md) is the workflow every change follows, and [`docs/tooling.md`](docs/tooling.md) lists the commands. Run `pnpm verify` before delivering a change.

## Priority

Follow instructions in this order:

1. User request.
2. `AGENTS.md` and `CLAUDE.md`, including scoped `AGENTS.md` files.
3. APPROVED or IMPLEMENTED documents in `docs/`.
4. Existing code.

If APPROVED or IMPLEMENTED docs conflict with code, treat code as legacy unless the doc is clearly outdated.

## Working agreement

- Use the task's scope and your judgment to choose which documentation and code to inspect. Applicable contributor rules, coding standards, and specifications remain binding; reading less does not waive them.
- Ask when different interpretations would lead to different work. Do not settle an unstated choice about behavior, a host adapter contract, or a recorded decision by assuming it. Do everything independent of the answer first, then ask at the point the answer is needed.
- Keep changes small and within the requested scope. Do not refactor outside it. Preserve unrelated work.
- Update docs in the same change when behavior, architecture contracts, workspace exports, conventions, or platform rules change. Keep package and app README files aligned with their responsibilities and `package.json` `exports`.
- Do not add dependencies unless simple in-house code is worse. Do not commit secrets, build artifacts, or unrelated changes.
- Report failing checks, skipped steps, and unfinished work plainly, with the output that shows it. Never describe a partial result as complete.
- Close by listing material judgment calls and assumptions so they can be confirmed or reversed.

## Judgment

- Documentation records decisions; it does not prove them right. Follow a decision while it stands, and judge it too: when reviewing or auditing, ask both whether the work matches the decision and whether the decision is right, and report each finding as the one it is. [`docs/guidelines/documentation.md`](docs/guidelines/documentation.md) owns this distinction and the rules for recording and reversing decisions.
- Recorded decisions carry across sessions; a session's preferences do not. Do not reverse a recorded decision, or recommend reversing it, without naming what it did not weigh.
- Ground each finding in a realistic case: the input or action, what goes wrong, and for whom. A concern you cannot ground is a question; state it as one.
- A fix that adds or changes a contract — a workspace export, a host adapter capability, a Tauri command or capability, a persisted setting or on-disk format, a default, a limit — is a decision, not a fix. Present it as the problem, the options, your recommendation, and why, and wait for approval before making it.

## Knowledge

- Do not keep agent memory files. Knowledge worth keeping belongs in the repository, where it is versioned, reviewed, and available in every checkout: a recorded decision in documentation, a test, or a trap in a scoped `AGENTS.md`.
- Any directory MAY have its own `AGENTS.md`. Before working in a directory, read each `AGENTS.md` on the path from the repository root to it. This file says how to work; a scoped file records the known traps of its scope. Today there is [`.githooks/AGENTS.md`](.githooks/AGENTS.md).
- A trap is information, not a rule: what happens, when trying what, and what to prefer instead, as in "X happens when trying Y; prefer Z". It answers "why isn't this done another way?" without settling it. When a trap may no longer hold, check it, then update or remove it. Rules and decisions belong in documentation, and a scoped file does not restate documentation or this file.
- Make each trap checkable: state the conditions it held under, such as a tool or runtime version, and its evidence when one exists, such as a test, an issue, or a check that catches it.
- Add a trap in the change that discovers it, when its cause is not evident from the code or documentation. Remove it in the change that removes its cause.

## Context discipline

- Start with filenames, headings, and focused searches; read the sections needed to understand the change and its dependencies. Expand inspection when evidence leaves a question unresolved.
- Reuse information already inspected in the session. Re-read material when it changed or when a specific uncertainty requires it.
- Prefer canonical sources. Build output (`dist/`, `.wrangler/`, `src-tauri/gen/`) is derived; the source is what to read and change.
- Bound searches and tool output by scope and size. Large files and logs are easier to inspect in relevant sections than in whole-file dumps; read test, build, and CI output as a summary first.
- Narrow commands during development and reserve `pnpm verify` for the completed change. Run package scripts from the repository root with `pnpm --filter=<package-name> <script>`, such as `pnpm --filter=@vista/app test`; do not change into a package directory. Format and lint scripts also accept a root-relative path, such as `pnpm lint:fix packages/app/src`.

## Collaboration

- State material findings and remaining uncertainties as work progresses.
- Resolve conflicts between instructions and authoritative documentation explicitly rather than silently choosing a reading.
- Never commit to `main` unless asked to, for that commit, in the moment. Pushing a branch, opening a pull request, and filing an issue are outward-facing: ask first, every time. [`CONTRIBUTING.md`](CONTRIBUTING.md) has the rules.
