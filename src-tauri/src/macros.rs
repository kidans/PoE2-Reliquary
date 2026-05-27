use std::{thread, time::Duration};

use arboard::Clipboard;
use rdev::{simulate, EventType, Key};

const KEY_DELAY: Duration = Duration::from_millis(18);

pub fn send_invite_macro(target_character: &str) -> Result<(), String> {
    send_chat_command(&format!("/invite {}", target_character.trim()))
}

pub fn send_trade_macro(target_character: &str) -> Result<(), String> {
    send_chat_command(&format!("/tradewith {}", target_character.trim()))
}

pub fn send_kick_macro(target_character: &str) -> Result<(), String> {
    send_chat_command(&format!("/kick {}", target_character.trim()))
}

fn send_chat_command(command: &str) -> Result<(), String> {
    if command.trim().is_empty() {
        return Err("macro command cannot be empty".to_string());
    }

    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_text(command.to_string())
        .map_err(|error| error.to_string())?;

    tap_key(Key::Return)?;
    paste_clipboard()?;
    tap_key(Key::Return)?;

    Ok(())
}

fn paste_clipboard() -> Result<(), String> {
    simulate(&EventType::KeyPress(Key::ControlLeft)).map_err(|error| format!("{error:?}"))?;
    thread::sleep(KEY_DELAY);
    tap_key(Key::KeyV)?;
    thread::sleep(KEY_DELAY);
    simulate(&EventType::KeyRelease(Key::ControlLeft)).map_err(|error| format!("{error:?}"))
}

fn tap_key(key: Key) -> Result<(), String> {
    simulate(&EventType::KeyPress(key)).map_err(|error| format!("{error:?}"))?;
    thread::sleep(KEY_DELAY);
    simulate(&EventType::KeyRelease(key)).map_err(|error| format!("{error:?}"))?;
    thread::sleep(KEY_DELAY);
    Ok(())
}
