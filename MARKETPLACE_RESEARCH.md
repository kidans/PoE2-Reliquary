# Marketplace Implementation Research

This note captures the marketplace transport decision for Reliquary so future work does not drift into hidden official trade API calls without an explicit product decision.

## Decision

Reliquary now uses a pragmatic split: browser handoff remains available, while the Ctrl+C price checker uses an isolated community-style trade transport for real-time matched listings. The transport should stay narrow and swappable so it can become a separate CLI process without changing the overlay contract.

- The app may parse copied item text locally and prepare a search payload or clipboard summary.
- The app may open the official PoE2 trade website for the configured league with a `?q=<JSON>` browser query.
- The price-check transport may POST to `api/trade2/search` and GET `api/trade2/fetch`, matching the community approach used by Exiled Exchange 2.
- Currency normalization may POST to `api/trade2/exchange` for live exchange offers. This is the same real-time market surface used by the official bulk exchange page; poe.ninja remains a fallback/reference source when live exchange data is unavailable.
- Those calls should remain isolated in the price-check transport layer, not scattered through UI code.
- The intended endpoint is still a CLI-compatible contract: copied item plus filters in, matched listings out.

## Exiled Exchange 2 Findings

Reference: <https://github.com/Kvan7/Exiled-Exchange-2>

Exiled Exchange 2 is useful as a design reference for item parsing, filter creation, grouping, and rate-limit awareness, but its live listing implementation is not compatible with our no-direct-API runtime goal.

Observed implementation shape:

- `renderer/src/web/price-check/trade/pathofexile-trade.ts` builds a trade request, then posts to `/api/trade2/search/{league}`.
- It follows that search id by fetching listing payloads from `/api/trade2/fetch/{ids}?query={queryId}`.
- `main/src/proxy.ts` provides an Electron proxy that forwards requests to allowlisted hosts, including `www.pathofexile.com`, with session cookies.
- `renderer/src/web/price-check/trade/common.ts` adapts client rate limiters from `x-rate-limit-*` response headers.
- Some UI links also construct official browser URLs with `?q=<JSON trade request>`, which is useful for handoff-style searches.

What to borrow conceptually:

- Trade request/filter shape.
- Item parser and modifier/category mapping ideas.
- Rate-limit state display ideas if we ever expose diagnostic status.
- Browser URL handoff pattern.

What not to copy broadly into Reliquary runtime:

- In-app proxying of official trade API requests.
- Hidden fetch loops outside the dedicated price-check transport.
- UI-level fetch calls.

## Printing Press Findings

Reference: <https://github.com/mvanhorn/cli-printing-press>

Printing Press can help with CLI structure, browser traffic discovery, HAR analysis, generated command ergonomics, MCP/CLI packaging ideas, and verification discipline. It is not a magic no-API marketplace backend.

Relevant capabilities:

- It can generate CLIs from OpenAPI specs.
- It can import HAR captures with `--har`.
- It can run browser-sniff discovery against websites and reverse-engineer replayable HTTP surfaces.
- It emits agent-friendly Go CLIs and MCP servers with verification scaffolding.

Boundary for our project:

- Browser-sniff/HAR generation is likely to discover the official trade API endpoints, because that is how the official web app gets live listings.
- If we use Printing Press naively, it will tend to generate a CLI wrapper around those HTTP surfaces, which violates our no-direct-API runtime rule.
- Printing Press is still useful for producing a companion CLI shell, command conventions, local cache scaffolding, and verification checklists.
- For live listings, the current implementation follows the community API-backed pattern in an isolated Rust module.
- Printing Press may still be useful as the generator for a future community-compatible CLI wrapper around this same contract.

## Proposed Marketplace Phases

1. Keep `Alt+D` browser handoff as the safe baseline: copy local summary and open the official marketplace page.
2. Generate a browser URL query payload where safe, using Exiled Exchange 2's `?q=<JSON>` link style as a reference.
3. Add source-of-truth CLI feeds for poe.ninja exchange rates and PoE2DB item metadata before ranking prices.
4. Expand Ctrl+C price check filters to include Exiled Exchange style stat IDs, pseudo mods, tiers, and min/max bounds.
5. Move the current in-process price-check transport behind a CLI command once the contract stabilizes.
6. Add rate-limit state display and backoff behavior before calling the price checker production-ready.

## Source-of-Truth Feeds

- poe.ninja PoE2 Economy: <https://poe.ninja/poe2/economy/>
  - Role: current exchange rates and market-normalized value comparisons.
  - CLI target: a cacheable command that returns compact JSON exchange rates.
- PoE2DB: <https://poe2db.tw/us/>
  - Role: accurate item descriptions, base metadata, gems, modifiers, and mechanics reference data.
  - CLI target: item/base lookup commands that enrich copied item text before trade query creation.
  - League-listener role: early league/item discovery, because PoE2DB can expose upcoming league pages before official trade leagues are available.
  - Currency-icon role: provide stable currency icon URLs for listing rows and selectors.

## Test Guardrails

- Grep app runtime code for `api/trade2/search`, `api/trade2/fetch`, and direct HTTP clients before release; matches should be confined to the dedicated price-check transport and tests.
- Verify `Alt+D` opens `https://www.pathofexile.com/trade2/search/poe2/{league}?q=...` or a resolved search page, not an API URL.
- Test with PoE2 running before claiming marketplace behavior is complete.
