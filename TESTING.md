# Lumen-Scan Live Testing Checklist

Use this checklist for the first real PoE2 validation pass.

## Preflight

1. Build the app with `npm run tauri:build`.
2. Launch `src-tauri/target/release/kalandra-lumen-scan.exe`.
3. Confirm the parchment/gold overlay appears and stays above other windows.
4. Confirm the only visible surface is the compact HUD/card area, not a full-screen dark rectangle.
5. Confirm the league selector loads the official PoE2 trade leagues and defaults to the current softcore challenge league.
6. Open the Data tab and confirm PoE2DB data leagues render separately from official trade leagues.
7. Confirm idle memory is reasonable. A local no-game smoke sample was about 29.5 MB working set.
8. If price checking fails, run `src-tauri\target\release\kalandra-lumen-scan.exe debug-log --tail 40` and inspect the latest `price_check.search.response` or `price_check.fetch.response` entry.
9. Change the price currency selector in the Scan tab and confirm listing rows refresh with PoE2DB currency icons and normalized values.

## PoE2 Session Test

1. Start Path of Exile 2 and enter a character.
2. Confirm the overlay does not block normal game clicks outside the visible HUD card.
3. Drag the expanded header, press `Line`, drag the one-line strip, then press `Open` to restore.
4. Hover a rare or magic item and press `Ctrl+C`.
5. Confirm the Scan tab updates with item name, base type, item level, sockets/spirit when present, and Waystone hazard state.
6. Confirm the price checker changes from loading to matched listings or a clear error.
7. Confirm listings show price, item level, and listed timestamp; click a row and verify it opens the official trade source URL.
8. Press `Alt+D` after a successful scan.
9. Confirm the browser opens an official PoE2 trade page with URL shape `https://www.pathofexile.com/trade2/search/poe2/{league}?q=...` and that the search form is populated rather than landing on an empty/base trade page.
10. Confirm the clipboard contains the local item search summary.
11. Send or receive a trade whisper and confirm the Trade tab adds a buyer card.
12. Test Invite, Trade, and Kick only when safe; these buttons simulate chat commands.

## Known Areas To Validate Carefully

- Marketplace handoff opens the official marketplace page with a browser query and prepares local clipboard search context.
- Price checking currently uses an isolated community-style trade transport for real-time listing rows. Before release, grep runtime code for `api/trade2/search` and `api/trade2/fetch`; matches should stay confined to the dedicated price-check transport.
- League selection matters for every price check. Current official trade leagues are challenge softcore, challenge hardcore, `Standard`, and `Hardcore`; SSF is intentionally absent because it has no trade economy.
- Set `LUMEN_POE2_LEAGUE` before launch only when you need to force a specific startup league for testing.
- The league listener refreshes every 15 minutes. PoE2DB may show a future league before official trade supports it; those rows are data signals, not selectable trade targets until the official trade endpoint exposes them.
- Debug logs include copied item text and trade request JSON. Use them for local troubleshooting, but do not paste them publicly if the copied item text is sensitive.
- Currency normalization uses live official trade2 exchange offers first. If those calls fail, listing rows still show raw prices and the log records `currency.exchange.error`.
- Global hotkeys may require OS-level accessibility/input permissions on some systems.
