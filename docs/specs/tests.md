---
status: IMPLEMENTED
last_updated: 2026-11-12
scope: Test categories, where each lives, coverage expectations, and what no automated test reaches.
---

# Tests

This document defines how the project is tested: what kinds of tests exist, where they live, how they run, and what they are expected to cover. The conventions for writing an individual test are in the [coding guidelines](../guidelines/code.md#testing), and the runners, file names, configuration, and commands are in [stack tests](stack-tests.md).

## Principles

- **Test behavior, not implementation.** A test verifies what a caller can observe, not how the code produces it.
- **Fast and deterministic.** A flaky test is a bug. Time, randomness, and the network come from sources a test controls; a test that depends on real timing, the network, or a real window does not belong in the default suite.
- **Error paths count.** Failure cases are tested as carefully as the happy path, and inputs and edge cases early.
- **No permanent absence checks.** A test asserting only that a removed name, class, or token is gone, such as an assertion that some output does not contain `old-name`, verifies nothing about current behavior: it is indistinguishable from asserting the absence of a string that never existed. Such a check earns its place only while a rename or removal is in flight, as a guard against a forgotten reference; delete it once the change is verified, in the same pull request. A durable rule, such as "no compatibility aliases", is a lint rule or repository check, not a permanent unit test.

## Categories

| Category  | Where                                | Runs                                          | Covers                                                                             |
| --------- | ------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Unit      | Next to the code it tests            | With the default suite, `pnpm test`           | One module, its boundaries replaced by fakes.                                      |
| Browser   | In the web host, apart from its code | Apart from the default suite, `pnpm test:e2e` | Full user journeys and rendering in real browsers. No visual regression tests yet. |
| Git hooks | Beside the scripts, in `scripts/`    | With the default suite, `pnpm test`           | Real commits and pushes through the hooks, in temporary repositories.              |

The default suite is what the gate's test step runs. Add a category only when the project has tests for it: an empty suite, or a script that passes without running anything, misleads more than a missing one. Vista has no integration tests and no Rust tests yet; the first of either adds its row here, its section below, and its runner to [stack tests](stack-tests.md).

Manual usage scenarios, such as running the dev server during development, are outside these categories.

### Unit tests

- A test file is named after the file it covers, as [stack tests](stack-tests.md#runners-and-file-names) gives.
- What to mock, and what to test against real temporary state instead, is owned by the [coding guidelines](../guidelines/code.md#testing).
- Do not import test utilities across distant packages, except from a package or subpath that exists to share them.

### Browser tests

- Browser suites are configured and run apart from the default suite, so the loop everyone runs constantly stays fast and needs no browser installed.
- A suite SHOULD cover every engine its users run, because catching what one engine does differently is what the suite is for. The suite runs Chromium only today, as [Not covered by automated tests](#not-covered-by-automated-tests) records.
- Add visual regression tests once a component has an agreed visual design, not for placeholder interfaces. The current shell uses a browser startup smoke test, including a computed-style check, rather than maintaining snapshots of placeholder UI.

The web host's smoke test builds the frontend and serves it with local Wrangler. It verifies shared-app startup, styles, direct navigation, reload, and JavaScript errors through the deployment runtime. Chromium covers the initial desktop Chrome/Edge web target.

### Git hook tests

The hook tests in `scripts/git-hooks.test.mjs` use Node's built-in test runner rather than Vitest, a scoped exception that keeps repository tooling free of dependencies. They use temporary repositories and local bare remotes, and substitute only the expensive pnpm checks, so they verify real commit and push acceptance, rejection, and failure propagation without touching the working repository or GitHub.

## Coverage

The coverage script writes a report, as [stack tests](stack-tests.md#coverage) describes. The suggested target is **80%**. It guides development and review; it is not a gate and never fails a build, because a coverage threshold that blocks merges gets satisfied with tests that execute lines without asserting anything.

## Not covered by automated tests

These areas have no automated test. They are verified by hand, or not verified at all, until a test for them exists.

- **Native app.** `apps/native` has no automated UI or end-to-end test. Folder picking, filesystem scope, and restoring a folder after a restart are checked by running the app. Build it by hand when changing Tauri configuration or implementing native adapters.
- **Native executable.** The native build is not in CI, and no Rust test exists yet.
- **Native and web folder adapters.** Neither `apps/native/src/workspace-adapter.ts` nor `apps/web/src/workspace-adapter.ts` has a Vitest suite.
- **File System Access in the browser.** The browser suite in `apps/web/tests/e2e/workspace-crud-fallback.spec.ts` forces the `webkitdirectory` fallback, because automation cannot drive the native folder picker. The primary File System Access path, including permission prompts and reopening a remembered folder, is checked by hand.
- **Other browsers.** The browser suite runs Chromium only. Firefox and Safari are not covered.
- **Mobile.** Android and iOS are not supported, so nothing is tested there.
- **Packaging.** Installers, signing, and automatic updates are not verified.
