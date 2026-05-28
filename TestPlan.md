# Kalandra Unit Testing Plan

Comprehensive audit of existing test coverage and recommended additions. Generated 2026-05-28.

---

## Test Count Summary

| Area | Test File | # Tests | Framework |
|------|-----------|---------|-----------|
| Evaluate (pricing/tiers) | `src/evaluate.test.ts` | 31 | Vitest |
| Temple Engine | `src/temple-engine.test.ts` | 34 | Vitest |
| Exchange Routing | `src-tauri/src/exchange.rs` | 8 | Rust #[test] |
| Price Check Backend | `src-tauri/src/price_check.rs` | 14 | Rust #[test] |
| Trade Search/URLs | `src-tauri/src/trade_search.rs` | 4 | Rust #[test] |
| Item Parsing | `src-tauri/src/item_parser.rs` | 9 | Rust #[test] |
| Source Truth (PoE2DB) | `src-tauri/src/source_truth.rs` | 8 | Rust #[test] |
| Hazards | `src-tauri/src/hazards.rs` | 1 | Rust #[test] |
| Whispers | `src-tauri/src/whispers.rs` | 1 | Rust #[test] |
| **Total** | | **110** | |

All other source files (`main.ts`, `temple-view.ts`, `lib.rs`, `macros.rs`, `debug_log.rs`) have zero unit tests.

---

## 1. What Is Already Covered

### 1.1 Evaluate / Price-Check Frontend (`src/evaluate.test.ts`)

- **Filter signatures** (`activeFilterSignature`): sorts filters, normalizes numeric values to 3 decimals. (lines 204-222)
- **Profile defaults** (`profileSpecKeySet`): quick profile selects high-impact explicit mods, base profile keeps item level and implicits/enchants. (lines 238-263)
- **Listing matching** (`listingMatchesSelectedPriceOption`, `filteredListings`): respects selected price option (exalted/divine/both), keeps rows with matching selected specs, removes rows failing backend-applied structural hard specs. (lines 266-312)
- **PoE2DB tier matching** (`resolveTierMatch`, `specTemplate`): normalizes inline actual-roll ranges, resolves copied wide-range mods to trusted tier bands, uses tier bands for exact/broad filters, resolves essence and desecrated source bands as ranges. (lines 315-486)
- **Empty roll_bands** (`resolveTierMatch`): returns match when template matches but roll_bands are empty (PoE2DB scraping gap), prefers tiers with populated roll_bands. (lines 489-590)
- **Source kind priority** (`resolveTierMatch`): prefers `normal` over `repoe` when both match, falls through to `repoe` when no normal match exists. (lines 592-678)
- **Hard/score classification** (`classifySelectedSpecForSearch`): classifies stats with tier bands as hard, explicit mods without tier bands as score, item_level/quality/sockets as hard, required_level as score, implicits/runes/desecrated as hard, special modifiers with known source bands as hard. (lines 681-793)
- **Hard filter routing** (`hardPriceFiltersForSelection`): sends only hard filters, sends every selected hard explicit, keeps base implicit category hints when tier data missing. (lines 796-849)
- **Soft listing ranking** (`rankListings`, `filteredListings`, `filteredListingRanks`): ranks by selected spec match count, shows partial matches with penalties, hides rows with no explicit overlap, keeps partial rows with at least one overlap. (lines 852-1021)

### 1.2 Temple Engine (`src/temple-engine.test.ts`)

- **Temple data integrity** (lines 27-45): placeable rooms list is complete, mechanic-created rooms excluded from palette.
- **Grid & layout** (lines 48-76): 9x9 diamond grid, start tile at (4,8), Atziri endpoint above (4,0), isometric coordinates.
- **Room placement** (lines 78-96): places rooms, recalculates summary, connects Atziri endpoint to reachable rooms at (4,0).
- **Placement validation** (lines 98-166): Architect/Reward Room anywhere, rejects floating placement, rejects illegal neighbors, preserves connectivity, protects locked start cell, Synthflesh Lab single-Garrison constraint, asymmetric Synthflesh-Commander chain validation.
- **Tier upgrades** (lines 186-264): Garrison adjacency upgrades from Commander/Armoury, Commander upgrades from adjacent Garrison-family rooms, Synthflesh/Spymaster Garrison transformations, non-energy upgrade paths, Thaumaturge only upgrades from sacrifice neighbors, serialization round-trip.
- **Generator mechanics** (lines 268-320): powers eligible rooms +1 tier, stacks two generators for +2, combines adjacency + generator, stops propagation at consuming rooms.
- **Modifier targeting** (lines 322-375): Spymaster/Golem Works/Thaumaturge target rooms, apply only to their targeted room effects.
- **Diminishing returns** (lines 377-433): first 3 duplicates full value, 4th=90%, 5th=81%, buffing rooms exempt, unreachable rooms ignored.
- **Destabilization** (lines 446-549): budget calculation with bonuses, deterministic seeded simulation, bridge room protection, locked room handling, skipped attempts, restore after serialize/parse.

