# Application architecture

**Status:** IMPLEMENTED
**Last updated:** 2026-08-13

Vista separates shared product code from platform hosts:

- `packages/app` is the home for shared React UI, features, state, domain behavior, and platform capability contracts. It currently provides the application shell and platform contract.
- `apps/web` boots the shared app at the browser boundary and deploys through a Cloudflare Worker.
- `apps/native` boots the shared app at the Tauri boundary. Its single Tauri project targets desktop, Android, and iOS.

Platform hosts MUST keep browser- or Tauri-specific implementations outside `packages/app`. Shared code MUST consume future platform capabilities through narrow contracts. Add more workspace packages only when code has a proven independent responsibility or consumer.
