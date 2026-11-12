## What and why

<!-- What the change does for someone reading the log later, and why it is needed. -->

Fixes #

## Checks

- [ ] `pnpm verify` passes, or the skipped steps are listed here
- [ ] `pnpm test:e2e` passes if the web app's behavior changed; `pnpm verify` does not run it
- [ ] Documentation affected by behavior, architecture, or convention changes is updated in this pull request

## Security

- [ ] No secret, token, or personal data, such as note content, can reach a log, an error, or a snapshot
- [ ] New untrusted input, such as a file or setting read from the workspace folder, is validated where it enters, with a bounded size
- [ ] A new dependency, Tauri capability or permission, or externally reachable surface is named in the description