### 1.3 Exchange Routing (`src-tauri/src/exchange.rs`)

- **category_id_for_item** (line 887): maps Omen to ritual category. (line 892): maps runes and soul cores.
- **is_exchange_item** (lines 900-917): charms stay in scan/price-check, gear with exchange-like words stays in price-check.
- **League slug** (line 920): `league_slug("Fate of the Vaal")` -> `"vaal"`, HC variant.
- **Incursion category** (line 926): present but unavailable.
- **Sparkline sanitizer** (line 932): fills nulls with previous value.
- **URL absolutization** (line 940): prepends `https://web.poecdn.com`.

### 1.4 Price Check Backend (`src-tauri/src/price_check.rs`)

- **build_trade_request** (lines 2450-2488): type and item level filters in query JSON.
- **filters_for_item** (lines 2490-2517): creates editable filter rows from item stats.
- **Trade stat routing** (lines 2519-2670): clicked explicit filters added to query with stat IDs, tier band filters send min+max, `matching_trade_stat` prefers official category, essence-sourced mods match explicit stats.
- **Source kind routing** (lines 2673-2725): `source_kind_hint` routes implicit stats to implicit category.
- **Formatting** (lines 2727-2732): `format_price` keeps small currency values visible.
- **Exchange mode** (lines 2734-2762): exchange items skip trade search, show cached category overview.
- **Cache key** (lines 2764-2822): order-insensitive key generation.
- **Listing construction** (lines 2824-2878): direct listing URL, tier info from extended mods by category/name, omits ambiguous matches, matches rune/desecrated categories without crosswire.

### 1.5 Trade Search (`src-tauri/src/trade_search.rs`)

- **Landing URL** (line 178): correct POE2 marketplace shape.
- **Clipboard summary** (line 188): builds summary without API call.
- **Query URL** (line 214): builds query URL with type, no API endpoint references.
- **Exchange bypass** (line 244): does not build trade query for exchange-mode items.

### 1.6 Item Parser (`src-tauri/src/item_parser.rs`)

- **Core fields** (line 407): parses rarity, family, item_class, name, base_type, item_level, explicit mods for waystones.
- **Spirit & sockets** (line 438): extracts spirit and socket count.
- **Unique items** (line 458): keeps unique name separate from base type, filters "Requires:" lines.
- **Unique modifiers** (line 473): keeps charge/shock modifier lines, excludes flavor text.
- **Flasks** (line 490): classifies as flask, keeps only real modifiers, excludes "Recovers"/"Consumes"/"Currently has"/"Right Click to".
- **Gems** (line 538): keeps gem properties out of explicit mods (Level/Mana Cost/Cast Time in property_lines).
- **Stackable currency** (line 575): classifies as currency, uses name as base_type.
- **Charms** (line 601): classifies as charm, keeps trigger properties, excludes auto-text.
- **Belts** (line 645): treats charm slots as property not explicit mod.

### 1.7 Source Truth (`src-tauri/src/source_truth.rs`)

- **League parsing** (line 2189): parses PoE2DB table rows and home highlight.
- **Item class classification** (line 2212): maps Belts->belt, Charms->charm, Tablet->tablet, Currency Stackable Currency->currency, Talismans->weapon.
- **Family manifest** (line 2224): exposes manifest entries for CLI.
- **Mod tier parsing** (line 2232): parses classic table rows with tags and weights.
- **ModsView payload parsing** (line 2257): parses normal/socketable/desecrated tiers from ModsView JSON payload, verifies prefix/suffix affix detection.
- **Tier quality summary** (line 2304): counts total/empty/normal_affix/non_affix tiers.
- **Modifier slug discovery** (line 2359): parses modifier pages from PoE2DB index, deduplicates.
- **Snapshot serialization** (line 2380): round-trips versioned snapshot JSON.

### 1.8 Hazards (`src-tauri/src/hazards.rs`)

