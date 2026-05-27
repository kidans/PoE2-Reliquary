# Linux Portability Plan

## Overview

~1% of the codebase needs changes. ~108 lines across 3 files. Zero UI changes.
Total effort: ~2-3 hours of Rust work.

## What Works Out of the Box

| Component | Status |
|-----------|--------|
| Tauri window management | Fully supported |
| `arboard` clipboard read/write | Fully supported |
| `rdev` global input listener | Works on X11/XWayland |
| `rdev::simulate()` macro keystrokes | Works on X11/XWayland |
| All `#[tauri::command]` IPC | Fully supported |
| Price checking / trade search | Fully supported (pure HTTP) |
| League fetching / exchange | Fully supported |
| `webbrowser::open()` | Fully supported |
| UI (main.ts — 100% portable) | Fully supported |
| Campaign tracker / guide | Fully supported |
| Window positioning / snapping | Fully supported (Tauri abstracts) |
| Click passthrough | Fully supported (Tauri abstracts) |
| `stream_client_log()` (tokio) | Fully supported (once file path is correct) |

## What Needs Implementation

### 1. Client.txt Path Discovery

File: `src-tauri/src/lib.rs` — `client_log_path()` (~lines 2016-2065)

On Linux, PoE2 runs under Proton. Known paths:

```
~/.steam/steam/steamapps/common/Path of Exile 2/logs/Client.txt
~/.steam/steam/steamapps/compatdata/2694490/pfx/drive_c/users/steamuser/Documents/My Games/Path of Exile 2/Client.txt
~/.var/app/com.valvesoftware.Steam/.steam/steam/steamapps/common/Path of Exile 2/logs/Client.txt
```

The `POE2_CLIENT_LOG` env var works as a manual override cross-platform.

### 2. Process Detection

File: `src-tauri/src/lib.rs` — `find_poe2_process()`

Read `/proc/<pid>/comm` for fast filtering (check for "PathOfExileSte" or "PathOfExile.ex"). Fall back to `/proc/<pid>/cmdline` for verification.

```rust
use std::fs;
fn find_poe2_process() -> Option<u32> {
    for entry in fs::read_dir("/proc").ok()? {
        let entry = entry.ok()?;
        let name = entry.file_name();
        let pid: u32 = name.to_str()?.parse().ok()?;
        let comm = fs::read_to_string(entry.path().join("comm")).ok()?;
        let lower = comm.to_ascii_lowercase();
        if lower.contains("pathofexilesteam") || lower.contains("pathofexile") {
            return Some(pid);
        }
    }
    None
}
```

### 3. Foreground Window Detection

File: `src-tauri/src/lib.rs` — `foreground_window_is_poe2()`

Query X11 `_NET_ACTIVE_WINDOW` on the root window, resolve the window's `_NET_WM_PID` property, compare against cached PoE2 PID.

XCB approach (preferred — no binary deps):

```rust
use xcb::xproto;

fn foreground_window_is_poe2() -> bool {
    let (running, pid) = get_poe2_pid_cache();
    if !running || pid == 0 { return false; }
    
    let (conn, _) = xcb::Connection::connect(None).ok()?;
    let root = conn.get_setup().roots().next()?.root();
    
    // Get _NET_ACTIVE_WINDOW atom
    let atom_cookie = conn.send_request(&xcb::xproto::InternAtom {
        only_if_exists: true,
        name_len: "_NET_ACTIVE_WINDOW".len() as u16,
        name: "_NET_ACTIVE_WINDOW".as_bytes(),
    });
    let atom_reply = conn.wait_for_reply(atom_cookie).ok()?;
    
    // Read active window ID
    let prop_cookie = conn.send_request(&xcb::xproto::GetProperty {
        window: root,
        property: atom_reply.atom(),
        r#type: xcb::xproto::Atom::WINDOW,
        delete: false,
        long_offset: 0,
        long_length: 1,
    });
    let prop_reply = conn.wait_for_reply(prop_cookie).ok()?;
    let active_window = /* extract u32 from prop_reply */;
    
    // Get _NET_WM_PID of active window
    // ...intern atom, get property, compare PID
    // Returns: foreground_pid == pid
}
```

Simpler approach: use `xcb` crate (already transitive via `rdev`). Or shell out to `xdotool getactivewindow getwindowpid`.

### 4. Active Window Title

File: `src-tauri/src/lib.rs` — `active_window_title()`

Same XCB approach — read `_NET_WM_NAME` or `WM_NAME` from the active window.

### 5. Path Conventions

| Current (Windows) | Linux Equivalent |
|-------------------|-----------------|
| `%LOCALAPPDATA%\Reliquary\` | `$XDG_DATA_HOME/Reliquary/` or `~/.local/share/Reliquary/` |
| `%TEMP%\Reliquary\` | `$XDG_RUNTIME_DIR/Reliquary/` or `/tmp/Reliquary/` |

Files affected:
- `debug_log.rs:28-34` — log path
- `lib.rs:2293-2300` — world_areas cache path

## Caveats

### Wayland

`rdev` does not support native Wayland for global keyboard hooks or `simulate()`.
XWayland provides full compatibility for most users.

If native Wayland support becomes critical:
- Keyboard hooks: `libei` protocol (upstream `rdev` issue)
- Clipboard: `arboard` 3.x already supports Wayland natively

### Dependencies

No new crate dependencies needed:
- `xcb` or `x11` crate is already a transitive dependency via `rdev`
- `/proc` filesystem is always available on Linux (no crate needed)

## Estimated Effort

| Task | Lines | Time |
|------|:-----:|------|
| Client.txt paths | ~15 | 20 min |
| Process detection (`/proc`) | ~30 | 30 min |
| Foreground window (X11) | ~20 | 45 min |
| Active window title (X11) | ~25 | 45 min |
| Path conventions | ~10 | 15 min |
| Build config + test | ~5 | 30 min |
| **Total** | **~108** | **~3h** |

## Notes

### System Tray / Taskbar Hiding

- **Windows**: `skipTaskbar: true` + tray-icon feature (Tauri v2 `tray-icon`). Tray menu: Show/Hide/Quit.
- **Linux**: Tauri `tray-icon` works on most DEs (GNOME requires AppIndicator extension, KDE/XFCE work natively). `skipTaskbar: true` behavior varies by compositor — on X11 with EWMH-compliant WM it sets `_NET_WM_STATE_SKIP_TASKBAR`. On Wayland, depends on the compositor's implementation.
| **Total** | **~108** | **~3h** |
