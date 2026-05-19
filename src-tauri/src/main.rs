fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if matches!(
        args.first().map(String::as_str),
        Some("sources" | "source-truth")
    ) {
        if let Err(error) = kalandra_lumen_scan::source_truth::print_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    if matches!(
        args.first().map(String::as_str),
        Some("leagues" | "league-feeds")
    ) {
        if let Err(error) = kalandra_lumen_scan::source_truth::print_leagues_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    if matches!(
        args.first().map(String::as_str),
        Some("families" | "item-families" | "taxonomy")
    ) {
        if let Err(error) = kalandra_lumen_scan::source_truth::print_item_families_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    if matches!(args.first().map(String::as_str), Some("debug-log" | "log")) {
        if let Err(error) = kalandra_lumen_scan::debug_log::print_cli(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    kalandra_lumen_scan::run();
}