- **Hazard matching** (line 41): returns matching banned modifiers via normalized substring match.

### 1.9 Whispers (`src-tauri/src/whispers.rs`)

- **Whisper parsing** (line 42): parses trade whisper with stash tab coordinates.

---

## 2. Gaps Identified

### 2.1 UI Utility Functions -- `src/main.ts` -- ZERO tests

These are all pure functions embedded in `main.ts` (not exported from a separate module) and completely untested:

| Function | Line | Type | Risk without tests |
|----------|------|------|-------------------|
| `escapeHtml()` | 3383 | Pure | XSS vulnerability if broken |
| `escapeAttribute()` | 3396 | Pure | Attribute injection |
| `formatCompactNumber()` | 3365 | Pure | Broken number formatting in trade UI |
| `formatCampaignTime()` | 2912 | Pure | Wrong timer display |
| `formatTimestamp()` | 2614 | Pure | Wrong "last updated" display |
| `formatListed()` | 4658 | Pure | Wrong listing age display |
| `shortSeller()` | 3375 | Pure | Truncation edge cases |
| `clampNumber()` | 3400 | Pure | NaN/infinite number handling |
| `remapCampaignAct()` | 1009 | Pure | GGG added Act 6 -- needs regression test |
| `normalizeZoneName()` | 437 | Pure | Zone matching for campaign timer |
| `rewardColor()` | 991 | Pure | Tag-dependent color logic |
| `actDisplayName()` | 1004 | Pure | Act 5 "Interlude" logic |

### 2.2 Campaign Timer Logic -- `src/main.ts` -- ZERO tests

- `normalizeZoneName()` -- zone normalization for matching across area transitions (line 437)
- `remapCampaignAct()` -- act remapping (Act 6->5, etc.) -- history of bugs (line 1009)
- Zone time accumulation logic (inlines in main.ts, not extractable as pure function currently)
- Map run tracking (purely UI-driven, but the data model has no tests)
- Campaign progress persistence (localStorage key management -- untested)

### 2.3 Hotkey Shortcut Normalization -- `src/lib.rs` -- ZERO tests

| Function | Line | Type |
|----------|------|------|
| `normalize_shortcut_key()` | 521 | Pure |
| `normalize_shortcut_modifier()` | 533 | Pure |

These handle user input validation for hotkey configuration. Edge cases: empty strings, multi-character input, non-ASCII, non-alphanumeric keys.

### 2.4 Exchange Routing -- `src/exchange.rs` -- Partial coverage

Tested: `category_id_for_item`, `is_exchange_item`, `absolutize_url`, `sanitize_sparkline`, `league_slug`, `category_by_id` (via incursion test).

**Not directly unit-tested** (or only implicitly via integration):
- `categories()` -- returns full manifest; trivial but untested
- `default_tab_state()` -- trivial
- `loading_tab_state_for_item()` -- has branching: exchange_category_id present vs absent
- `price_check_from_tab_state()` -- converts ExchangeTabState to PriceCheck; complex data mapping
- `select_entry_for_item()` (private) -- fuzzy matching logic for exchange entries, high-risk
- `category_id_for_item()` -- only tested for Omen, Rune, Soul Core; many other categories untested

### 2.5 Source Truth -- `src/source_truth.rs` -- Edge-case gaps

Tested: most parsing functions have at least one happy-path test.

**Gaps:**
- `parse_poe2db_mod_tiers()` -- malformed HTML (en-dash vs em-dash entity), missing columns, empty td
- `parse_poe2db_leagues()` -- no home-highlight match case, missing fields
- `parse_poe2db_modifier_slugs()` -- URLs without `#ModifiersCalc` suffix, relative hrefs
- `classify_item_class()` -- unknown item classes fall through to "" catch-all -- untested
- `summarize_mod_tier_quality()` -- empty pages edge case
- `normalized_item_family_manifest()` -- verify all entries have non-empty family/class_matches

### 2.6 Price Check Backend -- `src/price_check.rs` -- Moderate gaps

Tested: `build_trade_request`, `filters_for_item`, `format_price`, `listing_from_fetch_result`, `price_check_cache_key`, `matching_trade_stat`

