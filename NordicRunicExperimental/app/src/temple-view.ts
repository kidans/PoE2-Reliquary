import {
  PLACEABLE_TEMPLE_ROOMS,
  TEMPLE_ADJACENCY,
  TEMPLE_MODIFIER_TARGETS,
  TEMPLE_ROOMS,
  type TempleRoomId,
  type TempleTier,
} from "./temple-data";
import {
  calculateDestabilizationBudget,
  calculateTempleEffectSummary,
  canDestabilizeCell,
  describeUpgradeRule,
  getTempleCellByKey,
  getTempleUpgradeHint,
  templeAtziriEndpointPosition,
  templeCellConnectsToAtziriEndpoint,
  templeCellsConnect,
  templeCellKey,
  templeGridPosition,
  templeNeighbors,
  templeSummary,
  validateTemplePlacement,
  type TempleDestabilizationOptions,
  type TempleEffectEntry,
  type TempleEffectSummary,
  type TempleModifierSource,
  type TempleSpecialBonus,
  type TempleCell,
  type TempleLayoutState,
} from "./temple-engine";

export type TempleViewModel = {
  layout: TempleLayoutState;
  selectedRoomId: TempleRoomId;
  selectedCellKey: string | null;
  saveName: string;
  destabilization: {
    options: TempleDestabilizationOptions;
    undoCount: number;
    busy: boolean;
    activeKey: string | null;
    lockedKey: string | null;
    removedKeys: string[];
    lastSeed: string | null;
  };
};

export function renderTemplePanel(model: TempleViewModel) {
  const selectedCell = getTempleCellByKey(model.layout, model.selectedCellKey);
  const inspectedRoom = selectedCell?.roomId && selectedCell.roomId !== "empty"
    ? TEMPLE_ROOMS[selectedCell.roomId]
    : TEMPLE_ROOMS[model.selectedRoomId];
  const hint = selectedCell
    ? getTempleUpgradeHint(model.layout, selectedCell.x, selectedCell.y)
    : null;
  const summary = templeSummary(model.layout);

  return `
    <section class="temple-panel">
      <aside class="temple-sidebar temple-room-dock">
        <div class="temple-panel-heading">
          <p class="section-label">Rooms</p>
          <span>${PLACEABLE_TEMPLE_ROOMS.length} placeable</span>
        </div>
        <div class="temple-room-grid">
          ${PLACEABLE_TEMPLE_ROOMS.map((roomId) => renderRoomButton(roomId, model.selectedRoomId)).join("")}
        </div>
        <div class="temple-save-card">
          <div class="temple-panel-heading">
            <p class="section-label">My Favorites</p>
            <span>local</span>
          </div>
          <div class="temple-save-row">
            <input data-temple-save-name type="text" value="${escapeAttribute(model.saveName)}" placeholder="Layout name..." />
            <button class="action-button" data-temple-save type="button">Save</button>
          </div>
          <div class="temple-empty-save">
            <span aria-hidden="true">□</span>
            <p>No saved layouts yet.</p>
            <small>Save your first layout above.</small>
          </div>
        </div>
        <div class="temple-save-card temple-destabilization-dock">
          <div class="temple-panel-heading">
            <p class="section-label">Destabilization</p>
            <span>simulate</span>
          </div>
          ${renderDestabilizationPanel(model, selectedCell)}
        </div>
      </aside>

      <section class="temple-board-shell">
        <div class="temple-board-meta">
          <span>${summary.placed} rooms</span>
          <span>${summary.tier3} tier III</span>
          <span>${summary.unreachable} unreachable</span>
        </div>
        <div class="temple-board" aria-label="Atziri's Temple grid">
          ${renderTempleConnections(model.layout)}
          ${renderTempleAtziriEndpoint(model.layout)}
          ${model.layout.cells.map((cell) => renderTempleCell(model.layout, cell, model.selectedRoomId, model.selectedCellKey, model.destabilization)).join("")}
        </div>
      </section>

      <aside class="temple-sidebar temple-inspector">
        <div class="temple-inspector-tabs">
          <button type="button" class="is-active">How to use</button>
          <button type="button">Visual indicators</button>
        </div>
        <div class="temple-inspector-card">
          <p class="section-label">Selected</p>
          <div class="temple-selected-room">
            ${renderRoomIcon(inspectedRoom.id, 38)}
            <div>
              <strong>${escapeHtml(inspectedRoom.name)}</strong>
              <small>${escapeHtml(inspectedRoom.description)}</small>
            </div>
          </div>
          ${selectedCell ? renderCellControls(selectedCell) : "<p>Select a tile to edit its tier or clear it.</p>"}
          ${hint ? `
            <div class="temple-hint ${hint.satisfied ? "is-satisfied" : ""}">
              <strong>${escapeHtml(hint.title)}</strong>
              <span>${escapeHtml(hint.detail)}</span>
            </div>
          ` : ""}
        </div>
        <div class="temple-inspector-card is-active-bonuses">
          <p class="section-label">Active Bonuses</p>
          <div class="temple-effect-scroll">
            ${renderActiveBonuses(model.layout)}
          </div>
        </div>
        <div class="temple-inspector-card">
          <p class="section-label">Usage</p>
          <ul class="temple-help-list">
            <li>Pick a room icon, then click a tile.</li>
            <li>Click a placed tile to inspect it.</li>
            <li>Tier hints are local and conservative in this first pass.</li>
          </ul>
        </div>
      </aside>
    </section>
  `;
}

