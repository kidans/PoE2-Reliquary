import "./styles.css";

type TabId = "scan" | "trade" | "atlas" | "temple" | "profile" | "settings";

type NavItem = {
  id: TabId;
  label: string;
  icon: string;
  sub: string;
};

type MarketRow = {
  name: string;
  family: string;
  price: string;
  change: string;
  trend: "up" | "down";
};

type TempleNode = {
  x: number;
  y: number;
  state: "empty" | "path" | "reward" | "danger" | "boss";
  label?: string;
};

const navItems: NavItem[] = [
  { id: "scan", label: "Scan", icon: "micro_status_ocr.png", sub: "price check" },
  { id: "trade", label: "Trade", icon: "micro_market_board.png", sub: "market tape" },
  { id: "atlas", label: "Atlas", icon: "micro_status_waystone.png", sub: "run context" },
  { id: "temple", label: "Temple", icon: "micro_status_shrine.png", sub: "incursion" },
  { id: "profile", label: "Profile", icon: "micro_hazard_shield.png", sub: "build sync" },
  { id: "settings", label: "Settings", icon: "micro_utility_filter.png", sub: "overlay feel" }
];

const marketRows: MarketRow[] = [
  { name: "Architect's Orb", family: "Currency", price: "1.54 divine", change: "+33.9%", trend: "up" },
  { name: "Ancient Rune of the Titan", family: "Runes", price: "0.02 divine", change: "+36.2%", trend: "up" },
  { name: "Atmohua's Soul Core", family: "Soul Cores", price: "0.04 divine", change: "+28.6%", trend: "up" },
  { name: "Fenumus' Rune of Draining", family: "Runes", price: "0.02 divine", change: "-34.9%", trend: "down" },
  { name: "Amanamu's Tithe", family: "Lineage Gems", price: "2.30 divine", change: "-24.6%", trend: "down" },
  { name: "Omen of the Ancients", family: "Omens", price: "0.03 divine", change: "-7.6%", trend: "down" }
];

const templeNodes: TempleNode[] = Array.from({ length: 61 }, (_, index): TempleNode => {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const centerOffset = Math.abs(4 - row);
  return {
    x: col - 4,
    y: row - 3,
    state: col < centerOffset || col > 8 - centerOffset ? "empty" : "path"
  };
}).filter((node) => node.state !== "empty");

const markedTempleNodes: TempleNode[] = [
  ...templeNodes,
  { x: -2, y: 2, state: "reward", label: "T" },
  { x: -1, y: 1, state: "danger", label: "II" },
  { x: 1, y: 1, state: "reward", label: "III" },
  { x: 0, y: -4, state: "boss", label: "Atziri" }
];

const state = {
  tab: "scan" as TabId,
  lineMode: false,
  hue: 202,
  opacity: 78
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root missing");
}

const appRoot = app;

function asset(name: string): string {
  return `/assets/${name}`;
}

function setThemeVars(): void {
  document.documentElement.style.setProperty("--accent-hue", String(state.hue));
  document.documentElement.style.setProperty("--shell-alpha", `${state.opacity / 100}`);
}

function render(): void {
  setThemeVars();
  appRoot.innerHTML = state.lineMode ? renderLineMode() : renderFullShell();
  bindEvents();
}

function renderFullShell(): string {
  return `
    <main class="runic-shell">
      <div class="runic-glow runic-glow-a"></div>
      <div class="runic-glow runic-glow-b"></div>
      <header class="topbar">
        <section class="brand-block">
          <p class="eyebrow">Runic experiment</p>
          <h1>Reliquary</h1>
          <span>Heart of the Tribe</span>
        </section>
        <section class="microbar" aria-label="Prototype status">
          ${renderMicroChip("micro_status_zone.png", "Fate of the Vaal")}
          ${renderMicroChip("micro_status_timer.png", "01:24")}
          ${renderMicroChip("micro_status_rarity.png", "R 54%")}
          <button class="icon-button" data-action="line">_</button>
          <button class="icon-button danger">x</button>
        </section>
      </header>

      <div class="app-grid">
        <nav class="runic-spine" aria-label="Runic navigation">
          ${navItems.map(renderNavButton).join("")}
        </nav>
        <section class="content-frame">
          ${renderContent()}
        </section>
      </div>
    </main>
  `;
}

function renderNavButton(item: NavItem): string {
  const selected = item.id === state.tab ? "is-active" : "";
  return `
    <button class="spine-button ${selected}" data-tab="${item.id}">
      <img src="${asset(item.icon)}" alt="" />
      <span>
        <strong>${item.label}</strong>
        <small>${item.sub}</small>
      </span>
    </button>
  `;
}

function renderMicroChip(icon: string, text: string): string {
  return `
    <span class="micro-chip">
      <img src="${asset(icon)}" alt="" />
      ${text}
    </span>
  `;
}