**Not directly tested:**
- `check_item_price()` -- async orchestration with branching (exchange mode vs normal, error path)
- `loading()` -- only tested for exchange mode (line 2734); gear path untested
- `refresh_cached_price_check()` -- async, hard to unit test
- `load_more_price_check_results()` -- async pagination
- `create_search_item_level_filter()` (private) -- item_level filter JSON construction
- `create_item_level_filter()` (private) -- UI filter row construction
- `create_price_filter_for_modifier()` (private) -- stat ID lookups with fallback
- `listing_from_fetch_result()` -- null account, null indexed, missing extended data, multiple currency entries

### 2.7 Temple -- `src/temple-engine.ts` -- Well-tested but some blind spots

**Functions with no direct test:**
- `getTempleCellByKey()` -- only used internally; null key handling
- `templeCellsConnect()` -- underlying adjacency check
- `templeCellConnectsToAtziriEndpoint()` -- (4,0) cell specific
- `describeUpgradeRule()` -- human-readable description generation
- `calculateTempleGeneratorRanges()` -- tested implicitly via recalculate
- `calculateTempleReachability()` -- tested implicitly via recalculate
- `resolveTempleTransformations()` -- tested implicitly via recalculate

### 2.8 Temple View -- `src/temple-view.ts` -- ZERO tests

- `renderTemplePanel()` -- complex HTML template rendering. Hard to unit test meaningfully without DOM emulation. Low priority.

### 2.9 Untestable (by design) -- Noted for completeness

| Module | Why untestable |
|--------|---------------|
| `macros.rs` | Uses `enigo` for OS-level keyboard injection |
| `debug_log.rs` | Global mutable state + filesystem I/O |
| `lib.rs` Tauri commands | Require Tauri runtime (window, app_handle, state) |
| `lib.rs` `run()` | Application entry point, creates windows |
| `lib.rs` input listener | OS-level `rdev` hook |
| Single-instance plugin | Tauri plugin registration |
| `main.ts` DOM manipulation | Requires browser DOM -- candidate for component/E2E testing later |

---

## 3. Recommended New Test Files

### 3.1 `src/utils.test.ts` -- P0

Extract pure utility functions into a separate `src/utils.ts` module, then test:

```typescript
// escapeHtml
- escapes all five HTML entities (&, <, >, ", ')
- returns unchanged string with no special characters
- handles empty string
- does not double-escape already-escaped entities (or documents that it does)

// escapeAttribute
- escapes backticks in addition to HTML entities
- delegates to escapeHtml

// formatCompactNumber
- formats numbers >= 1000 with SI prefix (1 decimal)
- formats numbers < 10 with 1 decimal
- formats numbers 10-999 with 0 decimals
- handles 0
- handles negatives

// formatCampaignTime
- formats seconds-only: "0:00" through "9:59"
- formats minutes-and-seconds: "10:00" through "59:59"
- formats hours: "1:00:00" through "99:59:59"
- handles 0ms -> "0:00"

// formatListed
- seconds < 3600 -> "<1h"
- hours range -> "Nh"
- days range -> "Nd"
- months range -> "Nmo"
- years range -> "Ny"
- invalid date string -> returns original string

// shortSeller
- returns seller as-is when <= 14 chars
- truncates and appends "..." when > 14 chars
- handles empty string

// clampNumber
- clamps value within [min, max]
- returns fallback for NaN, Infinity, -Infinity
- returns fallback for non-finite values
- handles exact boundary values

// remapCampaignAct  <-- CRITICAL (known bug history)
- act 1-5 pass through unchanged
- act 6 remaps to 5
- act 0 returns 0
- negative acts return 0
- act 7+ returns 0

// normalizeZoneName
- lowercases
- strips leading "the "
- strips trailing "map", "hideout", "frag/..." suffixes
- collapses non-alphanumeric sequences to single space
- preserves numbers
- handles empty string

// rewardColor
- skill-point tag returns green/something
- ascendancy tag returns specific color
- spirit tag returns specific color
- unknown tags return default color
- null reward returns default color
```

### 3.2 `src-tauri/src/lib_utils.rs` -- P1

Extract pure utility functions from `lib.rs`, then test:

```rust
// normalize_shortcut_key
- single ASCII letter -> uppercase
- single ASCII digit -> as-is
- non-alphanumeric -> fallback
- empty string -> fallback
- multi-character string -> first char only

// normalize_shortcut_modifier
- "Ctrl" -> "Ctrl"
- "Alt" -> "Alt"
- "ctrl" (lowercase) -> fallback (case-sensitive)
- empty string -> fallback
- arbitrary string -> fallback
```

### 3.3 Additional Rust tests in existing files -- P1