function renderRoomButton(roomId: TempleRoomId, selectedRoomId: TempleRoomId) {
  const room = TEMPLE_ROOMS[roomId];
  const active = roomId === selectedRoomId ? " is-active" : "";
  return `
    <button class="temple-room-button${active}" data-temple-room="${escapeAttribute(roomId)}" type="button" title="${escapeAttribute(room.name)}">
      ${renderRoomIcon(roomId, 31)}
      <span>${escapeHtml(room.shortName)}</span>
    </button>
  `;
}

function renderTempleCell(
  layout: TempleLayoutState,
  cell: TempleCell,
  selectedRoomId: TempleRoomId,
  selectedCellKey: string | null,
  destabilization: TempleViewModel["destabilization"],
) {
  const room = TEMPLE_ROOMS[cell.roomId];
  const key = templeCellKey(cell.x, cell.y);
  const position = templeGridPosition(cell.x, cell.y);
  const tooltipSide = position.left > 58 ? "west" : "east";
  const tooltipVertical = position.top < 22 ? "high" : position.top > 72 ? "low" : "middle";
  const placement = cell.roomId === "empty"
    ? validateTemplePlacement(layout, cell.x, cell.y, selectedRoomId)
    : null;
  const classes = [
    "temple-cell",
    cell.roomId === "empty" ? "is-empty" : "is-filled",
    placement?.valid ? "is-placeable" : "",
    placement && !placement.valid ? "is-invalid-placement" : "",
    cell.reachable ? "is-reachable" : "is-unreachable",
    cell.inGeneratorRange ? "is-powered" : "",
    cell.locked ? "is-locked" : "",
    destabilization.activeKey === key ? "is-destabilizing" : "",
    destabilization.lockedKey === key ? "is-destabilization-locked" : "",
    destabilization.removedKeys.includes(key) ? "is-destabilized" : "",
    selectedCellKey === key ? "is-selected" : "",
  ].filter(Boolean).join(" ");

  return `
    <button
      class="${classes}"
      data-temple-cell="${escapeAttribute(key)}"
      ${cell.roomId === "empty" ? "" : `aria-describedby="temple-cell-info-${escapeAttribute(key)}"`}
      aria-label="${escapeAttribute(cell.roomId === "empty" ? "Empty temple tile" : `${room.name} tier ${cell.tier}`)}"
      style="--room-color: ${escapeAttribute(room.color)}; --temple-left: ${position.left}%; --temple-top: ${position.top}%;"
      type="button"
    >
      <span class="temple-cell-inner">
        ${cell.roomId === "empty" ? "" : renderRoomIcon(cell.roomId, 24)}
        ${cell.roomId !== "empty" ? `<small>${cell.tier}</small>` : ""}
      </span>
    </button>
    ${cell.roomId === "empty" ? "" : renderTempleCellInfo(cell.roomId, cell.tier, key, tooltipSide, tooltipVertical)}
  `;
}

