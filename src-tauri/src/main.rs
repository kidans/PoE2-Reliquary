fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    hide_console_on_normal_launch(args.is_empty());

    if matches!(
        args.first().map(String::as_str),
        Some("sources" | "source-truth")
    ) {
        if let Err(error) = reliquary_core::source_truth::print_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    if matches!(
        args.first().map(String::as_str),
        Some("leagues" | "league-feeds")
    ) {
        if let Err(error) = reliquary_core::source_truth::print_leagues_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    if matches!(
        args.first().map(String::as_str),
        Some("families" | "item-families" | "taxonomy")
    ) {
        if let Err(error) = reliquary_core::source_truth::print_item_families_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    if matches!(
        args.first().map(String::as_str),
        Some("tiers" | "mod-tiers" | "poe2db-tiers")
    ) {
        if let Err(error) = reliquary_core::source_truth::print_mod_tiers_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    if matches!(
        args.first().map(String::as_str),
        Some("poe2db-cache" | "source-cache" | "source-truth-cache")
    ) {
        if let Err(error) = reliquary_core::source_truth::print_poe2db_snapshot_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    if matches!(args.first().map(String::as_str), Some("debug-log" | "log")) {
        if let Err(error) = reliquary_core::debug_log::print_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    reliquary_core::run();
}

#[cfg(windows)]
fn hide_console_on_normal_launch(should_hide: bool) {
    if !should_hide {
        return;
    }

    unsafe {
        let console = windows_sys::Win32::System::Console::GetConsoleWindow();
        if !console.is_null() {
            windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                console,
                windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE,
            );
        }
    }
}

#[cfg(not(windows))]
fn hide_console_on_normal_launch(_should_hide: bool) {}
