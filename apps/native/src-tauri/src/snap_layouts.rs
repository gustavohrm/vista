//! Snap Layouts for a window without a system frame. Windows shows them when the pointer rests on a
//! frame's own Maximize button, which Vista's window does not have, so Vista's Maximize button asks
//! for them with the shortcut that shows them for the active window, `Win + Z`.

use tauri::WebviewWindow;
use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY, VK_LWIN,
    VK_Z,
};
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
use windows::core::w;

/// Shows Snap Layouts for `window`, unless the user turned them off or another window is in front,
/// since the shortcut acts on the window in front.
pub fn show(window: &WebviewWindow) -> tauri::Result<()> {
    if unsafe { GetForegroundWindow() } != window.hwnd()? || !is_enabled() {
        return Ok(());
    }
    let inputs = [
        key(VK_LWIN, false),
        key(VK_Z, false),
        key(VK_Z, true),
        key(VK_LWIN, true),
    ];
    // One call, so no other input lands between the keys. Input refused, such as by a window of
    // higher integrity in front, shows nothing, as a press with the feature off does.
    unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) };
    Ok(())
}

/// Whether Settings, Multitasking, "Show snap layouts when I hover over a window's maximize button"
/// is on. Windows leaves the value out until the user changes it, and on is the default.
fn is_enabled() -> bool {
    let mut value: u32 = 1;
    let mut size = size_of::<u32>() as u32;
    let result = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!(r"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced"),
            w!("EnableSnapAssistFlyout"),
            RRF_RT_REG_DWORD,
            None,
            Some((&raw mut value).cast()),
            Some(&raw mut size),
        )
    };
    result.is_err() || value != 0
}

fn key(code: VIRTUAL_KEY, is_up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: code,
                dwFlags: if is_up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                ..Default::default()
            },
        },
    }
}