function renderTempleConnections(layout: TempleLayoutState) {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const cell of layout.cells) {
    if (cell.roomId === "empty") continue;
    for (const neighbor of templeNeighbors(layout, cell.x, cell.y)) {
      if (neighbor.roomId === "empty" || !templeCellsConnect(cell, neighbor)) continue;
      const a = templeCellKey(cell.x, cell.y);
      const b = templeCellKey(neighbor.x, neighbor.y);
      const edgeKey = [a, b].sort().join("|");
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      const start = templeGridPosition(cell.x, cell.y);
      const end = templeGridPosition(neighbor.x, neighbor.y);
      lines.push(`
        <line
          x1="${start.left}"
          y1="${start.top}"
          x2="${end.left}"
          y2="${end.top}"
        />
      `);
    }
  }

  const topCenter = layout.cells.find((cell) => templeCellConnectsToAtziriEndpoint(cell));
  if (topCenter) {
    const start = templeAtziriEndpointPosition();
    const end = templeGridPosition(topCenter.x, topCenter.y);
    lines.push(`
      <line
        class="temple-atziri-link"
        x1="${start.left}"
        y1="${start.top}"
        x2="${end.left}"
        y2="${end.top}"
      />
    `);
  }

  return `<svg class="temple-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join("")}</svg>`;
}

function renderTempleAtziriEndpoint(layout: TempleLayoutState) {
  const room = TEMPLE_ROOMS.atziri_chamber;
  const position = templeAtziriEndpointPosition();
  const tooltipSide = position.left > 58 ? "west" : "east";
  const tooltipVertical = position.top < 22 ? "high" : position.top > 72 ? "low" : "middle";
  const classes = [
    "temple-cell",
    "temple-atziri-endpoint",
    "is-filled",
    "is-locked",
    layout.atziriEndpoint.reachable ? "is-reachable" : "is-unreachable",
  ].join(" ");

  return `
    <div
      class="${classes}"
      style="--room-color: ${escapeAttribute(room.color)}; --temple-left: ${position.left}%; --temple-top: ${position.top}%;"
      aria-label="${escapeAttribute(room.name)}"
    >
      <span class="temple-cell-inner">
        ${renderRoomIcon("atziri_chamber", 24)}
        <small>A</small>
      </span>
    </div>
    ${renderTempleCellInfo("atziri_chamber", 1, "atziri-endpoint", tooltipSide, tooltipVertical)}
  `;
}

