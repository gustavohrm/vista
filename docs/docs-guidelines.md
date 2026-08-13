# Documentation guidelines

**Status:** IMPLEMENTED
**Last updated:** 2026-08-13

This document covers how the documentation in this project is structured, maintained, and how it should be interpreted, including this document itself.

## Required header

Every durable document in `docs/` MUST start with these fields, in this order:

- `Status`: how reliable and authoritative the document is.
- `Last updated`: date of the last meaningful content change.

Documents SHOULD include `Scope` when the title alone does not make ownership clear.

Allowed statuses:

- `DRAFT`: Work in progress. Use as context, not as binding source of truth.
- `APPROVED`: Agreed source of truth. Future work MUST follow it. Existing code may be non-compliant and should be treated as legacy until updated.
- `IMPLEMENTED`: Agreed source of truth and current implementation is expected to comply. New exceptions MUST be documented or the document MUST be updated.

## Source of truth

Documentation MUST be updated in the same change when behavior, architecture, conventions, or project decisions change.

Truth priority is:

1. APPROVED or IMPLEMENTED documentation.
2. DRAFT documentation.
3. Existing code.

When APPROVED or IMPLEMENTED documentation conflicts with code, the documentation describes the intended direction and the code should be treated as legacy unless the document is outdated.

When APPROVED or IMPLEMENTED documents conflict with each other, the conflict MUST be resolved in the same change if practical. If not practical, move the conflicting documents to `DRAFT` and add a short note explaining the conflict.

Prefer updating existing documents over creating new overlapping ones. Prefer updating documentation before changing code, so the intended direction is clear before implementation follows.

## Exceptions

Exceptions to APPROVED or IMPLEMENTED documents MUST be explicit, scoped, and justified.

An exception MUST state:

- What rule is being bypassed.
- Where the exception applies.
- Why the exception is acceptable.
- Whether it is temporary or permanent.

Do not create broad exceptions for one-off cases. Prefer changing the rule when repeated exceptions show the rule is wrong.

## What belongs here

Use `docs/` for durable project knowledge:

- Architecture decisions.
- Implementation guidelines.
- Long-term conventions.
- Feature specs.
- Source-of-truth decisions.

Do not use `docs/` for temporary notes, TODO lists, or information better expressed in code comments. Also do not use root `docs/` for package-specific documentation; those should be in `packages/<name>/docs/` or `apps/<name>/docs/`, because each package should own its own rules and documentation.

Plans and similar temporary documents MAY live in `docs/plans/`. This directory is git-ignored and should stay that way because these documents are short-lived planning aids, not long-term project documentation.
