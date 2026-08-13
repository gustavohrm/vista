# @vista/app

Shared Vista product package. It owns platform-neutral React UI and contracts consumed by the web and native hosts.

## API

The package root exports:

- `App`: shared React application shell. Pass an `AppAdapter` supplied by a platform host.
- `AppAdapter`: contract for capabilities supplied by a platform host.
- `AppPlatform`: supported host kind, currently `"web"` or `"native"`.

Platform-specific browser and Tauri implementations must remain in their respective host applications.
