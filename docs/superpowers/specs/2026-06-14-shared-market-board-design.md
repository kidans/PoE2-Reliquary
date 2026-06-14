# Shared Market Board Design

## Goal

Add a stock-market-style landing view to Trade that compares PoE.ninja snapshots without requiring every Reliquary user to keep the app open. The board covers exchange categories and unique-item feeds, includes item icons, and is explicit when a historical baseline is still being built.

## Product Behavior

- Market Board is the default Trade sub-view when no previous sub-view is stored.
- The last selected Trade sub-view is restored on later launches.
- `1D` is the default period; `30M` and `7D` are also available.
- Winners and losers render side by side, initially showing ten rows each.
- Additional rows load in groups of ten, but only when they pass the adaptive relevance threshold.
- Empty or incomplete baselines show collection progress instead of provisional rankings.
- The displayed refresh time is the dataset timestamp, not an assumed exact GitHub schedule.

## Ranking

- Compare the same league, category, and item identifier at two valid positive prices.
- Exclude new items, missing baselines, zero movement, and low-confidence liquidity.
- Normalize absolute movement within each category using median absolute movement and MAD so volatile unique categories do not drown out stable currency.
- Weight normalized movement by liquidity confidence.
- Exchange liquidity uses `volumePrimaryValue`; unique feeds use `listingCount`.
- The first ten rows use every valid positive or negative mover. Rows after ten must also clear the adaptive relevance threshold.

## Shared Feed

- A scheduled GitHub Action collects PoE.ninja snapshots approximately every 30 minutes.
- The generated GitHub Pages artifact retains rolling history and publishes compact period datasets.
- The app fetches the selected league/period dataset and caches the last valid response locally.
- The collector retains actual timestamps because Actions and upstream refreshes can be delayed.

## Public Product Page

- GitHub Pages publishes a real Reliquary product page at the repository root and the machine-readable feed under `/market-feed/`.
- The product page embeds the same Market Board data used by the desktop app, with league and period controls, icons, honest baseline states, and incremental rows.
- Product copy links to the latest GitHub release and documents Scan, Atlas, Temple, and Trade without replacing the repository README.
- The site and feed deploy as one immutable Pages artifact so the application never points at a separately managed service.

## Failure Behavior

- Network failure falls back to the last valid local dataset.
- A missing feed produces an honest unavailable state.
- A new league shows baseline progress until enough shared history exists.
- No synthetic or extrapolated price movements are shown.
