# Vista

Vista is an early-stage, multi-platform workspace for managing notes and personal data. Its goal is a lightweight middle ground between Notion, Obsidian, and VS Code that operates directly on local folders.

The current implementation opens a local folder as a workspace, shows its file tree, edits Markdown and CSV files, and creates, renames, and deletes files, on the web and in a Tauri desktop host. Backlinks, folder search, and data export are planned. Desktop Chrome and Edge, and Windows, are the verified targets; the mobile builds are prepared but unverified.

## Repository

A pnpm workspace of one shared application package and the platform hosts that run it:

- `packages/app`: shared React product code and the platform capability contracts the hosts implement.
- `apps/web`: browser host, with folder access through browser APIs, a Vite build, and a Cloudflare Workers scaffold whose publication is deferred.
- `apps/native`: Tauri host for desktop, Android, and iOS, with Rust in `apps/native/src-tauri`.
- `docs/`: architecture, guidelines, specifications, and repository references.

## Tooling

Every check is a root pnpm script run from the repository root, and `pnpm verify` runs the full gate: formatting, linting, type checking, tests, builds, and the Rust checks. The toolchain versions are declared in `.nvmrc`, `package.json`, and `rust-toolchain.toml`. [Tooling](docs/tooling.md) documents the scripts, the verification order, and the git hooks.

## Documentation

- [Contributing](CONTRIBUTING.md): setup, contributor workflow, validation, branches, commits, and pull requests.
- [Agent instructions](AGENTS.md): agent behavior, judgment, and context discipline.
- [Security](SECURITY.md): how to report a vulnerability and which surfaces matter most.
- [Repository documentation](docs/README.md): the map of architecture, guidelines, specifications, and repository references.
- Each app and package `README.md`: that workspace's responsibilities, commands, and boundaries.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).
