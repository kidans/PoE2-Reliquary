const FEED_ROOT = "./market-feed";
const PERIODS = ["30m", "1d", "7d"];
const PAGE_SIZE = 10;

const state = {
  manifest: null,
  dataset: null,
  league: localStorage.getItem("reliquary.site.market.league") || "",
  period: PERIODS.includes(localStorage.getItem("reliquary.site.market.period"))
    ? localStorage.getItem("reliquary.site.market.period")
    : "1d",
  winnerRows: PAGE_SIZE,
  loserRows: PAGE_SIZE,
};

const leagueSelect = document.querySelector("#league-select");
const periodButtons = [...document.querySelectorAll("[data-period]")];
const refreshButton = document.querySelector("#market-refresh");
const marketState = document.querySelector("#market-state");
const marketLists = document.querySelector("#market-lists");
const winnerList = document.querySelector("#winner-list");
const loserList = document.querySelector("#loser-list");
const summary = document.querySelector("#market-summary");
const source = document.querySelector("#market-source");
const updated = document.querySelector("#market-updated");
const heroStatus = document.querySelector("#hero-feed-status");

periodButtons.forEach((button) => {
  button.classList.toggle("is-active", button.dataset.period === state.period);
  button.addEventListener("click", async () => {
    if (state.period === button.dataset.period) return;
    state.period = button.dataset.period;
    localStorage.setItem("reliquary.site.market.period", state.period);
    periodButtons.forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    resetRows();
    await loadDataset();
  });
});

leagueSelect.addEventListener("change", async () => {
  state.league = leagueSelect.value;
  localStorage.setItem("reliquary.site.market.league", state.league);
  resetRows();
  await loadDataset();
});

refreshButton.addEventListener("click", loadManifest);
document.querySelectorAll(".load-more").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.direction === "winner") state.winnerRows += PAGE_SIZE;
    else state.loserRows += PAGE_SIZE;
    renderDataset();
  });
});

await loadManifest();

