---
status: IMPLEMENTED
last_updated: 2026-11-13
scope: Index of the project documentation.
---

# Documentation

`docs/` holds durable project knowledge. [Contributing](../CONTRIBUTING.md) contains the contributor workflow; [agent instructions](../AGENTS.md) contain agent behavior guidance. [Documentation guidelines](guidelines/documentation.md) define how these documents are written, what their status means, and how they change.

Every document in `docs/` is listed here. Adding, moving, or deleting one updates this index in the same change.

## Overview

| Document                        | Contains                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| [Architecture](architecture.md) | Shared app code versus platform hosts, platform adapters, and the hosting decision. |
| [Roadmap](roadmap.md)           | Planned, possible, and ruled-out work, each cited to the document that states it.   |

## Repository references

| Document                  | Contains                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Workspace](workspace.md) | The root scripts and what each guarantees, the shared tool configurations, the pinned toolchain, installs, dependency versions, and the git hooks. |
| [Tooling](tooling.md)     | Setup, how the scripts are implemented, the order of `pnpm verify`, narrowing a run, adding a package, and generated output.                       |
| [CI](ci.md)               | Pinned toolchain, the `Web` and `Rust` jobs, action pinning, dependency updates, and branch protection.                                            |
| [Assets](assets.md)       | The logo, icon, favicon, and brand font files under `assets/`, how to choose one, and how the app icons are regenerated.                           |

## Guidelines

| Document                                     | Contains                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [Code](guidelines/code.md)                   | Naming, design, fixing dependencies upstream, errors, inputs and state, testing practices, and documentation in code. |
| [Stack](guidelines/stack.md)                 | TypeScript, React, and Rust conventions, TSDoc, and the tools that check them.                                        |
| [Security](guidelines/security.md)           | Secrets, untrusted input, folder access and host permissions, what stays out of logs, and reviewing a change.         |
| [Documentation](guidelines/documentation.md) | Required header, status and authority, recording decisions, exceptions, document roles, layout, and writing.          |
| [Brand](guidelines/brand.md)                 | The name, brand idea, logo, colours, and typefaces, and why each was chosen.                                          |

## Specifications

| Document                            | Contains                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Workspaces](specs/workspaces.md)   | Local folder workspaces, view modes, platform capabilities, and file management.                           |
| [Tests](specs/tests.md)             | Test categories, where each lives, coverage, and what no automated test reaches.                           |
| [Stack tests](specs/stack-tests.md) | The runners, file names, configuration, scripts, and commands for Vitest, Playwright, and cargo.           |
| [Errors](specs/errors.md)           | How failures are classified, shown, and logged today, and a draft direction for user-facing failure kinds. |
