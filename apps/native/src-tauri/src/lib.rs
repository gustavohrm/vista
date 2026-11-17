#[cfg(windows)]
mod snap_layouts;

/// Shows Snap Layouts for the window, from Vista's own Maximize button. Does nothing off Windows.
#[tauri::command]
fn show_snap_layouts(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    snap_layouts::show(&window).map_err(|err| err.to_string())?;
    #[cfg(not(windows))]
    let _ = window;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![show_snap_layouts]);
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
    builder
        .run(tauri::generate_context!())
        .expect("error while running Vista");
}
