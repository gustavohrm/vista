# Roadmap spec

**Status:** APPROVED
**Last updated:** 2026-06-10
**Scope:** Optional repo-level and package-level roadmap files.

This document defines how optional `roadmap.md` files may be used to track durable direction, feature plans, and planning context.

## Compliance

Roadmap files are optional. A missing roadmap means no durable roadmap is currently maintained for that scope.

When a roadmap exists, it SHOULD follow this spec unless a different structure is clearly better for that scope.

## Locations

Repo-level roadmap files MAY live at `docs/roadmap.md`.

Package-level roadmap files MAY live at `[packages|apps]/<package-name>/docs/roadmap.md`.

Root `docs/` MUST NOT contain package-specific roadmap details. Package-specific roadmap details belong in that package's `docs/` directory.

## Purpose

A roadmap is an optional durable planning entrypoint. It should help readers understand current focus, intended direction, possible future work, and relevant planning context.

A roadmap is not a short-lived task list, scratchpad, or replacement for issue tracking. Temporary plans and working notes should follow `docs/docs-guidelines.md`.

## Recommended structure

Roadmap files SHOULD use this structure when practical:

```md
# Roadmap

**Status:** DRAFT
**Last updated:** YYYY-MM-DD
**Scope:** <repo/package/area this roadmap covers>

## Purpose

## Current Focus

## Planned

## Later / Possible

## Not Planned

## Notes

## References
```

Headings may be omitted when they do not apply. Small wording changes are allowed when they improve clarity, but the section purpose should stay recognizable.

## Sections

### Purpose

Describe what the roadmap covers and why it exists.

### Current Focus

List the few active or near-term priorities that should guide work now.

Keep this section short. If many items are active, group or prune them until the actual focus is clear.

### Planned

List work that is intended but not currently active.

Items in this section should represent a real direction, not every possible idea.

### Later / Possible

List ideas, improvements, or directions that may happen but are not committed.

Use this section for lower-confidence or lower-priority possibilities.

### Not Planned

List explicitly rejected, deferred, or out-of-scope directions when recording them prevents repeated discussion or confusion.

Include a short reason when the reason is not obvious.

### Notes

Capture durable context that is useful to remember but does not yet belong in `Current Focus`, `Planned`, `Later / Possible`, or `Not Planned`.

Use notes sparingly. Notes should capture durable observations, constraints, risks, or follow-up context that would otherwise be lost. If a note becomes actionable or directional, move it into the appropriate roadmap section.

Review notes whenever the roadmap is meaningfully updated. Remove stale notes or promote them into a more specific section.

### References

Link to related durable docs, specs, issues, discussions, or supporting files.

When additional planning or design documents are useful, the roadmap MAY link to them. The roadmap should remain the entrypoint for understanding direction, but supporting files are allowed when they make the roadmap clearer.

## Writing guidelines

Roadmap entries SHOULD be outcome-focused. Avoid turning the roadmap into a detailed checklist unless the details are durable and useful to future readers.

Avoid dates unless there is a real commitment or known external constraint.

Avoid owners, statuses, or workflow fields unless that scope intentionally uses the roadmap as a project-management artifact.

Prefer concise entries with links to deeper docs when details would make the roadmap noisy.

Update the roadmap when direction changes in a meaningful way. Do not update it for every small implementation step.
