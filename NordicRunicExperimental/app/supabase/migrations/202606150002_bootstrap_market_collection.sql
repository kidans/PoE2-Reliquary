do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'reliquary-market-bootstrap';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule(
  'reliquary-market-bootstrap',
  '* * * * *',
  $bootstrap$
    select net.http_post(
      url := 'https://tzxclvrmmptvqhzobgse.supabase.co/functions/v1/collect-market',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-collector-secret', (
          select collector_secret
          from private.market_collector_config
          where singleton = true
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    select cron.unschedule('reliquary-market-bootstrap');
  $bootstrap$
);
