use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

use crate::{
    debug_log, ActivePriceFilter, CurrencyMeta, Item, PriceCheck, PriceFilter,
    PriceListing, TradeLeague, TradeRateLimit,
};

const DEFAULT_LEAGUE: &str = "Standard";
const DEFAULT_PRICE_CURRENCY: &str = "exalted";
const DEFAULT_PRICE_OPTION: &str = "equivalent";
const PRICE_OPTION_EQUIVALENT: &str = "equivalent";
const PRICE_OPTION_EXALTED_DIVINE: &str = "exalted_divine";
const TRADE_WEB_BASE: &str = "https://www.pathofexile.com/trade2/search/poe2";
const TRADE_API_BASE: &str = "https://www.pathofexile.com/api/trade2";
const TRADE_STATIC_URL: &str = "https://www.pathofexile.com/api/trade2/data/static";
const TRADE_CDN_BASE: &str = "https://www.pathofexile.com";
const POE2DB_CURRENCY_URL: &str = "https://poe2db.tw/us/Currency";
const TRADE_STATS_URL: &str = "https://www.pathofexile.com/api/trade2/data/stats";
const MAX_LISTINGS: usize = 50;
const MAX_FETCH_BATCH: usize = 10;
const INITIAL_FETCH_COUNT: usize = 10;
const MAX_EXCHANGE_CURRENCIES_PER_REQUEST: usize = 10;
const PRICE_CHECK_CACHE_TTL: Duration = Duration::from_secs(10);
const CURRENCY_META_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
const EXCHANGE_RATES_CACHE_TTL: Duration = Duration::from_secs(60);

static NUMBER_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?P<number>-?\d+(?:\.\d+)?)").expect("valid number regex"));
static INLINE_ROLL_RANGE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(-?\d+(?:\.\d+)?)(?:\s*\(\s*-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?\s*\))")
        .expect("valid inline roll range regex")
});
static TIER_HINT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\(tier:\s*(?P<tier>\d+)\)").expect("valid tier regex"));
static POE2DB_CURRENCY_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?s)<li><img[^>]+src=['"](?P<icon>[^'"]+)['"][^>]*>\s*<a[^>]+href=['"](?P<slug>[^'"]+)['"][^>]*>(?P<name>.*?)</a>"#,
    )
    .expect("valid PoE2DB currency regex")
});

static COMMON_CURRENCIES: &[(&str, &str, &str)] = &[
    ("exalted", "Exalted Orb", "Exalted_Orb"),
    ("divine", "Divine Orb", "Divine_Orb"),
    ("regal", "Regal Orb", "Regal_Orb"),
    ("transmute", "Orb of Transmutation", "Orb_of_Transmutation"),
    ("chaos", "Chaos Orb", "Chaos_Orb"),
    ("vaal", "Vaal Orb", "Vaal_Orb"),
    ("alch", "Orb of Alchemy", "Orb_of_Alchemy"),
    ("annul", "Orb of Annulment", "Orb_of_Annulment"),
    ("chance", "Orb of Chance", "Orb_of_Chance"),
    ("aug", "Orb of Augmentation", "Orb_of_Augmentation"),
    ("mirror", "Mirror of Kalandra", "Mirror_of_Kalandra"),
];

static PRICE_CHECK_CACHE: Lazy<Mutex<HashMap<String, CachedPriceCheck>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static TRADE_STATS_CACHE: Lazy<Mutex<Option<Vec<TradeStatEntry>>>> = Lazy::new(|| Mutex::new(None));
static CURRENCY_META_CACHE: Lazy<Mutex<Option<CachedCurrencyMeta>>> =
    Lazy::new(|| Mutex::new(None));
static EXCHANGE_RATES_CACHE: Lazy<Mutex<HashMap<String, CachedCurrencyRates>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
const PRICE_CHECK_CACHE_SCHEMA_VERSION: u8 = 2;

#[derive(Debug, Clone)]
struct CachedPriceCheck {
    result: PriceCheck,
    continuation: Option<PriceCheckContinuation>,
    fetched_at_epoch_ms: u64,
}

#[derive(Debug, Clone)]
struct CachedCurrencyMeta {
    currencies: Vec<CurrencyMeta>,
    fetched_at_epoch_ms: u64,
}

#[derive(Debug, Clone)]
struct CachedCurrencyRates {
    rates: CurrencyRates,
    fetched_at_epoch_ms: u64,
}

#[derive(Debug, Clone)]
struct TradeApiError {
    message: String,
    rate_limit: Option<TradeRateLimit>,
}

#[derive(Debug, Clone)]
pub(crate) struct PriceCheckOutcome {
    pub(crate) price_check: PriceCheck,
    pub(crate) continuation: Option<PriceCheckContinuation>,
}

#[derive(Debug, Clone)]
pub(crate) struct PriceCheckContinuation {
    pub(crate) request_key: String,
    pub(crate) league: String,
    pub(crate) search_id: String,
    pub(crate) source_url: String,
    pub(crate) remaining_result_ids: Vec<String>,
    pub(crate) selected_currency: String,
    pub(crate) selected_price_option: String,
    pub(crate) currencies: Vec<CurrencyMeta>,
    pub(crate) rates: CurrencyRates,
}

pub async fn fetch_trade_leagues() -> Result<Vec<TradeLeague>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 league-loader")
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(format!("{TRADE_API_BASE}/data/leagues"))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<TradeLeagueResponse>()
        .await
        .map_err(|error| error.to_string())?;

    Ok(response
        .result
        .into_iter()
        .filter(|league| league.realm.as_deref() == Some("poe2"))
        .map(|league| TradeLeague {
            id: league.id,
            text: league.text,
        })
        .collect())
}

pub fn loading(item: &Item) -> PriceCheck {
    if uses_exchange_mode(item) {
        return PriceCheck {
            status: "Routing exchange-style item into the cached category overview...".to_string(),
            matched: 0,
            source_url: item.trade_url.clone(),
            selected_currency: DEFAULT_PRICE_CURRENCY.to_string(),
            selected_price_option: DEFAULT_PRICE_OPTION.to_string(),
            rate_source: None,
            rate_limit: None,
            currencies: default_currency_meta(),
            filters: Vec::new(),
            requested_filters: Vec::new(),
            applied_filters: Vec::new(),
            listings: Vec::new(),
            error: None,
        };
    }

    PriceCheck {
        status: "Checking matched listings...".to_string(),
        matched: 0,
        source_url: item.trade_url.clone(),
        selected_currency: DEFAULT_PRICE_CURRENCY.to_string(),
        selected_price_option: DEFAULT_PRICE_OPTION.to_string(),
        rate_source: None,
        rate_limit: None,
        currencies: default_currency_meta(),
        filters: filters_for_item(item),
        requested_filters: Vec::new(),
        applied_filters: Vec::new(),
        listings: Vec::new(),
        error: None,
    }
}

pub async fn check_item_price(
    item: &Item,
    league: Option<&str>,
    selected_currency: Option<&str>,
    selected_price_option: Option<&str>,
    active_filters: &[ActivePriceFilter],
) -> PriceCheckOutcome {
    let league = normalized_league(league);
    let selected_currency = normalized_price_currency(selected_currency);
    let selected_price_option = normalized_price_option(selected_price_option);
    let filters = filters_for_item(item);

    if uses_exchange_mode(item) {
        return PriceCheckOutcome {
            price_check: PriceCheck {
                status: "Routing exchange-style item into the cached category overview..."
                    .to_string(),
                matched: 0,
                source_url: item.trade_url.clone(),
                selected_currency: selected_currency.to_string(),
                selected_price_option: selected_price_option.to_string(),
                rate_source: None,
                rate_limit: None,
                currencies: default_currency_meta(),
                filters: Vec::new(),
                requested_filters: Vec::new(),
                applied_filters: Vec::new(),
                listings: Vec::new(),
                error: None,
            },
            continuation: None,
        };
    }

    match request_price_check(
        item,
        league,
        selected_currency,
        selected_price_option,
        active_filters,
        filters.clone(),
    )
    .await
    {
        Ok(mut outcome) => {
            outcome.price_check.filters = filters;
            outcome
        }
        Err(error) => PriceCheckOutcome {
            price_check: PriceCheck {
                status: "Price check failed".to_string(),
                matched: 0,
                source_url: item.trade_url.clone(),
                selected_currency: selected_currency.to_string(),
                selected_price_option: selected_price_option.to_string(),
                rate_source: None,
                rate_limit: error.rate_limit,
                currencies: default_currency_meta(),
                filters,
                requested_filters: active_filters.to_vec(),
                applied_filters: Vec::new(),
                listings: Vec::new(),
                error: Some(error.message),
            },
            continuation: None,
        },
    }
}

fn uses_exchange_mode(item: &Item) -> bool {
    item.is_exchange
}