async function loadManifest() {
  showLoading("Connecting to the shared feed", "Checking GitHub Pages for the latest league snapshots.");
  try {
    const response = await fetch(`${FEED_ROOT}/manifest.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.leagues) || manifest.leagues.length === 0) {
      throw new Error("No league snapshots have been published yet");
    }
    state.manifest = manifest;
    const available = manifest.leagues.map((league) => league.name);
    if (!available.includes(state.league)) state.league = preferredLeague(available);
    renderLeagueOptions(manifest.leagues);
    heroStatus.textContent = `${manifest.leagues.length} league${manifest.leagues.length === 1 ? "" : "s"} online`;
    await loadDataset();
  } catch (error) {
    heroStatus.textContent = "Feed awaiting first deployment";
    showError("Shared market feed is not available yet", error instanceof Error ? error.message : String(error));
  }
}

async function loadDataset() {
  if (!state.league) return;
  showLoading("Loading market history", `${state.league} · ${periodLabel(state.period)}`);
  const slug = state.manifest?.leagues.find((league) => league.name === state.league)?.slug || leagueSlug(state.league);
  try {
    const response = await fetch(`${FEED_ROOT}/leagues/${slug}/market-${state.period}.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Dataset returned HTTP ${response.status}`);
    state.dataset = await response.json();
    renderDataset();
  } catch (error) {
    state.dataset = null;
    showError("This market period could not be loaded", error instanceof Error ? error.message : String(error));
  }
}

function renderDataset() {
  const dataset = state.dataset;
  if (!dataset) return;
  source.textContent = dataset.source || "PoE.ninja shared snapshot collector";
  updated.textContent = `Updated ${formatTimestamp(dataset.generated_at_epoch_ms)}`;
  summary.textContent = `${dataset.league} · ${periodLabel(dataset.period)} measured price movement`;
  if (dataset.status !== "ready") {
    const collected = Number(dataset.snapshots_collected || 0);
    const required = Number(dataset.snapshots_required || 1);
    const percentage = Math.min(100, Math.round((collected / required) * 100));
    showState(
      `Building the ${periodLabel(dataset.period)} baseline`,
      `${collected}/${required} distinct snapshots collected · ${percentage}%`,
    );
    return;
  }
  const winners = Array.isArray(dataset.winners) ? dataset.winners : [];
  const losers = Array.isArray(dataset.losers) ? dataset.losers : [];
  if (!winners.length && !losers.length) {
    showState("No meaningful movement yet", "The baseline is ready, but no liquid items cleared the movement threshold.");
    return;
  }
  marketState.hidden = true;
  marketLists.hidden = false;
  renderMovers(winnerList, winners.slice(0, state.winnerRows), "positive");
  renderMovers(loserList, losers.slice(0, state.loserRows), "negative");
  setLoadMore("winner", state.winnerRows < winners.length);
  setLoadMore("loser", state.loserRows < losers.length);
}

function renderMovers(container, movers, direction) {
  container.replaceChildren(...movers.map((mover, index) => {
    const row = document.createElement("article");
    row.className = "mover-row";
    row.style.setProperty("--row-index", String(index));
    const icon = mover.icon_url
      ? element("img", { src: mover.icon_url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })
      : element("span", { class: "icon-fallback", text: mover.name.slice(0, 1) });
    icon.addEventListener?.("error", () => icon.replaceWith(element("span", { class: "icon-fallback", text: mover.name.slice(0, 1) })), { once: true });
    const name = element("div", { class: "mover-name" }, [
      element("strong", { text: mover.name }),
      element("span", { text: mover.category_label }),
    ]);
    const value = element("div", { class: "mover-value" }, [
      element("strong", { text: formatPrice(mover.current_price) }),
      element("span", { class: direction === "positive" ? "change-positive" : "change-negative", text: `${signed(mover.change_percent)}%` }),
      element("small", { class: "confidence", text: mover.confidence }),
    ]);
    row.append(icon, name, value);
    return row;
  }));
}

function renderLeagueOptions(leagues) {
  leagueSelect.replaceChildren(...leagues.map((league) => element("option", {
    value: league.name,
    text: league.name,
    selected: league.name === state.league,
  })));
  leagueSelect.disabled = false;
}

function showLoading(title, detail) {
  marketState.classList.remove("is-error");
  marketState.hidden = false;
  marketLists.hidden = true;
  marketState.innerHTML = `<div class="state-rule"></div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
}

function showError(title, detail) {
  marketState.classList.add("is-error");
  marketState.hidden = false;
  marketLists.hidden = true;
  summary.textContent = "The shared history is temporarily unavailable.";
  updated.textContent = "No snapshot loaded";
  marketState.innerHTML = `<div class="state-rule"></div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
}

function showState(title, detail) {
  marketState.classList.remove("is-error");
  marketState.hidden = false;
  marketLists.hidden = true;
  marketState.innerHTML = `<div class="state-rule"></div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
}

function resetRows() { state.winnerRows = PAGE_SIZE; state.loserRows = PAGE_SIZE; }
function setLoadMore(direction, visible) { document.querySelector(`[data-direction="${direction}"]`).hidden = !visible; }
function preferredLeague(leagues) { return leagues.find((league) => league !== "Standard" && !/hardcore/i.test(league)) || leagues[0]; }
function periodLabel(period) { return period === "30m" ? "30-minute" : period === "1d" ? "1-day" : "7-day"; }
function leagueSlug(value) { return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"; }
function formatTimestamp(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatPrice(value) { return new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2, notation: value >= 10000 ? "compact" : "standard" }).format(value); }
function signed(value) { return `${value > 0 ? "+" : ""}${Number(value).toFixed(Math.abs(value) >= 10 ? 1 : 2)}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key === "selected") node.selected = Boolean(value);
    else node.setAttribute(key, value);
  });
  node.append(...children);
  return node;
}
