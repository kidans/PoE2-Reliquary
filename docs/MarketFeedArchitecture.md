# Reliquary Market Feed

Supabase is the authoritative shared economy service. GitHub Pages is a daily
disaster-recovery feed and the product-site host.

## Live flow

1. Supabase Cron invokes `collect-market` at minute 3 and 33 of every hour.
2. The collector acquires a database advisory lock and refuses another run
   within 25 minutes.
3. PoE.ninja exchange and unique feeds are normalized into Divine Orb values.
4. Rolling snapshots are retained for eight days.
5. Precomputed `30m`, `1d`, and `7d` boards are stored in `market_boards`.
6. `market-feed` serves public, cacheable JSON with CORS enabled.
7. Reliquary tries Supabase first, then GitHub Pages, then its last valid local
   cache.

## Endpoints

- Manifest: `https://tzxclvrmmptvqhzobgse.supabase.co/functions/v1/market-feed?manifest=1`
- Board: `https://tzxclvrmmptvqhzobgse.supabase.co/functions/v1/market-feed?league=Runes%20of%20Aldur&period=30m`

## Operations

- Project: `tzxclvrmmptvqhzobgse` (`kidans's Project`, Seoul)
- Schema and cron live in `supabase/migrations/`.
- Edge Functions live in `supabase/functions/`.
- Collector health is recorded in `public.market_collector_state`.
- Cron execution history is available in `cron.job_run_details`.
- The collector secret is generated inside the private database schema and is
  never stored in git or sent to desktop clients.

## Deployment

```powershell
npx supabase link --project-ref tzxclvrmmptvqhzobgse
npx supabase db push --linked
npx supabase functions deploy collect-market market-feed --project-ref tzxclvrmmptvqhzobgse --no-verify-jwt --use-api
```

Do not expose the service-role key or the private collector configuration.