async fn request_price_check(
    item: &Item,
    league: &str,
    selected_currency: &str,
    selected_price_option: &str,
    active_filters: &[ActivePriceFilter],
    filters: Vec<PriceFilter>,
) -> Result<PriceCheckOutcome, TradeApiError> {
    let stats = fetch_trade_stats().await.unwrap_or_else(|error| {
        debug_log::append(
            "price_check.stats.error",
            json!({
                "error": error,
            }),
        );
        Vec::new()
    });
    let applied_filters = applied_price_filters(active_filters, &stats);
    let cache_key = price_check_cache_key(
        item,
        league,
        selected_currency,
        selected_price_option,
        &applied_filters,
    )
    .map_err(|message| TradeApiError {
        message,
        rate_limit: None,
    })?;
    if let Some(cached) = cached_price_check(&cache_key).await {
        debug_log::append(
            "price_check.cache.hit",
            json!({
                "league": league,
                "selected_currency": selected_currency,
                "selected_price_option": selected_price_option,
                "cache_key": cache_key,
                "matched": cached.price_check.matched,
            }),
        );
        return Ok(cached);
    }

    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 price-check")
        .build()
        .map_err(|error| TradeApiError {
            message: error.to_string(),
            rate_limit: None,
        })?;
    let request = build_trade_request(item, selected_price_option, &applied_filters, &stats);
    let currencies = fetch_currency_meta().await.unwrap_or_else(|error| {
        debug_log::append(
            "currency.meta.error",
            json!({
                "error": error,
            }),
        );
        default_currency_meta()
    });
    let rates = fetch_exchange_rates(league, selected_currency)
        .await
        .unwrap_or_else(|error| {
            debug_log::append(
                "currency.exchange.error",
                json!({
                    "league": league,
                    "selected_currency": selected_currency,
                    "selected_price_option": selected_price_option,
                    "error": error,
                }),
            );
            CurrencyRates::empty(selected_currency)
        });
    let search_url = format!(
        "{TRADE_API_BASE}/search/poe2/{}",
        urlencoding::encode(league)
    );

    debug_log::append(
        "price_check.search.request",
        json!({
            "league": league,
            "url": search_url,
            "item": item_diagnostic_payload(item),
            "selected_currency": selected_currency,
            "selected_price_option": selected_price_option,
            "active_filters": filter_diagnostics(active_filters),
            "applied_filters": filter_diagnostics(&applied_filters),
            "request_hash": hash_json_value(&request),
            "cache_key_hash": hash_text(&cache_key),
        }),
    );

    let search_started = Instant::now();
    let search_response = client
        .post(search_url)
        .json(&request)
        .send()
        .await
        .map_err(|error| TradeApiError {
            message: logged_transport_error("price_check.search.transport_error", error),
            rate_limit: None,
        })?;
    let (search, mut rate_limit) = parse_json_response::<TradeSearchResponse>(
        "price_check.search.response",
        search_response,
        search_started,
    )
    .await?;
    debug_log::append(
        "price_check.search.parsed",
        json!({
            "league": league,
            "search_id_hash": hash_text(&search.id),
            "result_count": search.result.len(),
            "total": search.total,
            "rate_limit": rate_limit,
            "cache_key_hash": hash_text(&cache_key),
        }),
    );

    let source_url = format!(
        "{TRADE_WEB_BASE}/{}/{}",
        urlencoding::encode(league),
        search.id
    );

    let result_ids = search
        .result
        .iter()
        .take(MAX_LISTINGS)
        .cloned()
        .collect::<Vec<_>>();

    if result_ids.is_empty() {
        let price_check = PriceCheck {
            status: "No matched listings found".to_string(),
            matched: search.total.unwrap_or(0),
            source_url: Some(source_url),
            selected_currency: selected_currency.to_string(),
            selected_price_option: selected_price_option.to_string(),
            rate_source: Some(rates.source.clone()),
            rate_limit,
            currencies,
            filters,
            requested_filters: active_filters.to_vec(),
            applied_filters: applied_filters.clone(),
            listings: Vec::new(),
            error: None,
        };
        let outcome = PriceCheckOutcome {
            price_check,
            continuation: None,
        };

        cache_price_check(&cache_key, &outcome).await;

        return Ok(outcome);
    }

    let initial_result_ids = result_ids
        .iter()
        .take(INITIAL_FETCH_COUNT)
        .cloned()
        .collect::<Vec<_>>();
    let remaining_result_ids = result_ids
        .iter()
        .skip(INITIAL_FETCH_COUNT)
        .cloned()
        .collect::<Vec<_>>();

    let (fetched_results, fetch_rate_limit) =
        fetch_trade_results(&client, league, &search.id, &initial_result_ids).await?;
    rate_limit = merge_rate_limits(rate_limit, fetch_rate_limit);

    let listings = fetched_results
        .into_iter()
        .flatten()
        .filter_map(|result| listing_from_fetch_result(result, &source_url, &currencies, &rates))
        .collect::<Vec<_>>();

    let price_check = PriceCheck {
        status: format!(
            "Matched {} listings",
            search.total.unwrap_or(listings.len())
        ),
        matched: search.total.unwrap_or(listings.len()),
        source_url: Some(source_url.clone()),
        selected_currency: selected_currency.to_string(),
        selected_price_option: selected_price_option.to_string(),
        rate_source: Some(rates.source.clone()),
        rate_limit,
        currencies: currencies.clone(),
        filters,
        requested_filters: active_filters.to_vec(),
        applied_filters: applied_filters.clone(),
        listings,
        error: None,
    };
    let continuation = (!remaining_result_ids.is_empty()).then(|| PriceCheckContinuation {
        request_key: cache_key.clone(),
        league: league.to_string(),
        search_id: search.id,
        source_url: source_url.clone(),
        remaining_result_ids,
        selected_currency: selected_currency.to_string(),
        selected_price_option: selected_price_option.to_string(),
        currencies: currencies.clone(),
        rates: rates.clone(),
    });
    let outcome = PriceCheckOutcome {
        price_check,
        continuation,
    };

    cache_price_check(&cache_key, &outcome).await;

    Ok(outcome)
}

async fn cached_price_check(cache_key: &str) -> Option<PriceCheckOutcome> {
    let cache = PRICE_CHECK_CACHE.lock().await;
    let cached = cache.get(cache_key)?;
    let age = now_epoch_ms().saturating_sub(cached.fetched_at_epoch_ms);
    (age < PRICE_CHECK_CACHE_TTL.as_millis() as u64).then(|| PriceCheckOutcome {
        price_check: cached.result.clone(),
        continuation: cached.continuation.clone(),
    })
}

async fn cache_price_check(cache_key: &str, outcome: &PriceCheckOutcome) {
    PRICE_CHECK_CACHE.lock().await.insert(
        cache_key.to_string(),
        CachedPriceCheck {
            result: outcome.price_check.clone(),
            continuation: outcome.continuation.clone(),
            fetched_at_epoch_ms: now_epoch_ms(),
        },
    );
}

pub async fn refresh_cached_price_check(cache_key: &str, outcome: &PriceCheckOutcome) {
    cache_price_check(cache_key, outcome).await;
}

async fn fetch_trade_results(
    client: &reqwest::Client,
    league: &str,
    search_id: &str,
    result_ids: &[String],
) -> Result<(Vec<Option<FetchResult>>, Option<TradeRateLimit>), TradeApiError> {
    let mut combined = Vec::new();
    let mut rate_limit = None;

    for (batch_index, batch) in result_ids.chunks(MAX_FETCH_BATCH).enumerate() {
        let fetch_url = format!(
            "{TRADE_API_BASE}/fetch/{}?query={search_id}",
            batch.join(",")
        );

        debug_log::append(
            "price_check.fetch.request",
            json!({
                "league": league,
                "url": fetch_url,
                "search_id": search_id,
                "result_count": batch.len(),
                "batch_index": batch_index,
            }),
        );

        let fetch_started = Instant::now();
        let fetch_response = client
            .get(fetch_url)
            .send()
            .await
            .map_err(|error| TradeApiError {
                message: logged_transport_error("price_check.fetch.transport_error", error),
                rate_limit: None,
            })?;
        let (fetched, batch_rate_limit) = parse_json_response::<TradeFetchResponse>(
            "price_check.fetch.response",
            fetch_response,
            fetch_started,
        )
        .await?;
        rate_limit = merge_rate_limits(rate_limit, batch_rate_limit);
        debug_log::append(
            "price_check.fetch.parsed",
            json!({
                "league": league,
                "search_id_hash": hash_text(search_id),
                "result_count": fetched.result.len(),
                "batch_index": batch_index,
                "rate_limit": rate_limit,
            }),
        );

        combined.extend(fetched.result);
    }

    Ok((combined, rate_limit))
}

pub async fn load_more_price_check_results(
    continuation: PriceCheckContinuation,
) -> Result<PriceCheckOutcome, String> {
    if continuation.remaining_result_ids.is_empty() {
        return Ok(PriceCheckOutcome {
            price_check: PriceCheck {
                status: "Matched 0 listings".to_string(),
                matched: 0,
                source_url: Some(continuation.source_url.clone()),
                selected_currency: continuation.selected_currency.clone(),
                selected_price_option: continuation.selected_price_option.clone(),
                rate_source: Some(continuation.rates.source.clone()),
                rate_limit: None,
                currencies: continuation.currencies.clone(),
                filters: Vec::new(),
                requested_filters: Vec::new(),
                applied_filters: Vec::new(),
                listings: Vec::new(),
                error: None,
            },
            continuation: None,
        });
    }

    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 price-check")
        .build()
        .map_err(|error| error.to_string())?;

    let batch_ids = continuation
        .remaining_result_ids
        .iter()
        .take(MAX_FETCH_BATCH)
        .cloned()
        .collect::<Vec<_>>();
    let pending_ids = continuation
        .remaining_result_ids
        .iter()
        .skip(MAX_FETCH_BATCH)
        .cloned()
        .collect::<Vec<_>>();

    let (fetched_results, rate_limit) = fetch_trade_results(
        &client,
        &continuation.league,
        &continuation.search_id,
        &batch_ids,
    )
    .await
    .map_err(|error| error.message)?;

    let listings = fetched_results
        .into_iter()
        .flatten()
        .filter_map(|result| {
            listing_from_fetch_result(
                result,
                &continuation.source_url,
                &continuation.currencies,
                &continuation.rates,
            )
        })
        .collect::<Vec<_>>();

    Ok(PriceCheckOutcome {
        price_check: PriceCheck {
            status: format!("Loaded {} more listings", listings.len()),
            matched: 0,
            source_url: Some(continuation.source_url.clone()),
            selected_currency: continuation.selected_currency.clone(),
            selected_price_option: continuation.selected_price_option.clone(),
            rate_source: Some(continuation.rates.source.clone()),
            rate_limit,
            currencies: continuation.currencies.clone(),
            filters: Vec::new(),
            requested_filters: Vec::new(),
            applied_filters: Vec::new(),
            listings,
            error: None,
        },
        continuation: (!pending_ids.is_empty()).then(|| PriceCheckContinuation {
            remaining_result_ids: pending_ids,
            ..continuation
        }),
    })
}

async fn parse_json_response<T: serde::de::DeserializeOwned>(
    event: &str,
    response: reqwest::Response,
    started: Instant,
) -> Result<(T, Option<TradeRateLimit>), TradeApiError> {
    let status = response.status();
    let url = response.url().to_string();
    let rate_limit = parse_trade_rate_limit(response.headers());
    let body = response.text().await.map_err(|error| TradeApiError {
        message: error.to_string(),
        rate_limit: rate_limit.clone(),
    })?;

    debug_log::append(
        event,
        json!({
            "status": status.as_u16(),
            "url": url,
            "endpoint": endpoint_label(&url),
            "elapsed_ms": started.elapsed().as_millis(),
            "body_len": body.len(),
            "body_hash": hash_text(&body),
            "body_kind": response_body_kind(&body),
            "rate_limit": rate_limit,
        }),
    );

    if !status.is_success() {
        return Err(TradeApiError {
            message: trade_http_error_message(endpoint_label(&url), status, &body),
            rate_limit,
        });
    }

    serde_json::from_str(&body)
        .map(|parsed| (parsed, rate_limit))
        .map_err(|error| {
            debug_log::append(
                "price_check.response.parse_error",
                json!({
                    "url": url,
                    "status": status.as_u16(),
                    "endpoint": endpoint_label(&url),
                    "error": error.to_string(),
                    "body_len": body.len(),
                    "body_hash": hash_text(&body),
                    "body_kind": response_body_kind(&body),
                }),
            );
            TradeApiError {
                message: error.to_string(),
                rate_limit: None,
            }
        })
}

fn logged_transport_error(event: &str, error: reqwest::Error) -> String {
    debug_log::append(
        event,
        json!({
            "url": error.url().map(|url| url.to_string()),
            "error": error.to_string(),
        }),
    );
    error.to_string()
}

fn item_diagnostic_payload(item: &Item) -> serde_json::Value {
    json!({
        "name": item.name,
        "rarity": item.rarity,
        "item_class": item.item_class,
        "base_type": item.base_type,
        "item_level": item.item_level,
        "sockets": item.sockets,
        "spirit": item.spirit,
        "explicit_mod_count": item.explicit_mods.len(),
        "raw_text_hash": hash_text(&item.raw_text),
        "raw_text_len": item.raw_text.len(),
    })
}