function renderContent(): string {
  switch (state.tab) {
    case "scan":
      return renderScan();
    case "trade":
      return renderTrade();
    case "atlas":
      return renderAtlas();
    case "temple":
      return renderTemple();
    case "profile":
      return renderProfile();
    case "settings":
      return renderSettings();
  }
}

function renderScan(): string {
  return `
    <article class="screen scan-screen">
      <section class="item-card rarity-rare">
        <div class="item-banner">
          <span>Rare Talisman</span>
          <h2>Maji Talisman</h2>
        </div>
        <div class="item-body">
          <div class="stat-pills">
            <span>Item Level: 81</span>
            <span>Requires Level: 79</span>
            <span>Sockets: 2</span>
          </div>
          <p class="muted center">Quality <b>21%</b> / Physical Damage <b>304-514</b> / Crit <b>8.00%</b></p>
          <div class="modifier-stack">
            ${renderModifier("T3 R", "18% increased Physical Damage (Rune)", true)}
            ${renderModifier("T1 R", "Gain 5% of Damage as Extra Damage of all Elements (Rune)", false)}
            ${renderModifier("T2 P1", "158(155-169)% increased Physical Damage", true)}
            ${renderModifier("T3 P2", "Adds 30(23-35) to 40(39-59) Physical Damage", false)}
            ${renderModifier("T1 E", "+5 to Level of all Attack Skills", true)}
            ${renderModifier("T1 S1", "15(12-18)% increased Attack Speed", false)}
          </div>
          <div class="mode-row">
            <label><input checked type="radio" name="mode" /> Quick Price</label>
            <label><input type="radio" name="mode" /> Exact Match</label>
            <label><input type="radio" name="mode" /> Broad (-10%)</label>
            <label><input type="radio" name="mode" /> Crafting Base</label>
          </div>
        </div>
      </section>

      <section class="market-card">
        <div class="value-panel">
          <p class="eyebrow">Estimated Value</p>
          <h3>~ 20 <img src="${asset("micro_market_orb.png")}" alt="" /></h3>
          <span>Range: 10-25 exalted</span>
          <b>Reliability: High</b>
        </div>
        <table>
          <thead>
            <tr><th>Price</th><th>iLvl</th><th>Q%</th><th>Account</th><th>Listed</th></tr>
          </thead>
          <tbody>
            <tr><td>5 exalted</td><td>82</td><td>21%</td><td>angusccn#7747</td><td>2d</td></tr>
            <tr><td>10 exalted</td><td>81</td><td>20%</td><td>Dappton#8895</td><td>7d</td></tr>
            <tr><td>15 exalted</td><td>80</td><td>21%</td><td>Refas#0425</td><td>4d</td></tr>
          </tbody>
        </table>
      </section>
    </article>
  `;
}

function renderModifier(tag: string, text: string, selected: boolean): string {
  return `
    <button class="modifier ${selected ? "is-selected" : ""}">
      <span>${tag}</span>
      <b>${text}</b>
    </button>
  `;
}

function renderTrade(): string {
  return `
    <article class="screen trade-screen">
      <header class="screen-header">
        <div>
          <p class="eyebrow">Shared economy tape</p>
          <h2>Market Board</h2>
          <span>Runes of Aldur - one day baseline</span>
        </div>
        <div class="segmented"><button class="is-active">30m</button><button>1d</button><button>7d</button></div>
      </header>
      <section class="two-column">
        ${renderMoverPanel("Biggest Winners", "Strongest risk-adjusted gains", "up")}
        ${renderMoverPanel("Biggest Losers", "Sharpest risk-adjusted declines", "down")}
      </section>
    </article>
  `;
}

function renderMoverPanel(title: string, sub: string, trend: "up" | "down"): string {
  const rows = marketRows.filter((row) => row.trend === trend);
  return `
    <section class="panel mover-panel ${trend}">
      <header><div><h3>${title}</h3><span>${sub}</span></div><b>${rows.length}</b></header>
      ${rows.map((row, index) => `
        <article class="market-row">
          <span class="rank">${index + 1}</span>
          <img src="${asset(row.trend === "up" ? "micro_market_trend_up.png" : "micro_market_trend_down.png")}" alt="" />
          <div><strong>${row.name}</strong><small>${row.family}</small></div>
          <b>${row.price}</b>
          <em>${row.change}</em>
        </article>
      `).join("")}
    </section>
  `;
}

function renderAtlas(): string {
  return `
    <article class="screen atlas-screen">
      <header class="screen-header">
        <div><p class="eyebrow">Atlas tracking</p><h2>Run Context</h2><span>OCR-assisted waystone safety</span></div>
        <button class="primary">Read Tab Overlay</button>
      </header>
      <section class="metric-grid">
        ${renderMetric("Area", "Headland", "Map level 79")}
        ${renderMetric("Waystone", "Armed", "T15 - 106% quant")}
        ${renderMetric("Safety", "Warning", "1 danger modifier")}
        ${renderMetric("Profile", "Martial Artist", "Life based")}
      </section>
      <section class="line-preview">
        <img src="${asset("micro_status_hazard.png")}" alt="" />
        <div>
          <strong>Headland</strong>
          <span>OCR 16 mods | Chest, Strongbox | 0:42</span>
          <b>Risk: Monsters deal 16% of damage as extra lightning</b>
        </div>
        <button>Open</button>
      </section>
    </article>
  `;
}