**`src-tauri/src/exchange.rs`:**
```rust
// category_id_for_item
- all EXCHANGE_CATEGORY_MANIFEST item_class entries route correctly
- currency + "Currency" item_class maps to "runes"
- currency + "Soul Core" maps to "soul-cores"
- currency + "Omen" maps to "ritual"
- unknown item_class returns None
- item with no item_class returns None

// is_exchange_item
- all explicit currency/omen names match
- gear items with "rune"/"soul" in name do not match
- charms never match
- waystones never match
- empty name returns false

// loading_tab_state_for_item
- item with exchange_category_id set uses it directly
- item without exchange_category_id falls through to category_id_for_item
- item without any category match defaults to "currency"

// price_check_from_tab_state
- converts overview entries to PriceListing array
- handles empty overview
- handles overview with null entries
- maps price via received/paid/pay/sparkline
```

**`src-tauri/src/price_check.rs`:**
```rust
// listing_from_fetch_result
- null account -> seller "Unknown"
- null indexed -> handles gracefully
- missing extended data -> mod_tier_infos all None
- preview fields populated from item data
- currency conversion via rates applied

// check_item_price (refactor branch logic for testability)
- exchange-mode items return loading state immediately
- normal items proceed to request_price_check

// filters_for_item
- item with no explicit_mods still gets type_filters
- unique items get the unique implicit stat filter
- item_level included when present, omitted when None
- quality included when present
- sockets included when present
```

**`src-tauri/src/source_truth.rs`:**
```rust
// parse_poe2db_mod_tiers edge cases
- missing tier column -> skip row
- empty text column -> skip row
- HTML with en-dash entity in mod-value spans
- missing mod-value spans -> no roll_bands
- unaffiliated source_kind (not normal/repoe/socketable/desecrated)

// classify_item_class
- None -> "" (fallback)
- unknown class -> "" (fallback)
- class with prefix match (e.g. "One Hand Axes" Swords subcategory)

// summarize_mod_tier_quality
- zero pages -> all zeros
```


### 3.4 `src/evaluate.test.ts` -- P2 additions

These are already well-covered but a few edge cases are missing:

```typescript
// resolveTierMatch
- mod text with no matching template in any page -> null
- matching template but value outside all roll_bands -> returns template-only match
- multiple pages with same slug by different source_kind -> correct priority

// itemSpecs
- empty explicit_mods array
- mods with only special characters
- very long mod labels

// priceProfileLabel
- unknown profile ID -> graceful fallback

// rankListings
- empty listings array -> empty rankings
- all listings fail all specs -> all negative scores
```

### 3.5 Campaign Timer -- `src/campaign.test.ts` -- P2

Extract campaign logic into its own module, then test:

```typescript
// normalizeZoneName (if moved to shared utils)
// remapCampaignAct (if moved to shared utils)  

// Campaign data loading
- guideData JSON parses correctly
- all acts have non-empty zones
- all steps have required fields (text, zone, index)
- acts 1-4 are sequential, act 5 is the interlude

// Zone time tracking (extract as pure function)
- entering a new zone records entry time
- leaving a zone accumulates elapsed time
- same zone revisited continues accumulating
```

---

## 4. Priority Order

### P0 -- Release-Critical (should exist before next release)

| File | Test | Reason |
|------|------|--------|
| `utils.test.ts` | `escapeHtml` | XSS regression could inject into the overlay |
| `utils.test.ts` | `escapeAttribute` | Attribute injection in href/src |
| `utils.test.ts` | `remapCampaignAct` | Documented history of Act 6 bugs; hotfix at line 429 in main.ts |
| `utils.test.ts` | `normalizeZoneName` | Zone matching breaks campaign timer silently |
| `evaluate.test.ts` | `resolveTierMatch` null/no-match path | Returns null for unrecognized mods -- nil-check needed everywhere |
| `exchange.rs` | `category_id_for_item` remaining categories | Incorrect routing sends items to wrong exchange endpoint |
| `exchange.rs` | `is_exchange_item` edge names | "Soul Core Talisman" must NOT route to exchange |

### P1 -- Important (covers core logic with moderate risk)

