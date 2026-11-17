fn main() {
    // Declaring the app's commands makes each one need a permission, as plugin commands do, rather
    // than being open to every window.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["show_snap_layouts"])),
    )
    .expect("failed to run tauri-build");
}
