# Shared Market Board Implementation Plan

1. Add a pure TypeScript market-board model for feed validation, ranking, persistence, baseline messaging, and incremental row limits.
2. Add Vitest coverage for default Trade routing, persisted routing, honest baseline states, adaptive ranking, and continuation thresholds.
3. Add a resilient GitHub Pages feed client with per-league/per-period local caching.
4. Integrate Market Board into the existing Trade sidebar and render winners/losers with icons, confidence, timestamps, and incremental loading.
5. Add the scheduled Node collector and GitHub Pages workflow for all exchange and unique categories.
6. Update CSP, run TypeScript/Rust tests and builds, refresh graphify, then visually verify the local Trade tab.
7. Publish a dependency-free GitHub Pages product site with a functional copy of the Market Board and deploy it beside the shared JSON feed.