fn filter_diagnostics(filters: &[ActivePriceFilter]) -> Vec<serde_json::Value> {
    filters
        .iter()
        .map(|filter| {
            json!({
                "kind": filter.kind,
                "template": filter.template,
                "value": filter.value,
                "min": filter.min,
                "max": filter.max,
                "tier": filter.tier,
                "affix": filter.affix,
                "source": filter.source,
            })
        })
        .collect()
}

fn response_body_kind(body: &str) -> &'static str {
    let trimmed = body.trim_start();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        "json"
    } else if trimmed.starts_with("<!DOCTYPE")
        || trimmed.starts_with("<html")
        || trimmed.starts_with("<HTML")
    {
        "html"
    } else if trimmed.is_empty() {
        "empty"
    } else {
        "text"
    }
}

fn hash_json_value(value: &serde_json::Value) -> String {
    hash_text(&value.to_string())
}

fn hash_text(value: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn endpoint_label(url: &str) -> &str {
    if url.contains("/search/") {
        "search"
    } else if url.contains("/fetch/") {
        "fetch"
    } else {
        "request"
    }
}

fn concise_body(body: &str) -> String {
    const MAX_BODY_LENGTH: usize = 420;
    let one_line = body.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.len() <= MAX_BODY_LENGTH {
        one_line
    } else {
        format!("{}...", &one_line[..MAX_BODY_LENGTH])
    }
}

fn trade_http_error_message(endpoint: &str, status: reqwest::StatusCode, body: &str) -> String {
    let reason = status
        .canonical_reason()
        .map(|reason| format!(" {reason}"))
        .unwrap_or_default();

    if status.as_u16() == 429 {
        return format!(
            "trade2 {endpoint} is rate limited (HTTP {}{reason}). Keeping the last fetched listings; wait for the usage bar to cool down before retrying.",
            status.as_u16()
        );
    }

    if looks_like_html(body) {
        return format!(
            "trade2 {endpoint} was rejected by the official trade edge (HTTP {}{reason}). Keeping the last fetched listings; try fewer modifiers or refresh in a moment.",
            status.as_u16()
        );
    }

    format!(
        "trade2 {endpoint} failed with HTTP {}{reason}: {}",
        status.as_u16(),
        concise_body(body)
    )
}

fn looks_like_html(body: &str) -> bool {
    let trimmed = body.trim_start().to_ascii_lowercase();
    trimmed.starts_with("<!doctype html")
        || trimmed.starts_with("<html")
        || trimmed.contains("<body")
        || trimmed.contains("<script")
}

fn parse_trade_rate_limit(headers: &reqwest::header::HeaderMap) -> Option<TradeRateLimit> {
    let policy = header_string(headers, "x-rate-limit-policy");
    let rules = header_string(headers, "x-rate-limit-rules")
        .map(|value| {
            value
                .split(',')
                .map(|rule| rule.trim().to_ascii_lowercase())
                .filter(|rule| !rule.is_empty())
                .collect::<Vec<_>>()
        })
        .filter(|rules| !rules.is_empty())
        .unwrap_or_else(|| vec!["account".to_string(), "ip".to_string()]);
    let retry_after_seconds =
        header_string(headers, "retry-after").and_then(|value| value.parse::<u32>().ok());

    let mut best = None;
    for scope in rules {
        let limit_header = format!("x-rate-limit-{scope}");
        let state_header = format!("x-rate-limit-{scope}-state");
        let Some(limit_value) = header_string(headers, &limit_header) else {
            continue;
        };
        let Some(state_value) = header_string(headers, &state_header) else {
            continue;
        };

        if let Some(candidate) = rate_limit_from_headers(
            policy.clone(),
            scope,
            &limit_value,
            &state_value,
            retry_after_seconds,
        ) {
            best = merge_rate_limits(best, Some(candidate));
        }
    }

    best.or_else(|| {
        retry_after_seconds.map(|retry_after_seconds| TradeRateLimit {
            policy,
            scope: "unknown".to_string(),
            current_hits: None,
            limit: None,
            interval_seconds: None,
            usage_ratio: 1.0,
            active_timeout_seconds: Some(retry_after_seconds),
            retry_after_seconds: Some(retry_after_seconds),
        })
    })
}

fn rate_limit_from_headers(
    policy: Option<String>,
    scope: String,
    limits: &str,
    states: &str,
    retry_after_seconds: Option<u32>,
) -> Option<TradeRateLimit> {
    let limit_rules = limits
        .split(',')
        .filter_map(parse_rate_limit_rule)
        .collect::<Vec<_>>();
    let state_rules = states
        .split(',')
        .filter_map(parse_rate_limit_state)
        .collect::<Vec<_>>();

    let mut best = None;
    for (limit_rule, state_rule) in limit_rules.iter().zip(state_rules.iter()) {
        let usage_ratio = if limit_rule.limit == 0 {
            0.0
        } else {
            state_rule.hits as f64 / limit_rule.limit as f64
        };

        let candidate = TradeRateLimit {
            policy: policy.clone(),
            scope: scope.clone(),
            current_hits: Some(state_rule.hits),
            limit: Some(limit_rule.limit),
            interval_seconds: Some(limit_rule.interval_seconds),
            usage_ratio: usage_ratio.clamp(0.0, 1.0),
            active_timeout_seconds: Some(state_rule.active_timeout_seconds),
            retry_after_seconds,
        };
        best = merge_rate_limits(best, Some(candidate));
    }

    best
}

fn merge_rate_limits(
    current: Option<TradeRateLimit>,
    next: Option<TradeRateLimit>,
) -> Option<TradeRateLimit> {
    match (current, next) {
        (None, None) => None,
        (Some(current), None) => Some(current),
        (None, Some(next)) => Some(next),
        (Some(current), Some(next)) => {
            let current_timeout = current.active_timeout_seconds.unwrap_or(0);
            let next_timeout = next.active_timeout_seconds.unwrap_or(0);

            if next_timeout > current_timeout
                || (next_timeout == current_timeout && next.usage_ratio > current.usage_ratio)
            {
                Some(next)
            } else {
                Some(current)
            }
        }
    }
}

fn header_string(headers: &reqwest::header::HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn parse_rate_limit_rule(segment: &str) -> Option<RateLimitRule> {
    let mut pieces = segment.trim().split(':');
    Some(RateLimitRule {
        limit: pieces.next()?.trim().parse().ok()?,
        interval_seconds: pieces.next()?.trim().parse().ok()?,
        _timeout_seconds: pieces.next()?.trim().parse().ok()?,
    })
}

fn parse_rate_limit_state(segment: &str) -> Option<RateLimitState> {
    let mut pieces = segment.trim().split(':');
    Some(RateLimitState {
        hits: pieces.next()?.trim().parse().ok()?,
        _interval_seconds: pieces.next()?.trim().parse().ok()?,
        active_timeout_seconds: pieces.next()?.trim().parse().ok()?,
    })
}

#[derive(Debug, Clone, Copy)]
struct RateLimitRule {
    limit: u32,
    interval_seconds: u32,
    _timeout_seconds: u32,
}

#[derive(Debug, Clone, Copy)]
struct RateLimitState {
    hits: u32,
    _interval_seconds: u32,
    active_timeout_seconds: u32,
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn price_check_cache_key(
    item: &Item,
    league: &str,
    selected_currency: &str,
    selected_price_option: &str,
    active_filters: &[ActivePriceFilter],
) -> Result<String, String> {
    let mut canonical_filters = active_filters.to_vec();
    canonical_filters.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then(left.template.cmp(&right.template))
            .then(left.label.cmp(&right.label))
            .then(left.tier.cmp(&right.tier))
            .then_with(|| {
                left.value
                    .partial_cmp(&right.value)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| {
                left.min
                    .partial_cmp(&right.min)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| {
                left.max
                    .partial_cmp(&right.max)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    serde_json::to_string(&json!({
        "version": PRICE_CHECK_CACHE_SCHEMA_VERSION,
        "league": league.to_ascii_lowercase(),
        "selected_currency": selected_currency.to_ascii_lowercase(),
        "selected_price_option": selected_price_option.to_ascii_lowercase(),
        "item": item.raw_text.trim(),
        "filters": canonical_filters,
    }))
    .map_err(|error| error.to_string())
}

fn build_trade_request(
    item: &Item,
    selected_price_option: &str,
    active_filters: &[ActivePriceFilter],
    stats: &[TradeStatEntry],
) -> serde_json::Value {
    let mut query = json!({
        "status": { "option": "securable" },
        "stats": [{ "type": "and", "filters": [] }],
        "filters": {}
    });

    if let Some(base_type) = item.base_type.as_deref() {
        query["type"] = json!(base_type);
    }

    if item.rarity.eq_ignore_ascii_case("unique") {
        query["name"] = json!(item.name);
    }

    query["filters"] = build_trade_filters(selected_price_option, active_filters);
    query["stats"][0]["filters"] = json!(build_stat_filters(active_filters, stats));

    json!({
        "query": query,
        "sort": { "price": "asc" }
    })
}

fn build_trade_filters(
    selected_price_option: &str,
    active_filters: &[ActivePriceFilter],
) -> serde_json::Value {
    let mut filters = json!({});

    if let Some(price_option) = trade_price_option_for_request(selected_price_option) {
        filters["trade_filters"]["filters"]["price"]["option"] = json!(price_option);
    }

    for filter in active_filters {
        let Some(value) = filter.min.or(filter.value) else {
            continue;
        };

        match filter.kind.as_str() {
            "item_level" => {
                filters["type_filters"]["filters"]["ilvl"]["min"] = json!(value);
                if let Some(max) = filter.max {
                    filters["type_filters"]["filters"]["ilvl"]["max"] = json!(max);
                }
            }
            "quality" => {
                filters["type_filters"]["filters"]["quality"]["min"] = json!(value);
                if let Some(max) = filter.max {
                    filters["type_filters"]["filters"]["quality"]["max"] = json!(max);
                }
            }
            "required_level" => {
                filters["req_filters"]["filters"]["lvl"]["min"] = json!(value);
                if let Some(max) = filter.max {
                    filters["req_filters"]["filters"]["lvl"]["max"] = json!(max);
                }
            }
            "armour" => {
                filters["equipment_filters"]["filters"]["ar"]["min"] = json!(value);
                if let Some(max) = filter.max {
                    filters["equipment_filters"]["filters"]["ar"]["max"] = json!(max);
                }
            }
            "evasion" => {
                filters["equipment_filters"]["filters"]["ev"]["min"] = json!(value);
                if let Some(max) = filter.max {
                    filters["equipment_filters"]["filters"]["ev"]["max"] = json!(max);
                }
            }
            "energy_shield" => {
                filters["equipment_filters"]["filters"]["es"]["min"] = json!(value);
                if let Some(max) = filter.max {
                    filters["equipment_filters"]["filters"]["es"]["max"] = json!(max);
                }
            }
            _ => {}
        }
    }

    filters
}

fn applied_price_filters(
    active_filters: &[ActivePriceFilter],
    stats: &[TradeStatEntry],
) -> Vec<ActivePriceFilter> {
    active_filters
        .iter()
        .filter(|filter| filter_is_searchable(filter, stats))
        .cloned()
        .collect()
}

fn filter_is_searchable(filter: &ActivePriceFilter, stats: &[TradeStatEntry]) -> bool {
    match filter.kind.as_str() {
        "item_level" | "quality" | "required_level" | "armour" | "evasion" | "energy_shield" => {
            filter.value.is_some() || filter.min.is_some()
        }
        "explicit" => matching_trade_stat(filter, stats).is_some(),
        _ => false,
    }
}

fn build_stat_filters(
    active_filters: &[ActivePriceFilter],
    stats: &[TradeStatEntry],
) -> Vec<serde_json::Value> {
    active_filters
        .iter()
        .filter(|filter| filter.kind == "explicit")
        .filter_map(|filter| {
            let stat = matching_trade_stat(filter, stats)?;

            let mut stat_filter = json!({
                "id": stat.id,
            });

            if let Some(min) = filter.min.or(filter.value) {
                stat_filter["value"]["min"] = json!(min);
            }
            if let Some(max) = filter.max {
                stat_filter["value"]["max"] = json!(max);
            }

            Some(stat_filter)
        })
        .collect()
}

fn matching_trade_stat<'a>(
    filter: &ActivePriceFilter,
    stats: &'a [TradeStatEntry],
) -> Option<&'a TradeStatEntry> {
    for prefix in preferred_stat_prefixes(filter) {
        if let Some(stat) = stats.iter().find(|stat| {
            templates_compatible(&stat.template, &filter.template) && stat.id.starts_with(prefix)
        }) {
            return Some(stat);
        }
    }

    None
}

fn preferred_stat_prefixes(filter: &ActivePriceFilter) -> &'static [&'static str] {
    match filter.source_kind.as_deref() {
        Some("rune") | Some("socketable") => return &["rune.", "explicit.", "pseudo."],
        Some("implicit") => return &["implicit.", "rune.", "pseudo.", "explicit."],
        Some("desecrated") => return &["desecrated.", "explicit.", "pseudo."],
        Some("fractured") => return &["fractured.", "explicit.", "pseudo."],
        Some("enchant") => return &["enchant.", "explicit.", "pseudo."],
        Some("corrupted") => return &["corrupted.", "explicit.", "pseudo."],
        _ => {}
    }

    let label = filter.label.to_ascii_lowercase();

    if label.contains("(rune)") {
        return &["rune.", "explicit.", "pseudo."];
    }

    if label.contains("(implicit)") {
        return &["implicit.", "pseudo."];
    }

    if label.contains("(desecrated)") {
        return &["desecrated.", "explicit.", "pseudo."];
    }

    if label.contains("(fractured)") {
        return &["fractured.", "explicit.", "pseudo."];
    }

    if label.contains("(enchant)") {
        return &["enchant.", "explicit.", "pseudo."];
    }

    &["explicit.", "pseudo."]
}

fn stat_template_for_match(template: &str) -> String {
    template
        .split_whitespace()
        .filter(|part| {
            !matches!(
                *part,
                "rune"
                    | "implicit"
                    | "desecrated"
                    | "corrupted"
                    | "fractured"
                    | "enchant"
                    | "augmented"
            )
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn templates_compatible(left: &str, right: &str) -> bool {
    let normalize = |s: &str| -> String {
        stat_template_for_match(s)
            .split_whitespace()
            .map(|word| {
                if word == "#" || word.eq_ignore_ascii_case("n") || word == "#%" {
                    "#"
                } else {
                    word
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    };
    let left = normalize(left);
    let right = normalize(right);
    left == right || left.contains(&right) || right.contains(&left)
}

fn listing_from_fetch_result(
    result: FetchResult,
    source_url: &str,
    currencies: &[CurrencyMeta],
    rates: &CurrencyRates,
) -> Option<PriceListing> {
    let searchable_mods = result.item.all_searchable_mods_with_categories();
    let explicit_mods: Vec<String> = searchable_mods
        .iter()
        .map(|(modifier, _category)| clean_trade_text(modifier.clone()))
        .collect();

    // Extract tier/affix info only when category + stat template identifies a
    // single extended mod. A missing tier badge is safer than a wrong one.
    let mod_tier_infos: Vec<Option<ModTierInfo>> = {
        let ext_mods = result
            .item
            .extended
            .as_ref()
            .and_then(|ext| ext.mods.as_object())
            .cloned();
        searchable_mods
            .iter()
            .map(|(modifier, category)| {
                ext_mods
                    .as_ref()
                    .and_then(|mods| resolve_mod_tier_for_modifier(modifier, category, mods))
            })
            .collect()
    };
    let direct_source_url = trade_listing_url(
        source_url,
        result
            .id
            .as_deref()
            .or(result.item.id.as_deref())
            .unwrap_or_default(),
    );
    let account = result.listing.account;
    let price_data = result.listing.price;
    let amount = price_data.as_ref().map(|price| price.amount);
    let currency = price_data.as_ref().map(|price| price.currency.clone());
    let price = price_data
        .as_ref()
        .map(|price| format_price(price.amount, &price.currency))
        .unwrap_or_else(|| "Unpriced".to_string());
    let price_currency_icon_url = currency
        .as_deref()
        .and_then(|currency| currency_icon_url(currencies, currency));
    let normalized_amount = amount
        .zip(currency.as_deref())
        .and_then(|(amount, currency)| normalize_amount(amount, currency, rates));
    let normalized_currency_icon_url = currency_icon_url(currencies, &rates.selected_currency);
    let normalized_price =
        normalized_amount.map(|amount| format_price(amount, &rates.selected_currency));

    let (
        hashes_explicit,
        hashes_implicit,
        hashes_rune,
        hashes_desecrated,
        hashes_enchant,
        hash_count,
    ) = result
        .item
        .extended
        .as_ref()
        .map(|ext| {
            (
                ext.hashes_for("explicit"),
                ext.hashes_for("implicit"),
                ext.hashes_for("rune"),
                ext.hashes_for("desecrated"),
                ext.hashes_for("enchant"),
                ext.hash_count(),
            )
        })
        .unwrap_or_default();

    Some(PriceListing {
        price,
        amount,
        currency,
        currency_icon_url: price_currency_icon_url,
        normalized_price,
        normalized_amount,
        normalized_currency: Some(rates.selected_currency.clone()),
        normalized_currency_icon_url,
        item_level: result.item.ilvl,
        listed: result
            .listing
            .indexed
            .unwrap_or_else(|| "unknown".to_string()),
        source_url: direct_source_url,
        seller: account.as_ref().map(|account| account.name.clone()),
        online: account.and_then(|account| account.online).is_some(),
        required_level: result.item.required_level(),
        quality: result.item.property_value("Quality"),
        armour: result.item.property_value("Armour"),
        evasion: result.item.property_value("Evasion Rating"),
        energy_shield: result.item.property_value("Energy Shield"),
        explicit_mods,
        preview_name: preview_item_name(&result.item),
        preview_base_type: result
            .item
            .base_type
            .clone()
            .or_else(|| result.item.type_line.clone()),
        preview_rarity: preview_item_rarity(result.item.frame_type),
        preview_item_class: result.item.item_class.clone(),
        preview_icon_url: result.item.icon.clone(),
        preview_property_lines: preview_property_lines(&result.item),
        preview_description: result.item.description.map(clean_trade_text),
        hashes_explicit,
        hashes_implicit,
        hashes_rune,
        hashes_desecrated,
        hashes_enchant,
        hash_count,
        mod_tier_infos,
    })
}

fn trade_listing_url(source_url: &str, result_id: &str) -> String {
    if result_id.is_empty() {
        return source_url.to_string();
    }

    format!("{source_url}#{result_id}")
}

fn format_price(amount: f64, currency: &str) -> String {
    let amount_text = if amount.fract() == 0.0 {
        format!("{}", amount as u64)
    } else if amount >= 100.0 {
        format!("{amount:.0}")
    } else if amount >= 10.0 {
        format!("{amount:.1}")
    } else if amount >= 1.0 {
        format!("{amount:.2}")
    } else if amount >= 0.01 {
        format!("{amount:.2}")
    } else {
        format!("{amount:.3}")
    };

    format!("{amount_text} {}", canonical_currency_id(currency).to_uppercase())
}

fn preview_item_name(item: &FetchItem) -> Option<String> {
    item.name
        .as_ref()
        .map(|value| clean_trade_text(value.clone()))
        .filter(|value| !value.is_empty())
        .or_else(|| {
            item.type_line
                .as_ref()
                .map(|value| clean_trade_text(value.clone()))
        })
}

fn preview_item_rarity(frame_type: Option<u8>) -> Option<String> {
    Some(
        match frame_type.unwrap_or(2) {
            0 => "Common",
            1 => "Magic",
            2 => "Rare",
            3 => "Unique",
            5 => "Currency",
            _ => "Rare",
        }
        .to_string(),
    )
}

fn preview_property_lines(item: &FetchItem) -> Vec<String> {
    let mut lines = item
        .properties
        .iter()
        .filter_map(fetch_property_line)
        .collect::<Vec<_>>();

    lines.extend(item.requirements.iter().filter_map(|property| {
        let line = fetch_property_line(property)?;
        Some(format!("Requires {line}"))
    }));

    lines
}

fn fetch_property_line(property: &FetchItemProperty) -> Option<String> {
    let value = property
        .values
        .first()
        .map(|(value, _)| clean_trade_text(value.clone()))
        .filter(|value| !value.is_empty());
    let name = clean_trade_text(property.name.clone());

    if name.is_empty() {
        return value;
    }

    value.map(|value| format!("{name}: {value}")).or(Some(name))
}

fn trade_price_option_for_request(price_option: &str) -> Option<&str> {
    match price_option {
        PRICE_OPTION_EQUIVALENT => None,
        PRICE_OPTION_EXALTED_DIVINE => Some(PRICE_OPTION_EXALTED_DIVINE),
        direct_currency => Some(canonical_currency_id(direct_currency)),
    }
}

async fn fetch_currency_meta() -> Result<Vec<CurrencyMeta>, String> {
    if let Some(cached) = cached_currency_meta().await {
        return Ok(cached);
    }

    let currencies = fetch_currency_meta_live().await?;
    *CURRENCY_META_CACHE.lock().await = Some(CachedCurrencyMeta {
        currencies: currencies.clone(),
        fetched_at_epoch_ms: now_epoch_ms(),
    });
    Ok(currencies)
}

async fn cached_currency_meta() -> Option<Vec<CurrencyMeta>> {
    let cache = CURRENCY_META_CACHE.lock().await;
    let cached = cache.as_ref()?;
    let age = now_epoch_ms().saturating_sub(cached.fetched_at_epoch_ms);
    (age < CURRENCY_META_CACHE_TTL.as_millis() as u64).then(|| cached.currencies.clone())
}

async fn fetch_currency_meta_live() -> Result<Vec<CurrencyMeta>, String> {
    match fetch_trade_static_currency_meta().await {
        Ok(currencies) if !currencies.is_empty() => return Ok(currencies),
        Ok(_) => {}
        Err(error) => {
            debug_log::append(
                "currency.meta.trade_static_fallback",
                json!({
                    "error": error,
                }),
            );
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 poe2db-currency-icons")
        .build()
        .map_err(|error| error.to_string())?;

    let html = client
        .get(POE2DB_CURRENCY_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    let mut by_name = POE2DB_CURRENCY_RE
        .captures_iter(&html)
        .map(|captures| {
            (
                clean_html(
                    captures
                        .name("name")
                        .map(|value| value.as_str())
                        .unwrap_or(""),
                ),
                captures
                    .name("icon")
                    .map(|value| value.as_str().to_string())
                    .unwrap_or_default(),
            )
        })
        .collect::<HashMap<_, _>>();

    Ok(COMMON_CURRENCIES
        .iter()
        .map(|(id, name, slug)| CurrencyMeta {
            id: (*id).to_string(),
            name: (*name).to_string(),
            icon_url: by_name
                .remove(*name)
                .filter(|url| !url.is_empty())
                .or_else(|| Some(format!("https://cdn.poe2db.tw/image/poe2/{slug}.webp"))),
        })
        .collect())
}

async fn fetch_trade_static_currency_meta() -> Result<Vec<CurrencyMeta>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 trade-static-currencies")
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(TRADE_STATIC_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<TradeStaticResponse>()
        .await
        .map_err(|error| error.to_string())?;

    let official = response
        .result
        .into_iter()
        .find(|group| group.id == "Currency")
        .map(|group| {
            group
                .entries
                .into_iter()
                .filter(|entry| entry.id != "sep")
                .filter_map(|entry| {
                    Some(CurrencyMeta {
                        id: canonical_currency_id(&entry.id).to_string(),
                        name: entry.text,
                        icon_url: absolutize_trade_image_url(entry.image?),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut by_id = official
        .into_iter()
        .map(|currency| (currency.id.clone(), currency))
        .collect::<HashMap<_, _>>();
    let mut ordered = Vec::new();

    for (id, name, slug) in COMMON_CURRENCIES {
        ordered.push(by_id.remove(*id).unwrap_or_else(|| CurrencyMeta {
            id: (*id).to_string(),
            name: (*name).to_string(),
            icon_url: Some(format!("https://cdn.poe2db.tw/image/poe2/{slug}.webp")),
        }));
    }

    let mut rest = by_id.into_values().collect::<Vec<_>>();
    rest.sort_by(|left, right| left.name.cmp(&right.name));
    ordered.extend(rest);

    Ok(ordered)
}

async fn fetch_trade_stats() -> Result<Vec<TradeStatEntry>, String> {
    if let Some(cached) = TRADE_STATS_CACHE.lock().await.clone() {
        return Ok(cached);
    }

    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 trade-stat-loader")
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(TRADE_STATS_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<TradeStatsResponse>()
        .await
        .map_err(|error| error.to_string())?;

    let stats = response
        .result
        .into_iter()
        .flat_map(|group| group.entries)
        .map(|entry| TradeStatEntry {
            template: spec_template(&entry.text),
            id: entry.id,
        })
        .collect::<Vec<_>>();

    *TRADE_STATS_CACHE.lock().await = Some(stats.clone());
    Ok(stats)
}

async fn fetch_exchange_rates(
    league: &str,
    selected_currency: &str,
) -> Result<CurrencyRates, String> {
    let cache_key = exchange_rates_cache_key(league, selected_currency);
    if let Some(cached) = cached_exchange_rates(&cache_key, EXCHANGE_RATES_CACHE_TTL).await {
        debug_log::append(
            "currency.exchange.cache.hit",
            json!({
                "league": league,
                "selected_currency": selected_currency,
                "cache_key_hash": hash_text(&cache_key),
            }),
        );
        return Ok(cached);
    }

    match fetch_exchange_rates_live(league, selected_currency).await {
        Ok(rates) => {
            EXCHANGE_RATES_CACHE.lock().await.insert(
                cache_key,
                CachedCurrencyRates {
                    rates: rates.clone(),
                    fetched_at_epoch_ms: now_epoch_ms(),
                },
            );
            Ok(rates)
        }
        Err(error) => {
            if let Some(stale) = cached_exchange_rates(&cache_key, Duration::MAX).await {
                debug_log::append(
                    "currency.exchange.cache.stale_fallback",
                    json!({
                        "league": league,
                        "selected_currency": selected_currency,
                        "cache_key_hash": hash_text(&cache_key),
                        "error": error,
                    }),
                );
                return Ok(stale.with_source("official trade2 exchange stale cache"));
            }
            Err(error)
        }
    }
}

async fn cached_exchange_rates(cache_key: &str, ttl: Duration) -> Option<CurrencyRates> {
    let cache = EXCHANGE_RATES_CACHE.lock().await;
    let cached = cache.get(cache_key)?;
    let age = now_epoch_ms().saturating_sub(cached.fetched_at_epoch_ms);
    (ttl == Duration::MAX || age < ttl.as_millis() as u64).then(|| cached.rates.clone())
}

fn exchange_rates_cache_key(league: &str, selected_currency: &str) -> String {
    format!(
        "{}|{}",
        league.trim(),
        selected_currency.trim().to_ascii_lowercase()
    )
}

async fn fetch_exchange_rates_live(
    league: &str,
    selected_currency: &str,
) -> Result<CurrencyRates, String> {
    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 currency-exchange")
        .build()
        .map_err(|error| error.to_string())?;
    let selected_currency = canonical_currency_id(selected_currency);
    let currency_meta = fetch_currency_meta()
        .await
        .unwrap_or_else(|_| default_currency_meta());
    let mut have = currency_meta
        .iter()
        .map(|currency| canonical_currency_id(&currency.id).to_string())
        .filter(|id| id != selected_currency)
        .collect::<Vec<_>>();
    have.sort();
    have.dedup();
    let url = format!(
        "{TRADE_API_BASE}/exchange/poe2/{}",
        urlencoding::encode(league)
    );

    let mut exchanges = Vec::new();

    for chunk in have.chunks(MAX_EXCHANGE_CURRENCIES_PER_REQUEST) {
        let request = json!({
            "engine": "new",
            "query": {
                "status": { "option": "online" },
                "have": chunk,
                "want": [selected_currency],
            },
            "sort": { "have": "asc" }
        });

        debug_log::append(
            "currency.exchange.request",
            json!({
                "league": league,
                "selected_currency": selected_currency,
                "url": url,
                "have_count": have.len(),
                "chunk_count": chunk.len(),
                "request_hash": hash_json_value(&request),
            }),
        );

        let exchange_started = Instant::now();
        let response = client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|error| logged_transport_error("currency.exchange.transport_error", error))?;
        let (exchange, _) = parse_json_response::<TradeExchangeResponse>(
            "currency.exchange.response",
            response,
            exchange_started,
        )
        .await
        .map_err(|error| error.message)?;
        exchanges.push(exchange);
    }

    Ok(CurrencyRates::from_exchanges(selected_currency, exchanges))
}

fn normalize_amount(amount: f64, currency: &str, rates: &CurrencyRates) -> Option<f64> {
    let currency = canonical_currency_id(currency);
    if currency == rates.selected_currency {
        return Some(amount);
    }

    rates
        .per_selected
        .get(currency)
        .filter(|rate| **rate > 0.0)
        .map(|rate| amount / rate)
}

fn currency_icon_url(currencies: &[CurrencyMeta], currency: &str) -> Option<String> {
    let canonical = canonical_currency_id(currency);
    currencies
        .iter()
        .find(|meta| meta.id == canonical)
        .and_then(|meta| meta.icon_url.clone())
        .or_else(|| {
            COMMON_CURRENCIES
                .iter()
                .find(|(id, _, _)| *id == canonical)
                .map(|(_, _, slug)| format!("https://cdn.poe2db.tw/image/poe2/{slug}.webp"))
        })
}

fn canonical_currency_id(currency: &str) -> &str {
    match currency {
        "augment" => "aug",
        "alchemy" => "alch",
        other => other,
    }
}

fn default_currency_meta() -> Vec<CurrencyMeta> {
    COMMON_CURRENCIES
        .iter()
        .map(|(id, name, slug)| CurrencyMeta {
            id: (*id).to_string(),
            name: (*name).to_string(),
            icon_url: Some(format!("https://cdn.poe2db.tw/image/poe2/{slug}.webp")),
        })
        .collect()
}

fn absolutize_trade_image_url(image: String) -> Option<String> {
    if image.trim().is_empty() {
        return None;
    }

    if image.starts_with("http://") || image.starts_with("https://") {
        return Some(image);
    }

    Some(format!("{TRADE_CDN_BASE}{image}"))
}

fn clean_html(value: &str) -> String {
    let without_tags = Regex::new(r"<[^>]+>")
        .expect("valid html tag regex")
        .replace_all(value, "");
    without_tags
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#039;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn clean_trade_text(value: String) -> String {
    static TAG_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"\[([^|\]]+\|)?([^\]]+)\]").expect("valid trade text tag regex"));
    static ENVELOPE_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"^\{\s*[^}]*\}\s*").expect("valid envelope regex"));
    // Strip PoE1-style [Tag|text] markers
    let cleaned = TAG_RE.replace_all(&value, "$2");
    // Strip PoE2 envelope prefix: { Prefix "Name" (Tier: N) — Tags }
    // Envelope is metadata for tier/affix labels, not display text.
    let stripped = ENVELOPE_RE.replace(&cleaned, "");
    let trimmed = stripped.trim();
    trimmed.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn spec_template(value: &str) -> String {
    let cleaned = clean_trade_text(value.to_string());
    let without_inline_ranges = INLINE_ROLL_RANGE_RE.replace_all(&cleaned, "$1");
    NUMBER_RE
        .replace_all(
            &without_inline_ranges.to_ascii_lowercase(),
            "#",
        )
        .chars()
        .map(|character| {
            if character.is_ascii_lowercase() || character == '#' {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn filters_for_item(item: &Item) -> Vec<PriceFilter> {
    let mut filters = Vec::new();

    if let Some(item_class) = item.item_class.as_deref() {
        filters.push(text_filter("Category", item_class, "item"));
    }

    if let Some(item_level) = item.item_level {
        filters.push(PriceFilter {
            label: "Item Level".to_string(),
            source: "item".to_string(),
            enabled: true,
            value: Some(item_level as f64),
            min: Some(item_level as f64),
            max: None,
            tier: None,
        });
    }

    if let Some(sockets) = item.sockets {
        filters.push(PriceFilter {
            label: "Sockets".to_string(),
            source: "item".to_string(),
            enabled: true,
            value: Some(sockets as f64),
            min: Some(sockets as f64),
            max: None,
            tier: None,
        });
    }

    filters.extend(item.explicit_mods.iter().map(|modifier| {
        let searchable_modifier = INLINE_ROLL_RANGE_RE.replace_all(modifier, "$1");
        let value = NUMBER_RE
            .captures(&searchable_modifier)
            .and_then(|captures| captures.name("number"))
            .and_then(|number| number.as_str().parse::<f64>().ok());

        PriceFilter {
            label: modifier.clone(),
            source: "explicit".to_string(),
            enabled: true,
            value,
            min: value,
            max: None,
            tier: tier_hint(modifier),
        }
    }));

    filters
}

fn text_filter(label: &str, value: &str, source: &str) -> PriceFilter {
    PriceFilter {
        label: format!("{label}: {value}"),
        source: source.to_string(),
        enabled: true,
        value: None,
        min: None,
        max: None,
        tier: None,
    }
}

fn tier_hint(modifier: &str) -> Option<String> {
    TIER_HINT_RE
        .captures(modifier)
        .and_then(|captures| captures.name("tier"))
        .map(|tier| format!("Tier {}", tier.as_str()))
}

fn normalized_league(league: Option<&str>) -> &str {
    league
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_LEAGUE)
}

fn normalized_price_currency(currency: Option<&str>) -> &str {
    let currency = currency
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_PRICE_CURRENCY);

    canonical_currency_id(currency)
}

fn normalized_price_option(price_option: Option<&str>) -> &str {
    let price_option = price_option
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_PRICE_OPTION);

    match price_option {
        PRICE_OPTION_EQUIVALENT | PRICE_OPTION_EXALTED_DIVINE => price_option,
        direct_currency => canonical_currency_id(direct_currency),
    }
}

#[derive(Debug, Deserialize)]
struct TradeSearchResponse {
    id: String,
    result: Vec<String>,
    total: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct TradeLeagueResponse {
    result: Vec<TradeLeagueEntry>,
}

#[derive(Debug, Deserialize)]
struct TradeLeagueEntry {
    id: String,
    text: String,
    realm: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TradeStatsResponse {
    result: Vec<TradeStatGroup>,
}

#[derive(Debug, Deserialize)]
struct TradeStaticResponse {
    result: Vec<TradeStaticGroup>,
}

#[derive(Debug, Deserialize)]
struct TradeStaticGroup {
    id: String,
    entries: Vec<TradeStaticEntry>,
}

#[derive(Debug, Deserialize)]
struct TradeStaticEntry {
    id: String,
    text: String,
    image: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TradeStatGroup {
    entries: Vec<TradeStatApiEntry>,
}

#[derive(Debug, Deserialize)]
struct TradeStatApiEntry {
    id: String,
    text: String,
}

#[derive(Debug, Clone)]
struct TradeStatEntry {
    id: String,
    template: String,
}

#[derive(Debug, Deserialize)]
struct TradeFetchResponse {
    result: Vec<Option<FetchResult>>,
}

#[derive(Debug, Deserialize)]
struct TradeExchangeResponse {
    result: HashMap<String, ExchangeResult>,
}

#[derive(Debug, Deserialize)]
struct ExchangeResult {
    listing: ExchangeListing,
}

#[derive(Debug, Deserialize)]
struct ExchangeListing {
    offers: Vec<ExchangeOffer>,
}

#[derive(Debug, Deserialize)]
struct ExchangeOffer {
    exchange: ExchangeCurrencyAmount,
    item: ExchangeCurrencyAmount,
}

#[derive(Debug, Deserialize)]
struct ExchangeCurrencyAmount {
    currency: String,
    amount: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct CurrencyRates {
    selected_currency: String,
    per_selected: HashMap<String, f64>,
    source: String,
}

impl CurrencyRates {
    fn empty(selected_currency: &str) -> Self {
        Self {
            selected_currency: selected_currency.to_string(),
            per_selected: HashMap::new(),
            source: "official trade2 exchange unavailable; raw listing prices only".to_string(),
        }
    }

    fn from_exchanges<I>(selected_currency: &str, exchanges: I) -> Self
    where
        I: IntoIterator<Item = TradeExchangeResponse>,
    {
        let mut grouped: HashMap<String, Vec<f64>> = HashMap::new();

        for exchange in exchanges {
            for result in exchange.result.into_values() {
                for offer in result.listing.offers {
                    if canonical_currency_id(&offer.item.currency) != selected_currency
                        || offer.item.amount <= 0.0
                    {
                        continue;
                    }

                    grouped
                        .entry(canonical_currency_id(&offer.exchange.currency).to_string())
                        .or_default()
                        .push(offer.exchange.amount / offer.item.amount);
                }
            }
        }

        let per_selected = grouped
            .into_iter()
            .filter_map(|(currency, mut rates)| {
                rates.sort_by(f64::total_cmp);
                rates
                    .get(rates.len() / 2)
                    .copied()
                    .map(|rate| (currency, rate))
            })
            .collect::<HashMap<_, _>>();

        Self {
            selected_currency: selected_currency.to_string(),
            per_selected,
            source: "official trade2 exchange live offers".to_string(),
        }
    }

    fn with_source(mut self, source: &str) -> Self {
        self.source = source.to_string();
        self
    }
}

#[derive(Debug, Deserialize)]
struct FetchResult {
    #[serde(default)]
    id: Option<String>,
    item: FetchItem,
    listing: FetchListing,
}

#[derive(Debug, Deserialize)]
struct FetchItem {
    #[serde(default)]
    name: Option<String>,
    #[serde(rename = "typeLine", default)]
    type_line: Option<String>,
    #[serde(rename = "baseType", default)]
    base_type: Option<String>,
    #[serde(default)]
    icon: Option<String>,
    #[serde(rename = "frameType", default)]
    frame_type: Option<u8>,
    #[serde(rename = "itemClass", default)]
    item_class: Option<String>,
    #[serde(rename = "descrText", default)]
    description: Option<String>,
    #[serde(default)]
    id: Option<String>,
    ilvl: Option<u16>,
    #[serde(default)]
    properties: Vec<FetchItemProperty>,
    #[serde(default)]
    requirements: Vec<FetchItemProperty>,
    #[serde(rename = "explicitMods", default)]
    explicit_mods: Option<Vec<String>>,
    #[serde(rename = "implicitMods", default)]
    implicit_mods: Option<Vec<String>>,
    #[serde(rename = "runeMods", default)]
    rune_mods: Option<Vec<String>>,
    #[serde(rename = "desecratedMods", default)]
    desecrated_mods: Option<Vec<String>>,
    #[serde(rename = "fracturedMods", default)]
    fractured_mods: Option<Vec<String>>,
    #[serde(rename = "craftedMods", default)]
    crafted_mods: Option<Vec<String>>,
    #[serde(default)]
    extended: Option<ExtendedData>,
}

impl FetchItem {
    fn required_level(&self) -> Option<u16> {
        self.requirements
            .iter()
            .find(|property| clean_trade_text(property.name.clone()).eq_ignore_ascii_case("Level"))
            .and_then(FetchItemProperty::first_numeric_value)
            .map(|value| value as u16)
    }

    fn property_value(&self, name: &str) -> Option<f64> {
        self.properties
            .iter()
            .find(|property| clean_trade_text(property.name.clone()).eq_ignore_ascii_case(name))
            .and_then(FetchItemProperty::first_numeric_value)
    }

    fn all_searchable_mods_with_categories(&self) -> Vec<(String, &'static str)> {
        let mut mods = Vec::new();
        mods.extend(
            self.explicit_mods
                .clone()
                .unwrap_or_default()
                .into_iter()
                .map(|modifier| (modifier, "explicit")),
        );
        mods.extend(suffixed_mods(self.implicit_mods.as_ref(), "implicit"));
        mods.extend(suffixed_mods(self.rune_mods.as_ref(), "rune"));
        mods.extend(suffixed_mods(self.desecrated_mods.as_ref(), "desecrated"));
        mods.extend(suffixed_mods(self.fractured_mods.as_ref(), "fractured"));
        mods.extend(suffixed_mods(self.crafted_mods.as_ref(), "crafted"));
        mods
    }
}

fn suffixed_mods(mods: Option<&Vec<String>>, suffix: &'static str) -> Vec<(String, &'static str)> {
    mods.into_iter()
        .flatten()
        .map(|modifier| {
            let labelled = if modifier
                .to_ascii_lowercase()
                .contains(&format!("({suffix})"))
            {
                modifier.clone()
            } else {
                format!("{modifier} ({suffix})")
            };
            (labelled, suffix)
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct FetchItemProperty {
    name: String,
    #[serde(default)]
    values: Vec<(String, i64)>,
}

impl FetchItemProperty {
    fn first_numeric_value(&self) -> Option<f64> {
        self.values
            .first()
            .and_then(|(value, _)| NUMBER_RE.find(value))
            .and_then(|matched| matched.as_str().parse::<f64>().ok())
    }
}

#[derive(Debug, Deserialize)]
struct FetchListing {
    indexed: Option<String>,
    price: Option<FetchPrice>,
    account: Option<FetchAccount>,
}

#[derive(Debug, Deserialize)]
struct FetchPrice {
    amount: f64,
    currency: String,
}

#[derive(Debug, Deserialize, Clone)]
struct FetchAccount {
    name: String,
    online: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
struct ExtendedMod {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    tier: Option<String>,
    #[serde(default)]
    magnitudes: Option<Vec<ExtendedMagnitude>>,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
struct ExtendedMagnitude {
    #[serde(default)]
    hash: Option<String>,
    #[serde(default)]
    min: Option<f64>,
    #[serde(default)]
    max: Option<f64>,
    #[serde(default)]
    value: Option<f64>,
}

#[derive(Debug, Deserialize, Clone)]
struct ExtendedData {
    #[serde(default)]
    mods: serde_json::Value,
    #[serde(default)]
    hashes: serde_json::Value,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    ar: Option<f64>,
    #[serde(default)]
    es: Option<f64>,
    #[serde(default)]
    ev: Option<f64>,
    #[serde(default)]
    dps: Option<f64>,
    #[serde(default)]
    pdps: Option<f64>,
    #[serde(default)]
    edps: Option<f64>,
}

impl ExtendedData {
    fn flatten_hashes(&self) -> Vec<String> {
        let mut flat = Vec::new();
        if let Some(obj) = self.hashes.as_object() {
            for (_mod_type, entries) in obj {
                if let Some(arr) = entries.as_array() {
                    for entry in arr {
                        if let Some(tuple) = entry.as_array() {
                            if let Some(hash) = tuple.first().and_then(|v| v.as_str()) {
                                flat.push(hash.to_string());
                            }
                        }
                    }
                }
            }
        }
        flat.sort();
        flat.dedup();
        flat
    }

    fn hash_count(&self) -> usize {
        self.flatten_hashes().len()
    }

    fn hashes_for(&self, key: &str) -> Vec<String> {
        let mut hashes = Vec::new();
        if let Some(arr) = self.hashes.get(key).and_then(|v| v.as_array()) {
            for entry in arr {
                if let Some(tuple) = entry.as_array() {
                    if let Some(hash) = tuple.first().and_then(|v| v.as_str()) {
                        hashes.push(hash.to_string());
                    }
                }
            }
        }
        hashes.sort();
        hashes.dedup();
        hashes
    }
}

/// Structured tier info extracted from extended.mods for a single modifier.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ModTierInfo {
    /// "prefix" or "suffix"
    pub affix_kind: String,
    /// Tier number as integer string (e.g., "6" from P6)
    pub tier_number: String,
    /// Full tier code from API (e.g., "P6", "S4")
    pub tier_code: String,
}

/// Resolve tier/affix info from `extended.mods` by category and stat template.
/// This intentionally omits uncertain matches instead of guessing by flat index.
/// Each entry has a `tier` field like "P6" → Prefix Tier 6, "S4" → Suffix Tier 4.
fn resolve_mod_tier_for_modifier(
    modifier: &str,
    category: &str,
    ext_mods: &serde_json::Map<String, serde_json::Value>,
) -> Option<ModTierInfo> {
    let modifier_template = spec_template(modifier);
    if modifier_template.is_empty() {
        return None;
    }

    let mut matches = Vec::new();
    for category_key in extended_mod_category_keys(category) {
        let Some(value) = ext_mods.get(*category_key) else {
            continue;
        };
        let Ok(entries) = serde_json::from_value::<Vec<ExtendedMod>>(value.clone()) else {
            continue;
        };

        for entry in entries {
            let Some(name) = entry.name.as_deref() else {
                continue;
            };
            let entry_template = spec_template(name);
            if templates_compatible(&entry_template, &modifier_template) {
                matches.push(entry);
            }
        }
    }

    if matches.len() != 1 {
        return None;
    }

    mod_tier_info_from_code(matches.first()?.tier.as_deref()?)
}

fn extended_mod_category_keys(category: &str) -> &'static [&'static str] {
    match category {
        "rune" => &["rune", "socketable"],
        "crafted" => &["crafted", "craftedMods"],
        "fractured" => &["fractured", "fracturedMods"],
        "desecrated" => &["desecrated"],
        "implicit" => &["implicit"],
        _ => &["explicit"],
    }
}

fn mod_tier_info_from_code(tier_code: &str) -> Option<ModTierInfo> {
    if tier_code.is_empty() || tier_code.len() < 2 {
        return None;
    }
    let chars: Vec<char> = tier_code.chars().collect();
    let affix_char = chars[0];
    let tier_number: String = chars[1..].iter().collect();
    let affix_kind = match affix_char {
        'P' => "prefix",
        'S' => "suffix",
        _ => return None,
    };
    Some(ModTierInfo {
        affix_kind: affix_kind.to_string(),
        tier_number,
        tier_code: tier_code.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use crate::Item;

    use std::collections::HashMap;

    use super::{
        build_trade_request, filters_for_item, format_price, listing_from_fetch_result,
        matching_trade_stat, price_check_cache_key, spec_template, CurrencyRates, ExtendedData,
        FetchAccount, FetchItem, FetchItemProperty, FetchListing, FetchPrice, FetchResult,
        TradeStatEntry,
    };
    use serde_json::json;

    #[test]
    fn builds_trade_request_with_type_and_item_level() {
        let item = Item {
            name: "Honour March".to_string(),
            rarity: "Rare".to_string(),
            family: "armour".to_string(),
            item_class: Some("Boots".to_string()),
            base_type: Some("Expert Feathered Sandals".to_string()),
            item_level: Some(83),
            property_lines: Vec::new(),
            explicit_mods: Vec::new(),
            sockets: Some(1),
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text: String::new(),
            is_exchange: false,
            exchange_category_id: None,
        };

        let request = build_trade_request(
            &item,
            "equivalent",
            &[crate::ActivePriceFilter {
                kind: "item_level".to_string(),
                label: "Item Level: 83".to_string(),
                value: Some(83.0),
                template: "item_level".to_string(),
                ..Default::default()
            }],
            &[],
        );

        assert_eq!(request["query"]["type"], "Expert Feathered Sandals");
        assert_eq!(
            request["query"]["filters"]["type_filters"]["filters"]["ilvl"]["min"],
            83.0
        );
    }

    #[test]
    fn creates_editable_filter_rows_from_item_stats() {
        let item = Item {
            name: "Honour March".to_string(),
            rarity: "Rare".to_string(),
            family: "armour".to_string(),
            item_class: Some("Boots".to_string()),
            base_type: Some("Expert Feathered Sandals".to_string()),
            item_level: Some(83),
            property_lines: Vec::new(),
            explicit_mods: vec!["30% increased Movement Speed".to_string()],
            sockets: Some(1),
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text: String::new(),
            is_exchange: false,
            exchange_category_id: None,
        };

        let filters = filters_for_item(&item);

        assert!(filters.iter().any(|filter| filter.label == "Item Level"));
        assert!(filters
            .iter()
            .any(|filter| filter.label == "30% increased Movement Speed"
                && filter.value == Some(30.0)));
    }

    #[test]
    fn clicked_explicit_filters_are_added_to_trade_query() {
        let item = Item {
            name: "Dreadfist".to_string(),
            rarity: "Unique".to_string(),
            family: "armour".to_string(),
            item_class: Some("Gloves".to_string()),
            base_type: Some("Bolstered Mitts".to_string()),
            item_level: Some(75),
            property_lines: Vec::new(),
            explicit_mods: vec!["64% increased Armour".to_string()],
            sockets: None,
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text: String::new(),
            is_exchange: false,
            exchange_category_id: None,
        };
        let filter = crate::ActivePriceFilter {
            kind: "explicit".to_string(),
            label: "64% increased Armour".to_string(),
            value: Some(64.0),
            template: spec_template("64% increased Armour"),
            ..Default::default()
        };
        let stats = vec![TradeStatEntry {
            id: "explicit.stat_1062208444".to_string(),
            template: spec_template("#% increased Armour"),
        }];

        let request = build_trade_request(&item, "equivalent", &[filter], &stats);

        assert_eq!(
            request["query"]["stats"][0]["filters"][0]["id"],
            "explicit.stat_1062208444"
        );
        assert_eq!(
            request["query"]["stats"][0]["filters"][0]["value"]["min"],
            64.0
        );
    }

    #[test]
    fn tier_band_filters_send_min_and_max_to_trade_query() {
        let item = Item {
            name: "Test Talisman".to_string(),
            rarity: "Rare".to_string(),
            family: "weapon".to_string(),
            item_class: Some("Talismans".to_string()),
            base_type: Some("Maji Talisman".to_string()),
            item_level: Some(81),
            property_lines: Vec::new(),
            explicit_mods: vec!["Adds 30 to 40 Physical Damage".to_string()],
            sockets: None,
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text: String::new(),
            is_exchange: false,
            exchange_category_id: None,
        };
        let filter = crate::ActivePriceFilter {
            kind: "explicit".to_string(),
            label: "Adds 30 to 40 Physical Damage".to_string(),
            value: Some(30.0),
            min: Some(26.0),
            max: Some(39.0),
            tier: Some("T1".to_string()),
            tier_name: Some("Flaring".to_string()),
            template: spec_template("Adds 30 to 40 Physical Damage"),
            ..Default::default()
        };
        let stats = vec![TradeStatEntry {
            id: "explicit.stat_1940865751".to_string(),
            template: spec_template("Adds # to # Physical Damage"),
        }];

        let request = build_trade_request(&item, "equivalent", &[filter], &stats);

        assert_eq!(
            request["query"]["stats"][0]["filters"][0]["value"]["min"],
            26.0
        );
        assert_eq!(
            request["query"]["stats"][0]["filters"][0]["value"]["max"],
            39.0
        );
    }

    #[test]
    fn special_stat_filters_prefer_matching_official_category() {
        let filter = crate::ActivePriceFilter {
            kind: "explicit".to_string(),
            label: "Companions have 16% increased Attack Speed (Desecrated)".to_string(),
            value: Some(16.0),
            min: Some(12.0),
            max: Some(18.0),
            template: spec_template("Companions have 16% increased Attack Speed"),
            ..Default::default()
        };
        let stats = vec![
            TradeStatEntry {
                id: "explicit.stat_666077204".to_string(),
                template: spec_template("Companions have #% increased Attack Speed"),
            },
            TradeStatEntry {
                id: "desecrated.stat_666077204".to_string(),
                template: spec_template("Companions have #% increased Attack Speed"),
            },
        ];

        let stat = matching_trade_stat(&filter, &stats).expect("matching stat");

        assert_eq!(stat.id, "desecrated.stat_666077204");
    }

    #[test]
    fn inline_roll_ranges_normalize_to_official_trade_templates() {
        assert_eq!(
            spec_template("Companions have 12(12-18)% increased Attack Speed"),
            spec_template("Companions have #% increased Attack Speed")
        );
        assert_eq!(
            spec_template("Adds 30(23-35) to 40(39-59) Physical Damage"),
            spec_template("Adds # to # Physical Damage")
        );
        assert_eq!(
            spec_template("+8(8-12) to Maximum Rage"),
            spec_template("+# to Maximum Rage")
        );
    }

    #[test]
    fn essence_sourced_flat_mods_match_official_explicit_stats() {
        let filter = crate::ActivePriceFilter {
            kind: "explicit".to_string(),
            label: "23% chance to gain Onslaught on Killing Hits with this Weapon".to_string(),
            value: Some(23.0),
            min: Some(20.0),
            max: Some(25.0),
            template: spec_template("23% chance to gain Onslaught on Killing Hits with this Weapon"),
            ..Default::default()
        };
        let stats = vec![TradeStatEntry {
            id: "explicit.stat_1881230714".to_string(),
            template: spec_template("#% chance to gain Onslaught on Killing Hits with this Weapon"),
        }];

        let stat = matching_trade_stat(&filter, &stats).expect("matching stat");

        assert_eq!(stat.id, "explicit.stat_1881230714");
    }

    #[test]
    fn source_kind_hint_routes_base_implicit_stats_to_official_implicit_category() {
        let filter = crate::ActivePriceFilter {
            kind: "explicit".to_string(),
            label: "+8 to Maximum Rage".to_string(),
            value: Some(8.0),
            min: Some(8.0),
            max: Some(12.0),
            template: spec_template("+8 to Maximum Rage"),
            source_kind: Some("implicit".to_string()),
            ..Default::default()
        };
        let stats = vec![
            TradeStatEntry {
                id: "explicit.stat_1181501418".to_string(),
                template: spec_template("# to Maximum Rage"),
            },
            TradeStatEntry {
                id: "implicit.stat_1181501418".to_string(),
                template: spec_template("# to Maximum Rage"),
            },
        ];

        let stat = matching_trade_stat(&filter, &stats).expect("matching stat");
        let request = build_trade_request(
            &Item {
                name: "Maji Talisman".to_string(),
                rarity: "Rare".to_string(),
                family: "accessory".to_string(),
                item_class: Some("Talismans".to_string()),
                base_type: Some("Maji Talisman".to_string()),
                item_level: Some(81),
                property_lines: Vec::new(),
                explicit_mods: vec!["+8 to Maximum Rage".to_string()],
                sockets: None,
                spirit: None,
                hazards: Vec::new(),
                trade_url: None,
                raw_text: String::new(),
                is_exchange: false,
                exchange_category_id: None,
            },
            "equivalent",
            &[filter],
            &stats,
        );

        assert_eq!(stat.id, "implicit.stat_1181501418");
        assert_eq!(
            request["query"]["stats"][0]["filters"][0]["id"],
            "implicit.stat_1181501418"
        );
    }

    #[test]
    fn equivalent_prices_keep_small_currency_values_visible() {
        assert_eq!(format_price(0.01, "exalted"), "0.01 EXALTED");
        assert_eq!(format_price(0.004, "exalted"), "0.004 EXALTED");
        assert_eq!(format_price(1.0, "chaos"), "1 CHAOS");
    }

    #[test]
    fn exchange_mode_items_skip_trade_search_filters() {
        let item = Item {
            name: "Greater Orb of Transmutation".to_string(),
            rarity: "Currency".to_string(),
            family: "currency".to_string(),
            item_class: Some("Currency Stackable Currency".to_string()),
            base_type: Some("Greater Orb of Transmutation".to_string()),
            item_level: None,
            property_lines: vec![
                "Stack Size: 3/20".to_string(),
                "Minimum Modifier Level: 55".to_string(),
            ],
            explicit_mods: Vec::new(),
            sockets: None,
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text: String::new(),
            is_exchange: true,
            exchange_category_id: None,
        };

        let loading = super::loading(&item);

        assert!(loading.status.contains("cached category overview"));
        assert!(loading.filters.is_empty());
        assert!(loading.listings.is_empty());
    }

    #[test]
    fn price_check_cache_key_is_order_insensitive_for_active_filters() {
        let item = Item {
            name: "Honour March".to_string(),
            rarity: "Rare".to_string(),
            family: "armour".to_string(),
            item_class: Some("Boots".to_string()),
            base_type: Some("Expert Feathered Sandals".to_string()),
            item_level: Some(83),
            property_lines: Vec::new(),
            explicit_mods: vec![
                "30% increased Movement Speed".to_string(),
                "36 to maximum Life".to_string(),
            ],
            sockets: Some(1),
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text:
                "Rare Boots\nItem Level: 83\n30% increased Movement Speed\n+36 to maximum Life"
                    .to_string(),
            is_exchange: false,
            exchange_category_id: None,
        };

        let filter_a = crate::ActivePriceFilter {
            kind: "explicit".to_string(),
            label: "30% increased Movement Speed".to_string(),
            value: Some(30.0),
            template: spec_template("30% increased Movement Speed"),
            ..Default::default()
        };
        let filter_b = crate::ActivePriceFilter {
            kind: "explicit".to_string(),
            label: "+36 to maximum Life".to_string(),
            value: Some(36.0),
            template: spec_template("+36 to maximum Life"),
            ..Default::default()
        };

        let first = price_check_cache_key(
            &item,
            "Standard",
            "divine",
            "equivalent",
            &[filter_a.clone(), filter_b.clone()],
        )
        .expect("first cache key");
        let second = price_check_cache_key(
            &item,
            "Standard",
            "divine",
            "equivalent",
            &[filter_b, filter_a],
        )
        .expect("second cache key");

        assert_eq!(first, second);
    }

    #[test]
    fn listing_rows_use_direct_trade_listing_url() {
        let listing = listing_from_fetch_result(
            FetchResult {
                id: Some("deadbeef".to_string()),
                item: FetchItem {
                    name: Some("Test Item".to_string()),
                    type_line: Some("Test Base".to_string()),
                    base_type: Some("Test Base".to_string()),
                    icon: None,
                    frame_type: Some(2),
                    item_class: Some("Weapons".to_string()),
                    description: None,
                    id: None,
                    ilvl: Some(82),
                    properties: vec![FetchItemProperty {
                        name: "Quality".to_string(),
                        values: vec![("20%".to_string(), 0)],
                    }],
                    requirements: Vec::new(),
                    explicit_mods: Some(vec!["Adds 1 to 2 Physical Damage".to_string()]),
                    implicit_mods: None,
                    rune_mods: None,
                    desecrated_mods: None,
                    fractured_mods: None,
                    crafted_mods: None,
                    extended: None,
                },
                listing: FetchListing {
                    indexed: Some("2026-05-20T12:00:00Z".to_string()),
                    price: Some(FetchPrice {
                        amount: 1.0,
                        currency: "divine".to_string(),
                    }),
                    account: Some(FetchAccount {
                        name: "seller#1234".to_string(),
                        online: None,
                    }),
                },
            },
            "https://www.pathofexile.com/trade2/search/poe2/Standard/query123",
            &[],
            &CurrencyRates {
                selected_currency: "divine".to_string(),
                per_selected: HashMap::new(),
                source: "test".to_string(),
            },
        )
        .expect("listing");

        assert_eq!(
            listing.source_url,
            "https://www.pathofexile.com/trade2/search/poe2/Standard/query123#deadbeef"
        );
    }

    #[test]
    fn listing_tier_info_matches_extended_mods_by_category_and_name() {
        let listing = listing_from_fetch_result(
            FetchResult {
                id: Some("deadbeef".to_string()),
                item: FetchItem {
                    name: Some("Test Item".to_string()),
                    type_line: Some("Test Base".to_string()),
                    base_type: Some("Test Base".to_string()),
                    icon: None,
                    frame_type: Some(2),
                    item_class: Some("Talismans".to_string()),
                    description: None,
                    id: None,
                    ilvl: Some(82),
                    properties: Vec::new(),
                    requirements: Vec::new(),
                    explicit_mods: Some(vec![
                        "+50 to Maximum Life".to_string(),
                        "+5 to Level of all Attack Skills".to_string(),
                    ]),
                    implicit_mods: Some(vec!["+8 to Maximum Rage".to_string()]),
                    rune_mods: None,
                    desecrated_mods: None,
                    fractured_mods: None,
                    crafted_mods: None,
                    extended: Some(test_extended_data(json!({
                        "explicit": [
                            { "name": "+# to Maximum Life", "tier": "P2" }
                        ],
                        "implicit": [
                            { "name": "+# to Maximum Rage", "tier": "P1" }
                        ]
                    }))),
                },
                listing: priced_listing(),
            },
            "https://www.pathofexile.com/trade2/search/poe2/Standard/query123",
            &[],
            &test_currency_rates(),
        )
        .expect("listing");

        assert_eq!(listing.mod_tier_infos.len(), 3);
        assert_eq!(
            listing.mod_tier_infos[0]
                .as_ref()
                .map(|info| info.tier_code.as_str()),
            Some("P2")
        );
        assert!(
            listing.mod_tier_infos[1].is_none(),
            "second explicit mod must not inherit implicit tier metadata"
        );
        assert_eq!(
            listing.mod_tier_infos[2]
                .as_ref()
                .map(|info| info.tier_code.as_str()),
            Some("P1")
        );
    }

    #[test]
    fn listing_tier_info_omits_ambiguous_extended_mod_matches() {
        let listing = listing_from_fetch_result(
            FetchResult {
                id: Some("deadbeef".to_string()),
                item: FetchItem {
                    name: Some("Test Item".to_string()),
                    type_line: Some("Test Base".to_string()),
                    base_type: Some("Test Base".to_string()),
                    icon: None,
                    frame_type: Some(2),
                    item_class: Some("Talismans".to_string()),
                    description: None,
                    id: None,
                    ilvl: Some(82),
                    properties: Vec::new(),
                    requirements: Vec::new(),
                    explicit_mods: Some(vec!["+50 to Maximum Life".to_string()]),
                    implicit_mods: None,
                    rune_mods: None,
                    desecrated_mods: None,
                    fractured_mods: None,
                    crafted_mods: None,
                    extended: Some(test_extended_data(json!({
                        "explicit": [
                            { "name": "+# to Maximum Life", "tier": "P2" },
                            { "name": "+# to Maximum Life", "tier": "P3" }
                        ]
                    }))),
                },
                listing: priced_listing(),
            },
            "https://www.pathofexile.com/trade2/search/poe2/Standard/query123",
            &[],
            &test_currency_rates(),
        )
        .expect("listing");

        assert_eq!(listing.mod_tier_infos.len(), 1);
        assert!(listing.mod_tier_infos[0].is_none());
    }

    #[test]
    fn listing_tier_info_matches_rune_and_desecrated_categories_without_crosswire() {
        let listing = listing_from_fetch_result(
            FetchResult {
                id: Some("deadbeef".to_string()),
                item: FetchItem {
                    name: Some("Test Item".to_string()),
                    type_line: Some("Test Base".to_string()),
                    base_type: Some("Test Base".to_string()),
                    icon: None,
                    frame_type: Some(2),
                    item_class: Some("Talismans".to_string()),
                    description: None,
                    id: None,
                    ilvl: Some(82),
                    properties: Vec::new(),
                    requirements: Vec::new(),
                    explicit_mods: None,
                    implicit_mods: None,
                    rune_mods: Some(vec!["+14% to Cold Resistance".to_string()]),
                    desecrated_mods: Some(vec!["15% increased Attack Speed".to_string()]),
                    fractured_mods: None,
                    crafted_mods: None,
                    extended: Some(test_extended_data(json!({
                        "rune": [
                            { "name": "+#% to Cold Resistance", "tier": "S3" }
                        ],
                        "desecrated": [
                            { "name": "#% increased Attack Speed", "tier": "S1" }
                        ],
                        "explicit": [
                            { "name": "+#% to Cold Resistance", "tier": "P9" }
                        ]
                    }))),
                },
                listing: priced_listing(),
            },
            "https://www.pathofexile.com/trade2/search/poe2/Standard/query123",
            &[],
            &test_currency_rates(),
        )
        .expect("listing");

        assert_eq!(listing.mod_tier_infos.len(), 2);
        assert_eq!(
            listing.mod_tier_infos[0]
                .as_ref()
                .map(|info| info.tier_code.as_str()),
            Some("S3")
        );
        assert_eq!(
            listing.mod_tier_infos[1]
                .as_ref()
                .map(|info| info.tier_code.as_str()),
            Some("S1")
        );
    }

    fn priced_listing() -> FetchListing {
        FetchListing {
            indexed: Some("2026-05-20T12:00:00Z".to_string()),
            price: Some(FetchPrice {
                amount: 1.0,
                currency: "divine".to_string(),
            }),
            account: Some(FetchAccount {
                name: "seller#1234".to_string(),
                online: None,
            }),
        }
    }

    fn test_currency_rates() -> CurrencyRates {
        CurrencyRates {
            selected_currency: "divine".to_string(),
            per_selected: HashMap::new(),
            source: "test".to_string(),
        }
    }

    fn test_extended_data(mods: serde_json::Value) -> ExtendedData {
        ExtendedData {
            mods,
            hashes: json!({}),
            text: None,
            ar: None,
            es: None,
            ev: None,
            dps: None,
            pdps: None,
            edps: None,
        }
    }
}
