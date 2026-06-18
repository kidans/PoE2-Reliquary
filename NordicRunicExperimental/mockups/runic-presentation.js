const root = document.querySelector(".runic-root");
const tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
const filterButtons = Array.from(document.querySelectorAll("[data-mod-filter]"));
const filterCount = document.querySelector("[data-filter-count]");
const clearFilters = document.querySelector("[data-clear-filters]");
const hueControl = document.querySelector("[data-hue-control]");
const alphaControl = document.querySelector("[data-alpha-control]");
const saturationControl = document.querySelector("[data-saturation-control]");

const validTabs = new Set(tabButtons.map((button) => button.dataset.tabTarget).filter(Boolean));

function setActiveTab(tabName, updateHash = true) {
  if (!validTabs.has(tabName)) return;
  root?.setAttribute("data-active-tab", tabName);
  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabTarget === tabName);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.tabPanel === tabName);
  });
  if (updateHash && window.location.hash.slice(1) !== tabName) {
    window.history.replaceState(null, "", `#${tabName}`);
  }
}

function updateFilterCount() {
  if (!filterCount) return;
  const activeFilters = filterButtons.filter((button) => button.classList.contains("is-selected")).length;
  filterCount.textContent = String(activeFilters);
}

function setCssNumber(name, value) {
  document.documentElement.style.setProperty(name, value);
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tabName = button.dataset.tabTarget;
    if (tabName) setActiveTab(tabName);
  });
});

window.addEventListener("hashchange", () => {
  setActiveTab(window.location.hash.slice(1), false);
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("is-selected");
    updateFilterCount();
  });
});

clearFilters?.addEventListener("click", () => {
  filterButtons.forEach((button) => button.classList.remove("is-selected"));
  updateFilterCount();
});

hueControl?.addEventListener("input", (event) => {
  setCssNumber("--accent-hue", event.target.value);
});

alphaControl?.addEventListener("input", (event) => {
  const alpha = Number(event.target.value) / 100;
  setCssNumber("--panel-alpha", alpha.toFixed(2));
});

saturationControl?.addEventListener("input", (event) => {
  const saturation = Number(event.target.value) / 100;
  setCssNumber("--saturation", saturation.toFixed(2));
});

updateFilterCount();
setActiveTab(window.location.hash.slice(1) || "scan", false);