function renderMetric(label: string, value: string, sub: string): string {
  return `<section class="panel metric"><p class="eyebrow">${label}</p><h3>${value}</h3><span>${sub}</span></section>`;
}

function renderTemple(): string {
  return `
    <article class="screen temple-screen">
      <aside class="panel room-palette">
        <p class="eyebrow">Rooms</p>
        <div class="room-icons">
          ${["micro_status_chest.png","micro_status_boss.png","micro_status_shrine.png","micro_hazard_danger.png","micro_market_coin_stack.png","micro_status_waystone.png"].map((icon) => `<button><img src="${asset(icon)}" alt="" /></button>`).join("")}
        </div>
        <button class="primary wide">Destabilize</button>
        <button class="ghost wide">Undo</button>
      </aside>
      <section class="temple-board">
        ${markedTempleNodes.map(renderTempleTile).join("")}
      </section>
      <aside class="panel inspector">
        <p class="eyebrow">Active Bonuses</p>
        <h3>Effect Summary</h3>
        <dl>
          <dt>Monster</dt><dd>Rare chests +10%</dd>
          <dt>Loot</dt><dd>Increased gold +25%</dd>
          <dt>Special</dt><dd>Architect's Orb</dd>
        </dl>
      </aside>
    </article>
  `;
}

function renderTempleTile(node: TempleNode): string {
  const x = 50 + node.x * 7.8 + node.y * 7.8;
  const y = 45 + node.y * 5.2 - node.x * 5.2;
  return `<button class="temple-tile ${node.state}" style="left:${x}%;top:${y}%"><span>${node.label ?? ""}</span></button>`;
}

function renderProfile(): string {
  return `
    <article class="screen profile-screen">
      <section class="panel hero-profile">
        <div class="avatar">MA</div>
        <div>
          <p class="eyebrow">Runes of Aldur League</p>
          <h2>Pharsbeyblade</h2>
          <span>Level 97 Martial Artist</span>
        </div>
      </section>
      <section class="stat-columns">
        <div class="panel"><h3>Defensive</h3><p>Life 1329 / Energy Shield 1945 / Spirit 156</p><p>Resistances 75 / 74 / 75 / 100</p></div>
        <div class="panel"><h3>Build Fingerprint</h3><p>General safe mapping</p><p>Chaos safe, armour light, flask dependent.</p></div>
      </section>
    </article>
  `;
}

function renderSettings(): string {
  return `
    <article class="screen settings-screen">
      <header class="screen-header"><div><p class="eyebrow">Settings</p><h2>Overlay Feel</h2><span>Experimental controls are local to this shell.</span></div></header>
      <section class="settings-grid">
        <label class="panel control">
          <span>Accent Hue</span>
          <input data-control="hue" type="range" min="0" max="359" value="${state.hue}" />
          <b>${state.hue} deg</b>
        </label>
        <label class="panel control">
          <span>Panel Transparency</span>
          <input data-control="opacity" type="range" min="35" max="100" value="${state.opacity}" />
          <b>${state.opacity}%</b>
        </label>
        <section class="panel"><h3>Hotkeys</h3><p>Item scan: Ctrl + C</p><p>Waystone arm: Alt + W</p><p>Trade URL: Alt + D</p></section>
        <section class="panel"><h3>Discord RPC</h3><p>Enabled by default in production. This experiment only models the shell.</p></section>
      </section>
    </article>
  `;
}

function renderLineMode(): string {
  return `
    <main class="line-shell">
      <div class="line-icon"><img src="${asset("micro_status_waystone.png")}" alt="" /></div>
      <div class="line-copy">
        <strong>Headland</strong>
        <span>OCR 16 mods | Chest, Strongbox | 0:42</span>
        <b>Risk: Monsters deal 16% of damage as extra lightning</b>
      </div>
      <div class="line-metrics">
        <span>R 54%</span>
        <span>Pack 4%</span>
        <span>Rare 112%</span>
      </div>
      <button data-action="full">Open</button>
    </main>
  `;
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab as TabId;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-action='line']").forEach((button) => {
    button.addEventListener("click", () => {
      state.lineMode = true;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-action='full']").forEach((button) => {
    button.addEventListener("click", () => {
      state.lineMode = false;
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>("[data-control='hue']").forEach((input) => {
    input.addEventListener("input", () => {
      state.hue = Number(input.value);
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>("[data-control='opacity']").forEach((input) => {
    input.addEventListener("input", () => {
      state.opacity = Number(input.value);
      render();
    });
  });
}

render();
