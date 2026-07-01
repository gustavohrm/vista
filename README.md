# Vista

Vista is a multi-platform application designed for managing notes and personal data, optimized for building and navigating your own "second-brain". It blends the best features of Notion, Obsidian, and VS Code into a lightweight app that operates directly on local folders.

The app opens a folder on the user's computer and interprets files in rich, context-aware visualizations. Markdown files open in a fluid rich-text editor; CSV files render as interactive, searchable, filterable, and sortable tables. Vista also includes backlinks for connecting notes, folder-level fuzzy search, and versatile export formats (exporting tables to `.csv`, `.xlsx`, `.json`, or `.yaml`, and text files to `.txt`, `.markdown`, or `.docx`).

## Commands

Use pnpm from the repository root. Run workspace-wide commands with no package filter:

```sh
pnpm build
pnpm format:check
pnpm format:fix
pnpm lint:check
pnpm lint:fix
pnpm test
pnpm typecheck
```

Format and lint scripts accept an optional root-relative path:

```sh
pnpm format:check
pnpm format:check packages/error
pnpm lint:fix packages/error/src
```

When working on one package, run package scripts with `--filter` from the repository root. Use the directory name under `packages/` or `apps/` as the filter value:

```sh
pnpm --filter=error build
pnpm --filter=styles test
pnpm --filter=theme typecheck
```

Before publishing or merging package behavior changes, run at least:

```sh
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm test
```

## Documentation

This repository is docs-first: durable decisions live in `docs/` and code should follow approved documentation. Package-specific documentation live in `[packages|apps]/<package-name>/docs/` .

Read these before changing behavior, public APIs, or project conventions:

- `docs/docs-guidelines.md`: documentation structure, status model, and exception rules.
- `docs/code-guidelines.md`: coding conventions and enforceable quality rules.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).