| File | Test | Reason |
|------|------|--------|
| `utils.test.ts` | `formatCampaignTime` | User-facing timer; wrong format undermines trust |
| `utils.test.ts` | `formatListed` | Listing age display; wrong threshold = misleading |
| `utils.test.ts` | `formatCompactNumber` | Price display; localisation-dependent |
| `utils.test.ts` | `clampNumber` | Input sanitisation; NaN/Infinity must not crash |
| `lib_utils.rs` | `normalize_shortcut_key` | Hotkey registration; empty/multi-char edge cases |
| `lib_utils.rs` | `normalize_shortcut_modifier` | Modifier validation; case-sensitivity matters |
| `exchange.rs` | `price_check_from_tab_state` | Complex data mapping; silent data loss possible |
| `price_check.rs` | `listing_from_fetch_result` null fields | Missing API fields cause listing display bugs |
| `source_truth.rs` | `parse_poe2db_mod_tiers` malformed HTML | PoE2DB formatting changes break scraping silently |
| `source_truth.rs` | `classify_item_class` unknown classes | New item classes after league launch route to wrong family |

### P2 -- Nice-to-Have (improves confidence, low immediate risk)

| File | Test | Reason |
|------|------|--------|
| `utils.test.ts` | `shortSeller`, `rewardColor`, `actDisplayName` | Simple pure functions; low bug probability |
| `utils.test.ts` | `formatTimestamp` | Date formatting; unlikely to break |
| `evaluate.test.ts` | Edge cases (empty mods, long labels) | Main paths already covered |
| `campaign.test.ts` | Guide data validation, zone time model | Structural testing of JSON data and zone tracking |
| `temple-engine.test.ts` | `describeUpgradeRule`, direct `templeCellsConnect` | Indirectly covered; low risk |
| `temple-view.test.ts` | `renderTemplePanel` snapshot | DOM rendering; high effort, low value |
| Component/E2E tests | Overlay interaction, hotkey triggers | Requires browser/OS automation; separate initiative |

---

## 5. Implementation Notes

### 5.1 Refactoring Required

To make P0/P1 items testable, the following refactors are needed **before** writing tests:

1. **`src/utils.ts`** -- Extract pure functions from `main.ts`:
   - `escapeHtml`, `escapeAttribute`
   - `formatCompactNumber`, `formatCampaignTime`, `formatTimestamp`, `formatListed`
   - `shortSeller`, `clampNumber`
   - `remapCampaignAct`, `normalizeZoneName`
   - `rewardColor`, `actDisplayName`
   - Re-export them so `main.ts` imports from `utils.ts`

2. **`src-tauri/src/lib_utils.rs`** -- Extract pure functions from `lib.rs`:
   - `normalize_shortcut_key`
   - `normalize_shortcut_modifier`

3. **`src/campaign.ts`** -- Extract campaign logic from `main.ts`:
   - `remapCampaignAct` (can live in utils.ts)
   - `normalizeZoneName` (can live in utils.ts)
   - Zone time tracking model (new pure module)

### 5.2 Test Infrastructure

- TypeScript: Vitest is already configured. Add `src/utils.test.ts` and `src/campaign.test.ts`.
- Rust: `cargo test` works for `#[test]` blocks. No additional dependencies needed.
- No mocking frameworks required for pure function tests.

### 5.3 Files with NO test coverage (by design)

These contain only OS-level I/O, Tauri runtime dependencies, or DOM manipulation:

- `src/main.ts` -- DOM rendering + Tauri bridge (utility functions should be extracted)
- `src-tauri/src/lib.rs` -- Tauri commands (utility functions should be extracted)
- `src-tauri/src/macros.rs` -- `enigo` keyboard injection
- `src-tauri/src/debug_log.rs` -- filesystem append

---

## 6. Summary

| Category | Current Tests | Recommended New Tests | Coverage After |
|----------|---------------|----------------------|----------------|
| Evaluate/Pricing | 31 | +3 | 34 |
| Temple Engine | 34 | +2 | 36 |
| Exchange Routing | 8 | +10 | 18 |
| Price Check Backend | 14 | +8 | 22 |
| Trade Search | 4 | 0 (adequate) | 4 |
| Item Parser | 9 | 0 (adequate) | 9 |
| Source Truth | 8 | +5 | 13 |
| Hazards | 1 | 0 (adequate) | 1 |
| Whispers | 1 | 0 (adequate) | 1 |
| UI Utilities | **0** | **+18** | 18 |
| Hotkey Norm. | **0** | **+6** | 6 |
| Campaign Timer | **0** | **+8** | 8 |
| **Total** | **110** | **+60** | **170** |

Biggest gap: UI utility functions and campaign timer logic (0 out of 26 functions tested). These are the highest-risk untested areas because they are pure logic embedded in a rendering file, making them invisible to the test suite despite being critical to correctness.