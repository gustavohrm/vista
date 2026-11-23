# Agent instructions

This repository is docs-first. [`docs/README.md`](docs/README.md) indexes every document. [`CONTRIBUTING.md`](CONTRIBUTING.md) is the workflow every change follows, and [`docs/tooling.md`](docs/tooling.md) lists the commands. Before delivering a change, run the gate [`CONTRIBUTING.md`](CONTRIBUTING.md#validation) names, `pnpm verify`.

## Working agreement

- Use the task's scope and your judgment to choose which documentation and code to inspect. Applicable contributor rules, guidelines, and specifications remain binding; reading less does not waive them.
- Ask when different interpretations would lead to different work. Do not settle an unstated choice about behavior, a host adapter contract, a security property, or a recorded decision by assuming it. Do everything independent of the answer first, then ask at the point the answer is needed.
- Keep changes small and within the requested scope. Preserve unrelated work.
- A defect found while working on something else is filed and worked around, not fixed on the spot, as [`CONTRIBUTING.md`](CONTRIBUTING.md#a-defect-found-mid-task) describes. That includes a defect in a dependency you also maintain, such as an `@codenhub/*` package: the fix belongs in that dependency's repository.
- Never put a secret, token, password, or personal data in a log, an error, a test snapshot, a commit, or a message to the user, including test values you generate. Note and document content in a user's folder counts as personal data; [`SECURITY.md`](SECURITY.md) describes what Vista protects, and [`docs/guidelines/security.md`](docs/guidelines/security.md) how code keeps it.
- Report failing checks, skipped steps, and unfinished work plainly, with the output that shows it. Never describe a partial result as complete.
- Close with the material judgment calls and assumptions, so they can be confirmed or reversed, in the one list [Reporting to the maintainer](#reporting-to-the-maintainer) describes.

## Reporting to the maintainer

The maintainer decides from what your message says, not from the work behind it, and usually sees only your last message: not your reasoning, your tool output, or the messages in between. A message they cannot act on without that context gets approved unread, and that is how unnecessary changes reach `main`.

- **Stand alone.** Say what was asked, what you did, and what is left, in the message itself. Do not lean on "the option from before", "finding 7", or "as discussed" without restating what it was.
- **Plain words first.** Lead with what changes for someone using what the project ships or working in the repository. Specification names, framework behavior, and file paths come after, as evidence for the explanation, never in place of it. A question that names a spec, a framework, or a code path without an example of what changes for the user is not ready to ask.
- **Ask only what is the maintainer's to decide.** A question is for a choice about behavior, public surface, a security property, or a recorded decision. Settle anything else with the conventional choice and list it as an assumption.
- **Keep what you did short.** A few lines on what changed for the user; the diff carries the rest.
- **Put everything that needs an answer in one numbered list.** Questions, decisions, and judgment calls worth reversing are one list, not separate sections that overlap or repeat each other. Each item carries its recommendation, so it can be answered with its number and a word, and an assumption takes one line with what undoing it would cost.
- **End with how to reply.** Say what reply takes every recommendation, as in "Reply 'go' to take all of them, or name the numbers to change." A message with nothing to answer says so. Writing the reply should take less effort than reading the message.
- **Raise what a realistic case supports.** Every finding you report invites a change. Leave out what no case supports, and say plainly when the right answer is to change nothing.
- **Give each question what it takes to answer it:**
  - The situation, in a sentence or two that someone new to the area follows.
  - A concrete example: the code someone writes or the input they give, and what happens today.
  - The options, each with what it does to that example and what it costs: what breaks, what is added and then maintained, who has to change their code. "Change nothing" is one of them whenever it is viable.
  - A recommendation and its reason.

Before, not answerable without the research behind it:

> ECMA-402 defaults `roundingMode` to `halfExpand`, while IEEE 754 and much accounting software use `halfEven`. Should `formatPrice` follow `halfEven` for ties?

After:

> `formatPrice(2.345)` shows `$2.35` today. Some accounting software shows `$2.34` for the same value, because it rounds a half to the even digit, so a total built from our prices can be a cent off from an invoice.
>
> - (a) Change nothing. It matches what browsers do with `Intl.NumberFormat`. No new code.
> - (b) Round halves to even by default. Breaking: about half the displayed prices that end in a half cent change, such as `$2.35` to `$2.34`, in every app.
> - (c) Add a `rounding` option. Nothing breaks, but it is one more option to document, test, and keep.
>
> Recommendation: (a) until someone reports a mismatch. (b) breaks every app for a case nobody has hit, and (c) adds surface nobody has asked for.

## Judgment

- Documentation records decisions; it does not prove them right. Follow a decision while it stands, and judge it too: when reviewing or auditing, ask both whether the work matches the decision and whether the decision is right, and report each finding as the one it is. [`docs/guidelines/documentation.md`](docs/guidelines/documentation.md) owns this distinction and the rules for recording and reversing decisions.
- Recorded decisions carry across sessions; a session's preferences do not. Do not reverse a recorded decision, or recommend reversing it, without naming what it did not weigh.
- Ground each finding in a realistic case: the input or action, what goes wrong, and for whom. A concern you cannot ground is a question; state it as one.
- A fix that adds or changes a contract, such as a workspace export, a host adapter capability, a Tauri command or capability, a persisted setting or on-disk format, a default, a limit, or a dependency, is a decision, not a fix. Ask it as [Reporting to the maintainer](#reporting-to-the-maintainer) describes, and wait for approval before making it.

## Project specifics

- **Shared UI stays host-free.** `packages/app` never imports Tauri, the File System Access API, or another host API; it reaches them through the contracts in `packages/app/src/ports.ts`, as [the stack guidelines](docs/guidelines/stack.md#react-and-ui) describe.
- **No browser dialogs.** Never use `alert`, `confirm`, or `prompt`; messages and confirmations go through `useToast()`, as [the stack guidelines](docs/guidelines/stack.md#react-and-ui) describe.
- **Icon classes are literal.** An `ic-*` class appears as a literal string in `className`, because the `@codenhub/icons` build-time rewrite matches only literals, as [the stack guidelines](docs/guidelines/stack.md#react-and-ui) describe; a class computed at runtime is never rewritten.

## Knowledge

- Do not keep agent memory files. Knowledge worth keeping belongs in the repository, where it is versioned, reviewed, and available in every checkout: a recorded decision in documentation, a test, or a trap in a scoped `AGENTS.md`.
- Any directory MAY have its own `AGENTS.md`. Before working in a directory, read each `AGENTS.md` on the path from the repository root to it. This file says how to work; a scoped file records the known traps of its scope.
- A trap is information, not a rule: what happens, when trying what, and what to prefer instead, as in "X happens when trying Y; prefer Z". It answers "why isn't this done another way?" without settling it. When a trap may no longer hold, check it, then update or remove it. Rules and decisions belong in documentation, and a scoped file does not restate documentation or this file.
- Make each trap checkable: state the conditions it held under, such as a tool or runtime version, and its evidence when one exists, such as a test, an issue, or a measurement.
- Add a trap in the change that discovers it, when its cause is not evident from the code or documentation. Remove it in the change that removes its cause.

## Context discipline

- Start with filenames, headings, and focused searches; read the sections needed to understand the change and its dependencies. Expand inspection when evidence leaves a question unresolved.
- Reuse information already inspected in the session. Re-read material when it changed or when a specific uncertainty requires it.
- Prefer canonical sources. Build output such as `dist/`, `.wrangler/`, and `src-tauri/gen/` is derived from source, not an additional contract to read alongside it.
- Find code with focused searches (`grep -n`, `rg`) and read the line ranges they point to. Read a whole file only when the change needs all of it, and do not dump several files or a directory in one command (`cat a.ts b.ts`, `for f in …; do cat "$f"; done`).
- Batch independent inspections as parallel tool calls, each kept focused, not as one command whose output is the sum of all of them.
- Narrow commands during development, as [tooling](docs/tooling.md) describes, and reserve the delivery gate [contributing](CONTRIBUTING.md#validation) names for the completed change. Retain the checks the contributor workflow requires.
- Read test, build, and CI output as a summary first: filter to failures or the tail, and treat a background task's output file the same way. Open the full log only when the summary leaves a failure unexplained. Keep machine-readable and interactive output usable.
- At a natural boundary, such as an audit finished before fixes start, record what the next phase needs in the repository or the pull request, and suggest continuing in a new session. Every turn resends the whole context.

## Collaboration

- State material findings and remaining uncertainties as work progresses.
- Resolve conflicts between instructions and authoritative documentation explicitly rather than silently choosing a reading.
- Never commit to `main` unless asked to, for that commit, in the moment.
- Pushing a branch, opening a pull request, filing an issue, pushing a release tag, and deploying are outward-facing. Ask first, every time; an earlier approval does not carry over. [`CONTRIBUTING.md`](CONTRIBUTING.md) has the rules.
