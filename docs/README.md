---
status: IMPLEMENTED
last_updated: 2026-10-15
scope: Index of the project documentation.
---

# Documentation

`docs/` holds durable project knowledge. [Contributing](../CONTRIBUTING.md) contains the contributor workflow; [agent instructions](../AGENTS.md) contain agent behavior guidance. [Documentation guidelines](guidelines/documentation.md) define how these documents are written, what their status means, and how they change.

## Overview

| Document                        | Contains                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| [Architecture](architecture.md) | Shared app code versus platform hosts, platform adapters, and the hosting decision. |
| [Roadmap](roadmap.md)           | Planned, possible, and ruled-out work, each cited to the document that states it.   |

## Repository references

| Document              | Contains                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| [Tooling](tooling.md) | Root scripts, what `pnpm verify` runs and why, formatters and linters, git hooks, and generated output. |
| [CI](ci.md)           | Pinned toolchain, the `Web` and `Rust` jobs, action pinning, and labels.                                |

## Guidelines

| Document                                     | Contains                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Code](guidelines/code.md)                   | Naming, structure, TypeScript, async and error handling, testing, and tooling.                      |
| [Documentation](guidelines/documentation.md) | Required header, status and authority, recording decisions, exceptions, document roles, and layout. |

## Specifications

| Document                          | Contains                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Workspaces](specs/workspaces.md) | Local folder workspaces, view modes, platform capabilities, and file management.                           |
| [Tests](specs/tests.md)           | Test categories, configuration requirements, coverage, and execution commands.                             |
| [Errors](specs/errors.md)         | How failures are classified, shown, and logged today, and a draft direction for user-facing failure kinds. |