function renderTempleCellInfo(
  roomId: TempleRoomId,
  tier: TempleTier,
  id: string,
  side: "east" | "west",
  vertical: "high" | "middle" | "low",
) {
  const room = TEMPLE_ROOMS[roomId];
  const effects = room.tierEffects[tier] ?? [];
  const modifierTargets = getModifierTargetsForRoom(roomId);
  const connectTargets = getConnectTargetsForRoom(roomId);
  const upgrades = getRoomsUpgradedByRoom(roomId);
  const upgradedBy = getRoomsThatUpgradeRoom(roomId);
  const manualUpgradeNotes = getManualUpgradeNotes(roomId);

  return `
    <article
      id="temple-cell-info-${escapeAttribute(id)}"
      class="temple-cell-info is-${side} is-${vertical}"
      style="--room-color: ${escapeAttribute(room.color)}; --temple-left: ${templeTooltipPosition(id, "left")}%; --temple-top: ${templeTooltipPosition(id, "top")}%;"
      role="tooltip"
    >
      <header class="temple-cell-info-head">
        ${renderRoomIcon(roomId, 28)}
        <div>
          <strong>${escapeHtml(room.name)}</strong>
          <span>${tier > 0 ? `Tier ${tier}` : "Unassigned"} · ${escapeHtml(room.category)}</span>
        </div>
      </header>
      <div class="temple-cell-info-effect">
        ${effects.length
          ? effects.map((effect) => `<p>${escapeHtml(effect)}</p>`).join("")
          : `<p>${escapeHtml(room.description)}</p>`}
      </div>
      ${modifierTargets.length ? renderTempleInfoIconSection("Increases effects of", modifierTargets) : ""}
      ${connectTargets.length ? renderTempleInfoIconSection("Can connect to", connectTargets) : ""}
      ${upgrades.length ? renderTempleInfoIconSection("Upgrades", upgrades) : ""}
      ${upgradedBy.length ? renderTempleInfoIconSection("Upgraded by", upgradedBy) : ""}
      ${manualUpgradeNotes.length ? `
        <section class="temple-cell-info-section">
          <span>Manual notes</span>
          ${manualUpgradeNotes.map((note) => `<small>${escapeHtml(note)}</small>`).join("")}
        </section>
      ` : ""}
    </article>
  `;
}

function templeTooltipPosition(id: string, axis: "left" | "top") {
  if (id === "atziri-endpoint") {
    const position = templeAtziriEndpointPosition();
    return axis === "left" ? position.left : position.top;
  }
  const [rawX, rawY] = id.split(",");
  const position = templeGridPosition(Number(rawX), Number(rawY));
  return axis === "left" ? position.left : position.top;
}

function renderTempleInfoIconSection(title: string, roomIds: TempleRoomId[]) {
  const visible = roomIds.slice(0, 10);
  const overflow = roomIds.length - visible.length;
  return `
    <section class="temple-cell-info-section">
      <span>${escapeHtml(title)}</span>
      <div class="temple-cell-info-icons">
        ${visible.map((roomId) => `
          <span title="${escapeAttribute(TEMPLE_ROOMS[roomId].name)}">
            ${renderRoomIcon(roomId, 24)}
          </span>
        `).join("")}
        ${overflow > 0 ? `<em>+${overflow}</em>` : ""}
      </div>
    </section>
  `;
}

function getModifierTargetsForRoom(roomId: TempleRoomId) {
  if (roomId === "spymasters_study") return TEMPLE_MODIFIER_TARGETS.spymasters_study;
  if (roomId === "workshop") return TEMPLE_MODIFIER_TARGETS.workshop;
  if (roomId === "thaumaturges_laboratory") return TEMPLE_MODIFIER_TARGETS.thaumaturges_laboratory;
  return [];
}

function getConnectTargetsForRoom(roomId: TempleRoomId) {
  return uniqueTempleRooms(TEMPLE_ADJACENCY[roomId] ?? []);
}

function getRoomsUpgradedByRoom(roomId: TempleRoomId) {
  const matches = Object.values(TEMPLE_ROOMS)
    .filter((room) => Object.values(room.upgrades).some((rule) => rule.type === "adjacent" && rule.rooms.includes(roomId)))
    .map((room) => room.id);
  return uniqueTempleRooms(matches);
}

function getRoomsThatUpgradeRoom(roomId: TempleRoomId) {
  const room = TEMPLE_ROOMS[roomId];
  const matches = Object.values(room.upgrades)
    .flatMap((rule) => rule.type === "adjacent" ? rule.rooms : []);
  return uniqueTempleRooms(matches);
}

function getManualUpgradeNotes(roomId: TempleRoomId) {
  const room = TEMPLE_ROOMS[roomId];
  return Object.values(room.upgrades)
    .filter((rule) => rule.type === "manual")
    .map((rule) => rule.description);
}

function uniqueTempleRooms(roomIds: TempleRoomId[]) {
  return Array.from(new Set(roomIds.filter((roomId) => roomId !== "empty")));
}

