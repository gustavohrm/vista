# Testing specification

**Status:** IMPLEMENTED
**Last updated:** 2026-09-08

This document outlines the testing strategy, architecture, and standards for this repository. It defines test categories, tooling, configuration requirements, and code coverage targets.

## Philosophy

- **Test Behavior, Not Implementation**: Write tests that verify the observable behavior of your API or component, rather than its internal implementation details.
- **Fast and Deterministic**: Tests must run quickly and yield consistent, predictable results. Flaky tests are unacceptable.
- **Fail Fast**: Test inputs and edge cases early. Ensure error paths are tested alongside happy paths.

## Test Categorization

Tests in this repository use the following categories as needed, based on scope and isolation level.

### 1. Unit Tests

Unit tests verify the correctness of small, isolated blocks of code (such as individual functions, classes, or hooks) in isolation.

- **Location**: Colocated in the same directory as the source code they verify.
- **File Naming**: `[filename].test.ts` or `[filename].test.tsx` (e.g., `src/normalize.test.ts`).
- **Tooling**: [Vitest](https://vitest.dev/).
- **Conventions**:
  - Mock external dependencies (network APIs, local storage, databases, file system, timers, and browser-specific globals).
  - Do not cross-import test utilities across distant packages unless exposed via explicit shared test packages.
  - Run on every pull request through GitHub Actions.
  - Shared React tests use React Testing Library, jest-dom matchers, and an explicit jsdom environment. Use user-event for user interactions when features introduce them. Test setup cleans up mounted components after each test.

### 2. Integration Tests

Integration tests verify that multiple modules or packages interact correctly, including boundaries such as database adapters, network middleware, or cache layers.

- **Location**: Housed in a `tests/integration/` directory inside the package or application root (e.g., `packages/app/tests/integration/`).
- **Tooling**: [Vitest](https://vitest.dev/).
- **Conventions**:
  - Do not use a repository-root global `tests/` directory by default. Keep tests colocated within the package/app scope.
  - Do not create a hard rule banning global repository-level integration directories if complex, multi-package orchestration tests become necessary in the future.

### 3. End-to-End (E2E) & Visual Tests

E2E tests verify full user journeys, page transitions, rendering, and visual regression across real browser environments.

- **Location**: Housed in `tests/e2e/` or `tests/browser/` directories within the target application or specialized styling packages.
- **Tooling**: [Playwright](https://playwright.dev/).
- **Conventions**:
  - Add visual regression tests when a component has an agreed visual design. The current shell uses a browser startup smoke test, including a computed-style check, rather than maintaining snapshots of placeholder UI.
  - Since E2E tests are slower and require browser environments, configure them separately to avoid blocking fast unit test loops.

The web host's Playwright smoke test builds the frontend and serves it with local Wrangler. It verifies shared-app startup, styles, direct navigation, reload, and JavaScript errors through the deployment runtime. Chromium covers the initial desktop Chrome/Edge web target. The test starts its own server and fails on a port collision rather than silently using another app.

Windows CI separately runs Rust formatting, Clippy, Rust tests, and a native release executable build. There are no custom Rust commands to unit-test yet. Native UI automation, mobile device tests, and installer/signing verification are added when those targets or behaviors enter scope.

Repository Git-hook integration tests live beside the scripts in `scripts/git-hooks.test.mjs` and use Node's built-in test runner. This scoped exception to the Vitest/package layout keeps repository tooling dependency-free. Tests use temporary repositories and local bare remotes, and substitute only the expensive pnpm checks. They verify real Git commit/push acceptance, rejection, and failure propagation without touching the working repository or GitHub. `pnpm test:hooks` runs them independently; `pnpm test` includes them.

## Configuration Requirements

To maintain clean and explicit testing setups, follow these configuration rules:

- **Config Files**:
  - If a package or application requires custom options (such as path aliases, environment variables, vitest plugins, or specific setups), it **MUST** include an explicit configuration file (`vite.config.ts`, `vitest.config.ts`, or `playwright.config.ts`).
  - Do not rely on implicit or undocumented fallback behavior.
- **Package Scripts**:
  - Every testable package or app `package.json` must expose standard test scripts:
    - `"test"`: Runs tests once.
    - `"test:watch"`: Runs tests in interactive watch mode.
    - `"test:coverage"`: Runs tests and outputs a coverage report.

These standard scripts apply to packages with Vitest suites. A host with only browser tests exposes `test:e2e`; native Rust checks expose `test:rust`. Do not add empty suites or commands that silently pass without tests just to fill out scripts.

## Code Coverage

- **Suggested Target**: **80%** code coverage.
- **Non-Blocking Target**: Code coverage is a target to guide development and review discussions. It must not block the CI/CD pipeline or fail builds due to minor discrepancies, preventing false-positive failures and unnecessary development overhead.

## Execution Commands

Always run tests from the repository root:

### Workspace-wide Checks

```sh
pnpm test
pnpm test:coverage
pnpm test:e2e
```

### Package-filtered Checks

Prefer using package-filtered commands when testing a single package or to avoid workspace timeouts:

```sh
pnpm --filter=<package-name> test
pnpm --filter=<package-name> test:watch
pnpm --filter=<package-name> test:coverage
```

_(Replace `<package-name>` with a workspace package name, e.g., `pnpm --filter=@vista/app test`.)_

Install the browser once before running E2E tests:

```sh
pnpm --filter=@vista/web exec playwright install chromium
```

On Linux CI, use `playwright install --with-deps chromium`. Browser tests remain separate from `pnpm test` and `pnpm verify` so local unit-test loops do not need a browser installation. CI runs both. Coverage includes untested implementation files in the shared package and excludes tests, setup, re-export entrypoints, and the current type-only platform contract. The 80% target remains advisory.