function renderCellControls(cell: TempleCell) {
  const room = TEMPLE_ROOMS[cell.roomId];
  if (cell.roomId === "empty") {
    return "<p>This tile is empty. Pick a room from the left, then click this tile.</p>";
  }
  const lockable = isLockableCell(cell);

  return `
    <div class="temple-cell-controls">
      <span>${escapeHtml(room.name)} at ${cell.x},${cell.y}</span>
      <div class="temple-tier-buttons">
        ${([1, 2, 3] as TempleTier[]).map((tier) => `
          <button class="${cell.tier === tier ? "is-active" : ""}" data-temple-tier="${tier}" data-temple-cell="${escapeAttribute(templeCellKey(cell.x, cell.y))}" type="button">T${tier}</button>
        `).join("")}
      </div>
      ${lockable ? `
        <button class="temple-lock-button ${cell.locked ? "is-active" : ""}" data-temple-lock-toggle="${escapeAttribute(templeCellKey(cell.x, cell.y))}" type="button">
          ${cell.locked ? "Unlock room" : "Lock room"}
        </button>
      ` : ""}
      ${cell.locked ? "" : `<button class="temple-clear-button" data-temple-clear="${escapeAttribute(templeCellKey(cell.x, cell.y))}" type="button">Clear tile</button>`}
    </div>
  `;
}

function renderDestabilizationPanel(model: TempleViewModel, selectedCell: TempleCell | null) {
  const { budget, roomCount } = calculateDestabilizationBudget(model.layout, model.destabilization.options);
  const selectedKey = selectedCell ? templeCellKey(selectedCell.x, selectedCell.y) : null;
  const selectedTargetable = selectedKey ? canDestabilizeCell(model.layout, selectedKey) : false;
  const status = model.destabilization.busy
    ? "Breaking rooms..."
    : model.destabilization.lastSeed
      ? `Last seed ${model.destabilization.lastSeed}`
      : "Ready to simulate temple decay.";

  return `
    <div class="temple-destabilization-card">
      <div class="temple-destabilization-metrics">
        <span><strong>${roomCount}</strong> rooms</span>
        <span><strong>${budget}</strong> attempts</span>
      </div>
      <label class="temple-check-row">
        <input data-temple-destabilize-option="architectDefeated" type="checkbox" ${model.destabilization.options.architectDefeated ? "checked" : ""} ${model.destabilization.busy ? "disabled" : ""} />
        <span>Architect defeated (+1)</span>
      </label>
      <label class="temple-check-row">
        <input data-temple-destabilize-option="atziriDefeated" type="checkbox" ${model.destabilization.options.atziriDefeated ? "checked" : ""} ${model.destabilization.busy ? "disabled" : ""} />
        <span>Atziri defeated (+1)</span>
      </label>
      <div class="temple-destabilization-actions">
        <button class="action-button" data-temple-destabilize type="button" ${model.destabilization.busy ? "disabled" : ""}>Destabilize</button>
        <button class="temple-clear-button" data-temple-destabilize-undo type="button" ${model.destabilization.busy || !model.destabilization.undoCount ? "disabled" : ""}>Undo</button>
      </div>
      <small>${escapeHtml(status)}</small>
      ${selectedCell && isLockableCell(selectedCell) ? `
        <small>${selectedTargetable ? "Selected room can be targeted." : "Selected room is protected by connectivity."}</small>
      ` : ""}
    </div>
  `;
}

function renderActiveBonuses(layout: TempleLayoutState) {
  const summary = calculateTempleEffectSummary(layout);
  const hasEffects = summary.monsterEffects.length
    || summary.itemEffects.length
    || summary.chestEffects.length
    || summary.specialBonuses.length
    || summary.modifierSources.length;

  if (!hasEffects) {
    return "<p>No room bonuses yet.</p>";
  }

  return `
    <div class="temple-effect-stack">
      ${renderEffectGroup("Monster", summary.monsterEffects)}
      ${renderEffectGroup("Item / Loot", summary.itemEffects)}
      ${renderEffectGroup("Chest", summary.chestEffects)}
      ${renderSpecialGroup("Special", summary.specialBonuses)}
      ${renderModifierSources(summary)}
    </div>
  `;
}

function renderEffectGroup(title: string, effects: TempleEffectEntry[]) {
  if (!effects.length) return "";
  return `
    <section class="temple-effect-group">
      <h4>${escapeHtml(title)}</h4>
      ${effects.map(renderEffectEntry).join("")}
    </section>
  `;
}

function renderEffectEntry(effect: TempleEffectEntry) {
  const changed = effect.finalValue !== effect.baseValue;
  const sourceLabel = effect.sources
    .slice(0, 3)
    .map((source) => `${source.roomName} T${source.tier}`)
    .join(", ");
  const overflow = effect.sources.length > 3 ? ` +${effect.sources.length - 3}` : "";
  return `
    <article class="temple-effect-entry ${effect.hasDiminishingReturns ? "has-diminishing" : ""}">
      <div>
        <strong>${escapeHtml(effect.name)}</strong>
        <small>${escapeHtml(sourceLabel)}${escapeHtml(overflow)}</small>
      </div>
      <span class="temple-effect-value ${changed ? "is-modified" : ""}">
        ${formatEffectValue(effect.baseValue, effect.unit)}
        ${changed ? `-> ${formatEffectValue(effect.finalValue, effect.unit)}` : ""}
      </span>
      ${effect.hasDiminishingReturns ? `<em title="Diminishing returns applied">DR</em>` : ""}
    </article>
  `;
}

function renderSpecialGroup(title: string, bonuses: TempleSpecialBonus[]) {
  if (!bonuses.length) return "";
  return `
    <section class="temple-effect-group">
      <h4>${escapeHtml(title)}</h4>
      ${bonuses.map(renderSpecialBonus).join("")}
    </section>
  `;
}

function renderSpecialBonus(bonus: TempleSpecialBonus) {
  const roomLabel = bonus.rooms
    .slice(0, 2)
    .map((room) => `${room.roomName} T${room.tier}`)
    .join(", ");
  return `
    <article class="temple-effect-entry">
      <div>
        <strong>${escapeHtml(bonus.bonus)}</strong>
        <small>${escapeHtml(roomLabel)}${bonus.rooms.length > 2 ? ` +${bonus.rooms.length - 2}` : ""}</small>
      </div>
      <span class="temple-effect-value">${bonus.count > 1 ? `x${bonus.count}` : "active"}</span>
    </article>
  `;
}

function renderModifierSources(summary: TempleEffectSummary) {
  if (!summary.modifierSources.length) return "";
  return `
    <section class="temple-effect-group is-sources">
      <h4>Modifier Sources</h4>
      ${summary.modifierSources.map(renderModifierSource).join("")}
    </section>
  `;
}

function renderModifierSource(source: TempleModifierSource) {
  return `
    <article class="temple-effect-entry">
      <div>
        <strong>${escapeHtml(source.roomName)} T${source.tier}</strong>
        <small>${escapeHtml(source.affectsLabel)}</small>
      </div>
      <span class="temple-effect-value">+${formatEffectValue(source.value, "%")}</span>
    </article>
  `;
}

function formatEffectValue(value: number, unit: "%" | "") {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}${unit}`;
}

function renderRoomIcon(roomId: TempleRoomId, size: number) {
  const room = TEMPLE_ROOMS[roomId];
  if (!room.icon) {
    return `<span class="temple-fallback-icon" style="--room-color: ${escapeAttribute(room.color)}; width:${size}px; height:${size}px"></span>`;
  }

  return `<img class="temple-room-icon" src="${escapeAttribute(room.icon)}" width="${size}" height="${size}" alt="" />`;
}

function isLockableCell(cell: TempleCell) {
  return !(cell.x === 4 && cell.y === 8)
    && cell.roomId !== "empty"
    && cell.roomId !== "path"
    && cell.roomId !== "sacrifice_room"
    && cell.roomId !== "atziri_chamber";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string | number) {
  return escapeHtml(String(value));
}
