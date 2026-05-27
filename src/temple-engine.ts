import {
  PLACEABLE_TEMPLE_ROOMS,
  TEMPLE_ADJACENCY,
  TEMPLE_MODIFIER_TARGETS,
  TEMPLE_PLACEMENT_ADJACENCY,
  TEMPLE_ROOMS,
  type TempleModifierSourceId,
  type TempleRoomId,
  type TempleTier,
  type TempleUpgradeRule,
} from "./temple-data";

export const TEMPLE_GRID_SIZE = 9;
export const TEMPLE_STORAGE_KEY = "reliquary.temple.layout.v1";

export type TempleCell = {
  x: number;
  y: number;
  roomId: TempleRoomId;
  tier: TempleTier;
  manualTier: TempleTier | null;
  reachable: boolean;
  inGeneratorRange: boolean;
  generatorPower: number;
  hasMedallion: boolean;
  locked: boolean;
};

export type TempleEndpoint = {
  id: "atziri";
  x: 4;
  y: -1;
  roomId: "atziri_chamber";
  tier: 1;
  reachable: boolean;
  locked: true;
};

export type TempleLayoutState = {
  version: 1;
  cells: TempleCell[];
  atziriEndpoint: TempleEndpoint;
  selectedCellKey: string | null;
  updatedAt: number;
};

export type TemplePlacementResult = {
  valid: boolean;
  reason: string | null;
};

export type TempleUpgradeHint = {
  title: string;
  detail: string;
  nextTier: TempleTier | null;
  satisfied: boolean;
};

export type TempleEffectCategory = "monster" | "item" | "chest" | "special";

export type TempleModifierSource = {
  roomId: TempleModifierSourceId;
  roomName: string;
  tier: TempleTier;
  value: number;
  targets: TempleRoomId[];
  affectsLabel: string;
};

export type TempleEffectSource = {
  roomId: TempleRoomId;
  roomName: string;
  tier: TempleTier;
  effect: string;
  baseContribution: number;
  modifiedContribution: number;
  multiplier: number;
  count: number;
};

export type TempleEffectEntry = {
  name: string;
  category: TempleEffectCategory;
  baseValue: number;
  finalValue: number;
  unit: "%" | "";
  hasDiminishingReturns: boolean;
  sources: TempleEffectSource[];
};

export type TempleSpecialBonus = {
  bonus: string;
  count: number;
  rooms: Array<{ roomName: string; tier: TempleTier }>;
};

export type TempleEffectSummary = {
  monsterEffects: TempleEffectEntry[];
  itemEffects: TempleEffectEntry[];
  chestEffects: TempleEffectEntry[];
  specialBonuses: TempleSpecialBonus[];
  modifierSources: TempleModifierSource[];
  spymasterModifier: number;
  golemWorksModifier: number;
  thaumaturgeModifier: number;
};

export type TempleDestabilizationOptions = {
  architectDefeated: boolean;
  atziriDefeated: boolean;
  seed?: number | string;
};

export type TempleDestabilizationAttempt = {
  attemptIndex: number;
  targetKey: string | null;
  roomId: TempleRoomId | null;
  result: "removed" | "locked" | "skipped";
  reason: "removed" | "locked" | "no-targets";
};

export type TempleDestabilizationResult = {
  before: TempleLayoutState;
  after: TempleLayoutState;
  seed: string;
  budget: number;
  roomCount: number;
  attempts: TempleDestabilizationAttempt[];
  removedKeys: string[];
};

export function templeCellKey(x: number, y: number) {
  return `${x},${y}`;
}

export function templeGridPosition(x: number, y: number) {
  const center = (TEMPLE_GRID_SIZE - 1) / 2;
  const left = 50 + ((x - y) / (TEMPLE_GRID_SIZE - 1)) * 50;
  const top = 50 + (((x + y) - center * 2) / (TEMPLE_GRID_SIZE - 1)) * 50;
  return {
    left: Math.round(left * 1000) / 1000,
    top: Math.round(top * 1000) / 1000,
  };
}

export function templeAtziriEndpointPosition() {
  return templeGridPosition(4, -1);
}

export function createTempleLayout(): TempleLayoutState {
  const cells: TempleCell[] = [];
  for (let y = 0; y < TEMPLE_GRID_SIZE; y++) {
    for (let x = 0; x < TEMPLE_GRID_SIZE; x++) {
      const isStart = x === 4 && y === 8;
      cells.push({
        x,
        y,
        roomId: isStart ? "path" : "empty",
        tier: isStart ? 1 : 0,
        manualTier: null,
        reachable: isStart,
        inGeneratorRange: false,
        generatorPower: 0,
        hasMedallion: false,
        locked: isStart,
      });
    }
  }

  return recalculateTempleLayout({
    version: 1,
    cells,
    atziriEndpoint: createTempleAtziriEndpoint(false),
    selectedCellKey: templeCellKey(4, 8),
    updatedAt: Date.now(),
  });
}

export function getTempleCell(layout: TempleLayoutState, x: number, y: number) {
  return layout.cells.find((cell) => cell.x === x && cell.y === y) ?? null;
}

export function getTempleCellByKey(layout: TempleLayoutState, key: string | null) {
  if (!key) return null;
  const [rawX, rawY] = key.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return getTempleCell(layout, x, y);
}

export function setTempleRoom(
  layout: TempleLayoutState,
  x: number,
  y: number,
  roomId: TempleRoomId,
): TempleLayoutState {
  const result = validateTemplePlacement(layout, x, y, roomId);
  if (!result.valid) return layout;

  const nextCells = layout.cells.map((cell) => {
    if (cell.x !== x || cell.y !== y) return cell;
    const tier: TempleTier = roomId === "empty" ? 0 : 1;
    return {
      ...cell,
      roomId,
      tier,
      manualTier: null,
      reachable: false,
      inGeneratorRange: false,
      generatorPower: 0,
    };
  });

  return recalculateTempleLayout({
    ...layout,
    cells: nextCells,
    selectedCellKey: templeCellKey(x, y),
    updatedAt: Date.now(),
  });
}

export function setTempleManualTier(
  layout: TempleLayoutState,
  x: number,
  y: number,
  tier: TempleTier | null,
): TempleLayoutState {
  const cell = getTempleCell(layout, x, y);
  if (!cell || cell.roomId === "empty") return layout;

  const nextCells = layout.cells.map((entry) =>
    entry.x === x && entry.y === y
      ? {
          ...entry,
          manualTier: tier,
          tier: tier ?? entry.tier,
        }
      : entry,
  );

  return recalculateTempleLayout({
    ...layout,
    cells: nextCells,
    selectedCellKey: templeCellKey(x, y),
    updatedAt: Date.now(),
  });
}

export function setTempleCellLocked(
  layout: TempleLayoutState,
  x: number,
  y: number,
  locked: boolean,
): TempleLayoutState {
  const cell = getTempleCell(layout, x, y);
  if (!cell || !canToggleTempleLock(cell)) return layout;

  return {
    ...layout,
    cells: layout.cells.map((entry) =>
      entry.x === x && entry.y === y ? { ...entry, locked } : entry,
    ),
    selectedCellKey: templeCellKey(x, y),
    updatedAt: Date.now(),
  };
}

export function validateTemplePlacement(
  layout: TempleLayoutState,
  x: number,
  y: number,
  roomId: TempleRoomId,
): TemplePlacementResult {
  const cell = getTempleCell(layout, x, y);
  if (!cell) return { valid: false, reason: "Position is outside the temple grid." };
  if (cell.locked && cell.roomId !== roomId) {
    return { valid: false, reason: "This temple endpoint is locked." };
  }
  if (roomId === "empty") {
    return validateTempleClear(layout, cell);
  }
  if (!PLACEABLE_TEMPLE_ROOMS.includes(roomId)) {
    return { valid: false, reason: `${TEMPLE_ROOMS[roomId].name} is created by mechanics, not placed directly.` };
  }
  if (cell.roomId !== "empty" && cell.roomId !== roomId) {
    return { valid: false, reason: `${TEMPLE_ROOMS[cell.roomId].name} already occupies this tile.` };
  }
  if (roomId === "architect" || roomId === "reward_room") {
    return { valid: true, reason: null };
  }

  const legalNeighbors = TEMPLE_PLACEMENT_ADJACENCY[roomId] ?? [];
  const connectedNeighbors = templePlacementNeighbors(layout, x, y).filter((neighbor) =>
    neighbor.roomId !== "empty" && legalNeighbors.includes(neighbor.roomId),
  );
  if (!connectedNeighbors.length) {
    return {
      valid: false,
      reason: `${TEMPLE_ROOMS[roomId].name} needs a legal adjacent room before it can be placed.`,
    };
  }

  const restriction = validateTempleChainRestrictions(layout, cell, roomId);
  if (!restriction.valid) return restriction;

  return { valid: true, reason: null };
}

export function recalculateTempleLayout(layout: TempleLayoutState): TempleLayoutState {
  const transformed = resolveTempleTransformations(layout);
  const reachable = calculateTempleReachability(transformed);
  const baseTiers = resolveTempleTiers(reachable);
  return resolveTempleTiers(calculateTempleGeneratorRanges(baseTiers));
}

export function calculateTempleReachability(layout: TempleLayoutState): TempleLayoutState {
  const cells = layout.cells.map((cell) => ({ ...cell, reachable: false }));
  const start = cells.find((cell) => cell.x === 4 && cell.y === 8 && cell.roomId === "path")
    ?? cells.find((cell) => cell.locked && cell.roomId === "path")
    ?? cells.find((cell) => cell.roomId === "path");
  if (!start) return { ...layout, cells, atziriEndpoint: createTempleAtziriEndpoint(false) };

  const queue: TempleCell[] = [start];
  const seen = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    const key = templeCellKey(current.x, current.y);
    if (seen.has(key)) continue;
    seen.add(key);

    const currentIndex = cells.findIndex((cell) => cell.x === current.x && cell.y === current.y);
    cells[currentIndex] = { ...cells[currentIndex], reachable: true };

    for (const neighbor of templeNeighbors({ ...layout, cells }, current.x, current.y)) {
      if (neighbor.roomId === "empty") continue;
      if (!templeCellsConnect(current, neighbor)) continue;
      queue.push(neighbor);
    }
  }

  const topCenter = cells.find((cell) => cell.x === 4 && cell.y === 0);
  const atziriReachable = Boolean(topCenter && topCenter.roomId !== "empty" && topCenter.reachable);
  return { ...layout, cells, atziriEndpoint: createTempleAtziriEndpoint(atziriReachable) };
}

export function calculateTempleGeneratorRanges(layout: TempleLayoutState): TempleLayoutState {
  const generators = layout.cells.filter((cell) => cell.roomId === "dynamo" && cell.reachable);
  if (!generators.length) {
    return { ...layout, cells: layout.cells.map((cell) => ({ ...cell, inGeneratorRange: false, generatorPower: 0 })) };
  }

  const poweredCounts = new Map<string, number>();
  for (const generator of generators) {
    const range = generator.tier === 3 ? 5 : generator.tier === 2 ? 4 : 3;
    const queue = [{ x: generator.x, y: generator.y, distance: 0 }];
    const seen = new Set<string>();

    while (queue.length) {
      const current = queue.shift()!;
      const key = templeCellKey(current.x, current.y);
      if (seen.has(key) || current.distance > range) continue;
      seen.add(key);
      if (current.distance > 0) poweredCounts.set(key, (poweredCounts.get(key) ?? 0) + 1);
      const currentCell = getTempleCell(layout, current.x, current.y);
      if (current.distance > 0 && currentCell && templePowerStopsAt(currentCell.roomId)) continue;
      for (const neighbor of templeNeighbors(layout, current.x, current.y)) {
        if (neighbor.roomId === "empty" || !neighbor.reachable) continue;
        if (currentCell && !templeCellsConnect(currentCell, neighbor)) continue;
        queue.push({ x: neighbor.x, y: neighbor.y, distance: current.distance + 1 });
      }
    }
  }

  return {
    ...layout,
    cells: layout.cells.map((cell) => ({
      ...cell,
      inGeneratorRange: poweredCounts.has(templeCellKey(cell.x, cell.y)),
      generatorPower: poweredCounts.get(templeCellKey(cell.x, cell.y)) ?? 0,
    })),
  };
}

export function resolveTempleTiers(layout: TempleLayoutState): TempleLayoutState {
  return {
    ...layout,
    cells: layout.cells.map((cell) => {
      return { ...cell, tier: resolveTempleTier(layout, cell) };
    }),
  };
}

export function resolveTempleTransformations(layout: TempleLayoutState): TempleLayoutState {
  return {
    ...layout,
    cells: layout.cells.map((cell) => {
      if (!isGarrisonFamilyRoom(cell.roomId)) return cell;
      const neighbors = templeNeighbors(layout, cell.x, cell.y).map((neighbor) => neighbor.roomId);
      const roomId: TempleRoomId = neighbors.includes("spymasters_study")
        ? "legion_barrack"
        : neighbors.includes("synthflesh_lab")
          ? "transcendent_barrack"
          : "guardhouse";
      if (roomId === cell.roomId) return cell;
      return { ...cell, roomId, tier: 1, manualTier: null };
    }),
  };
}

export function getTempleUpgradeHint(
  layout: TempleLayoutState,
  x: number,
  y: number,
): TempleUpgradeHint {
  const cell = getTempleCell(layout, x, y);
  if (!cell || cell.roomId === "empty") {
    return {
      title: "Choose a room",
      detail: "Pick a room on the grid or place a new one from the left palette.",
      nextTier: null,
      satisfied: false,
    };
  }

  const nextTier = cell.tier >= 3 ? null : ((cell.tier + 1) as TempleTier);
  const definition = TEMPLE_ROOMS[cell.roomId];
  if (!nextTier || nextTier < 2) {
    return {
      title: "Tier capped",
      detail: `${definition.name} is already at its planned maximum tier.`,
      nextTier: null,
      satisfied: true,
    };
  }

  const rule = definition.upgrades[nextTier as 2 | 3];
  if (!rule) {
    return {
      title: "Manual upgrade",
      detail: definition.upgradeInfo ?? "No automatic upgrade rule is confirmed for this room yet.",
      nextTier,
      satisfied: false,
    };
  }

  return {
    title: `Next: Tier ${nextTier}`,
    detail: describeUpgradeRule(rule),
    nextTier,
    satisfied: ruleSatisfied(layout, cell, rule),
  };
}

export function templeRoomsConnect(a: TempleRoomId, b: TempleRoomId) {
  if (a === "empty" || b === "empty") return false;
  if (a === "path" || b === "path") return true;
  if (a === "architect" || b === "architect") return true;
  return Boolean(TEMPLE_ADJACENCY[a]?.includes(b) || TEMPLE_ADJACENCY[b]?.includes(a));
}

export function templeCellsConnect(a: TempleCell, b: TempleCell) {
  return templeRoomsConnect(a.roomId, b.roomId);
}

export function templeCellConnectsToAtziriEndpoint(cell: TempleCell) {
  return cell.x === 4 && cell.y === 0 && cell.roomId !== "empty";
}

export function templeNeighbors(layout: TempleLayoutState, x: number, y: number) {
  return [
    getTempleCell(layout, x, y - 1),
    getTempleCell(layout, x + 1, y),
    getTempleCell(layout, x, y + 1),
    getTempleCell(layout, x - 1, y),
  ].filter((cell): cell is TempleCell => Boolean(cell));
}

export function serializeTempleLayout(layout: TempleLayoutState) {
  return JSON.stringify(layout);
}

export function parseTempleLayout(raw: string): TempleLayoutState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TempleLayoutState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.cells) || parsed.cells.length !== TEMPLE_GRID_SIZE * TEMPLE_GRID_SIZE) {
      return null;
    }

    const cells: TempleCell[] = parsed.cells.map((cell, index) => {
      const x = Number(cell.x);
      const y = Number(cell.y);
      const fallbackX = index % TEMPLE_GRID_SIZE;
      const fallbackY = Math.floor(index / TEMPLE_GRID_SIZE);
      const roomId = isTempleRoomId(cell.roomId) ? cell.roomId : "empty";
      return {
        x: Number.isInteger(x) ? x : fallbackX,
        y: Number.isInteger(y) ? y : fallbackY,
        roomId,
        tier: normalizeTier(cell.tier, roomId),
        manualTier: cell.manualTier === null || cell.manualTier === undefined ? null : normalizeTier(cell.manualTier, roomId),
        reachable: Boolean(cell.reachable),
        inGeneratorRange: Boolean(cell.inGeneratorRange),
        generatorPower: typeof cell.generatorPower === "number" ? Math.max(0, Math.floor(cell.generatorPower)) : 0,
        hasMedallion: Boolean(cell.hasMedallion),
        locked: Boolean(cell.locked),
      };
    });

    return recalculateTempleLayout(repairLockedTempleEndpoints({
      version: 1,
      cells,
      atziriEndpoint: createTempleAtziriEndpoint(Boolean(
        parsed.atziriEndpoint?.reachable
        || (parsed as Partial<TempleLayoutState> & { architectEndpoint?: TempleEndpoint }).architectEndpoint?.reachable,
      )),
      selectedCellKey: typeof parsed.selectedCellKey === "string" ? parsed.selectedCellKey : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    }));
  } catch {
    return null;
  }
}

export function templeSummary(layout: TempleLayoutState) {
  const placed = layout.cells.filter((cell) => cell.roomId !== "empty");
  const tier3 = placed.filter((cell) => cell.tier === 3);
  const unreachable = placed.filter((cell) => !cell.reachable);
  return {
    placed: placed.length,
    tier3: tier3.length,
    unreachable: unreachable.length,
  };
}

export function calculateDestabilizationBudget(
  layout: TempleLayoutState,
  options: TempleDestabilizationOptions,
) {
  const roomCount = countDestabilizationRooms(layout);
  return {
    roomCount,
    budget: Math.max(1, Math.floor(roomCount * 0.1))
      + (options.architectDefeated ? 1 : 0)
      + (options.atziriDefeated ? 1 : 0),
  };
}

export function canDestabilizeCell(layout: TempleLayoutState, cellKey: string | null) {
  const cell = getTempleCellByKey(layout, cellKey);
  return Boolean(cell && isDestabilizationTargetCandidate(cell) && removalPreservesTempleConnectivity(layout, cell));
}

export function simulateDestabilization(
  layout: TempleLayoutState,
  options: TempleDestabilizationOptions,
): TempleDestabilizationResult {
  const before = cloneTempleLayout(layout);
  const { budget, roomCount } = calculateDestabilizationBudget(layout, options);
  const seed = normalizeDestabilizationSeed(options.seed);
  const random = seededRandom(seed);
  let current = cloneTempleLayout(layout);
  const attempts: TempleDestabilizationAttempt[] = [];
  const removedKeys: string[] = [];

  for (let index = 0; index < budget; index += 1) {
    const candidates = current.cells.filter((cell) =>
      isDestabilizationTargetCandidate(cell) && removalPreservesTempleConnectivity(current, cell),
    );
    if (!candidates.length) {
      attempts.push({
        attemptIndex: index + 1,
        targetKey: null,
        roomId: null,
        result: "skipped",
        reason: "no-targets",
      });
      continue;
    }

    const target = candidates[Math.floor(random() * candidates.length)];
    const key = templeCellKey(target.x, target.y);
    if (target.locked) {
      attempts.push({
        attemptIndex: index + 1,
        targetKey: key,
        roomId: target.roomId,
        result: "locked",
        reason: "locked",
      });
      continue;
    }

    current = removeTempleCellForDestabilization(current, target);
    removedKeys.push(key);
    attempts.push({
      attemptIndex: index + 1,
      targetKey: key,
      roomId: target.roomId,
      result: "removed",
      reason: "removed",
    });
  }

  return {
    before,
    after: current,
    seed,
    budget,
    roomCount,
    attempts,
    removedKeys,
  };
}

export function getTempleModifierTargets(roomId: TempleRoomId): TempleRoomId[] {
  return isTempleModifierSourceId(roomId) ? TEMPLE_MODIFIER_TARGETS[roomId] : [];
}

export function calculateDiminishingMultiplier(index: number) {
  if (index <= 3) return 1;
  return Math.round((0.9 ** (index - 3)) * 1000) / 1000;
}

export function calculateTempleEffectSummary(layout: TempleLayoutState): TempleEffectSummary {
  const summary: TempleEffectSummary = {
    monsterEffects: [],
    itemEffects: [],
    chestEffects: [],
    specialBonuses: [],
    modifierSources: [],
    spymasterModifier: 0,
    golemWorksModifier: 0,
    thaumaturgeModifier: 0,
  };

  const cells = layout.cells.filter((cell) => isContributingTempleCell(cell));
  for (const cell of cells) {
    const value = getTempleModifierValue(cell.roomId, cell.tier);
    if (!value || !isTempleModifierSourceId(cell.roomId)) continue;
    const targets = TEMPLE_MODIFIER_TARGETS[cell.roomId];
    if (cell.roomId === "spymasters_study") summary.spymasterModifier += value;
    if (cell.roomId === "workshop") summary.golemWorksModifier += value;
    if (cell.roomId === "thaumaturges_laboratory") summary.thaumaturgeModifier += value;
    summary.modifierSources.push({
      roomId: cell.roomId,
      roomName: TEMPLE_ROOMS[cell.roomId].name,
      tier: cell.tier,
      value,
      targets,
      affectsLabel: targets.map((roomId) => TEMPLE_ROOMS[roomId].name).join(", "),
    });
  }

  const numericEffects = new Map<string, {
    name: string;
    category: TempleEffectCategory;
    sources: Array<Omit<TempleEffectSource, "modifiedContribution" | "multiplier">>;
  }>();
  const specialEffects = new Map<string, TempleSpecialBonus>();

  for (const cell of cells) {
    const room = TEMPLE_ROOMS[cell.roomId];
    const effects = room.tierEffects[cell.tier] ?? [];
    for (const effect of effects) {
      if (isTempleModifierEffect(effect) || isTemplePowerEffect(effect)) continue;
      if (isSpecialTempleEffect(effect)) {
        const current = specialEffects.get(effect) ?? { bonus: effect, count: 0, rooms: [] };
        current.count += 1;
        current.rooms.push({ roomName: room.name, tier: cell.tier });
        specialEffects.set(effect, current);
        continue;
      }

      const baseContribution = parseTemplePercent(effect);
      if (!baseContribution) continue;
      const key = normalizeTempleEffectKey(effect);
      const current = numericEffects.get(key) ?? {
        name: effect,
        category: categorizeTempleEffect(effect),
        sources: [],
      };
      current.sources.push({
        roomId: cell.roomId,
        roomName: room.name,
        tier: cell.tier,
        effect,
        baseContribution,
        count: 1,
      });
      numericEffects.set(key, current);
    }
  }

  for (const effect of numericEffects.values()) {
    const sortedSources = [...effect.sources].sort((a, b) => b.tier - a.tier);
    const totalCopies = sortedSources.reduce((total, source) => total + source.count, 0);
    const hasDiminishingReturns = totalCopies >= 4
      && !sortedSources.every((source) => isTempleModifierSourceId(source.roomId));
    let effectIndex = 1;
    let baseValue = 0;
    let finalValue = 0;
    const sources: TempleEffectSource[] = [];

    for (const source of sortedSources) {
      const modifier = getModifierPercentForRoom(summary, source.roomId);
      for (let copy = 0; copy < source.count; copy += 1) {
        const multiplier = hasDiminishingReturns ? calculateDiminishingMultiplier(effectIndex) : 1;
        const modifiedContribution = Math.floor(source.baseContribution * (1 + modifier / 100) * multiplier);
        baseValue += source.baseContribution;
        finalValue += modifiedContribution;
        sources.push({
          ...source,
          modifiedContribution,
          multiplier,
          count: 1,
        });
        effectIndex += 1;
      }
    }

    const entry: TempleEffectEntry = {
      name: effect.name,
      category: effect.category,
      baseValue,
      finalValue: Math.round(finalValue * 1000) / 1000,
      unit: "%",
      hasDiminishingReturns,
      sources,
    };

    switch (entry.category) {
      case "monster":
        summary.monsterEffects.push(entry);
        break;
      case "item":
        summary.itemEffects.push(entry);
        break;
      case "chest":
        summary.chestEffects.push(entry);
        break;
      case "special":
        break;
    }
  }

  summary.specialBonuses = Array.from(specialEffects.values());
  return summary;
}

export function describeUpgradeRule(rule: TempleUpgradeRule) {
  if (rule.type === "manual") return rule.description;
  const names = rule.rooms.map((roomId) => TEMPLE_ROOMS[roomId].name).join(", ");
  const prefix = rule.requireAll ? "Needs all adjacent" : `Needs ${rule.count ?? 1}+ adjacent`;
  const tierText = rule.minTier ? ` at Tier ${rule.minTier}+` : "";
  return `${prefix}: ${names}${tierText}`;
}

function isContributingTempleCell(cell: TempleCell) {
  return cell.reachable && cell.roomId !== "empty" && cell.roomId !== "path";
}

function getTempleModifierValue(roomId: TempleRoomId, tier: TempleTier) {
  const effects = TEMPLE_ROOMS[roomId].tierEffects[tier] ?? [];
  const effect = effects.find(isTempleModifierEffect);
  return effect ? parseTemplePercent(effect) : 0;
}

function getModifierPercentForRoom(summary: TempleEffectSummary, roomId: TempleRoomId) {
  let value = 0;
  if (TEMPLE_MODIFIER_TARGETS.spymasters_study.includes(roomId)) value += summary.spymasterModifier;
  if (TEMPLE_MODIFIER_TARGETS.workshop.includes(roomId)) value += summary.golemWorksModifier;
  if (TEMPLE_MODIFIER_TARGETS.thaumaturges_laboratory.includes(roomId)) value += summary.thaumaturgeModifier;
  return value;
}

function isTempleModifierSourceId(roomId: TempleRoomId): roomId is TempleModifierSourceId {
  return roomId === "spymasters_study" || roomId === "workshop" || roomId === "thaumaturges_laboratory";
}

function isTempleModifierEffect(effect: string) {
  const normalized = effect.toLowerCase();
  return normalized.includes("increased effect of");
}

function isTemplePowerEffect(effect: string) {
  return effect.includes("Powers rooms");
}

function isSpecialTempleEffect(effect: string) {
  return effect.includes("Adds")
    || effect.includes("Vaal")
    || effect.includes("Orb")
    || effect.includes("Limb")
    || effect.includes("Crystallised")
    || effect.includes("Destabiliser")
    || effect.includes("Contains Unique Item");
}

function parseTemplePercent(effect: string) {
  const match = effect.match(/([\d.]+)%/);
  return match ? Number.parseFloat(match[1]) : 0;
}

function normalizeTempleEffectKey(effect: string) {
  return effect.replace(/[\d.]+%/, "X%");
}

function categorizeTempleEffect(effect: string): TempleEffectCategory {
  if (effect.includes("Chest")) return "chest";
  if (effect.includes("Item Rarity") || effect.includes("Rarity of Items") || effect.includes("Gold")) return "item";
  if (effect.includes("Monster") || effect.includes("Rare") || effect.includes("Magic") || effect.includes("Unique")) return "monster";
  return "special";
}

function ruleSatisfied(layout: TempleLayoutState, cell: TempleCell, rule: TempleUpgradeRule | undefined) {
  if (!rule || rule.type === "manual") return false;
  const neighbors = templeNeighbors(layout, cell.x, cell.y).filter((neighbor) =>
    rule.rooms.includes(neighbor.roomId) && (!rule.minTier || neighbor.tier >= rule.minTier),
  );
  if (rule.requireAll) {
    return rule.rooms.every((roomId) => neighbors.some((neighbor) => neighbor.roomId === roomId));
  }
  return neighbors.length >= (rule.count ?? 1);
}

function resolveTempleTier(layout: TempleLayoutState, cell: TempleCell): TempleTier {
  if (cell.roomId === "empty") return 0;
  if (cell.manualTier !== null) return cell.manualTier;
  if (cell.roomId === "path") return 1;

  const neighbors = templeNeighbors(layout, cell.x, cell.y);
  const neighborIds = neighbors.map((neighbor) => neighbor.roomId);
  const garrisonFamilyCount = neighbors.filter((neighbor) => isGarrisonFamilyRoom(neighbor.roomId)).length;

  switch (cell.roomId) {
    case "guardhouse": {
      const hasCommander = neighborIds.includes("commanders_chamber");
      const hasArmoury = neighborIds.includes("armoury");
      return hasCommander && hasArmoury ? 3 : hasCommander || hasArmoury ? 2 : 1;
    }
    case "commanders_chamber":
      return garrisonFamilyCount >= 3 ? 3 : garrisonFamilyCount >= 2 ? 2 : 1;
    case "bronzeworks":
      return applyGeneratorTierBonus(neighborIds.includes("workshop") ? 2 : 1, cell);
    case "transcendent_barrack":
      return applyGeneratorTierBonus(neighborIds.includes("synthflesh_lab") ? 2 : 1, cell);
    case "legion_barrack": {
      const hasArmoury = neighborIds.includes("armoury");
      const hasSpymaster = neighborIds.includes("spymasters_study");
      return hasArmoury && hasSpymaster ? 3 : hasArmoury || hasSpymaster ? 2 : 1;
    }
    case "surgeons_ward": {
      const synthNeighbors = neighbors.filter((neighbor) => neighbor.roomId === "synthflesh_lab");
      if (synthNeighbors.length >= 2 || synthNeighbors.some((neighbor) => neighbor.tier >= 3)) return 3;
      return synthNeighbors.length >= 1 ? 2 : 1;
    }
    case "synthflesh_lab":
      return applyGeneratorTierBonus(neighborIds.includes("surgeons_ward") ? 2 : 1, cell);
    case "workshop":
      return applyGeneratorTierBonus(1, cell, 2);
    case "thaumaturges_laboratory": {
      const sacrificeCount = neighborIds.filter((id) => id === "altar_of_sacrifice").length;
      return sacrificeCount >= 2 ? 3 : sacrificeCount >= 1 ? 2 : 1;
    }
    default: {
      const definition = TEMPLE_ROOMS[cell.roomId];
      let tier: TempleTier = 1;
      if (ruleSatisfied(layout, cell, definition.upgrades[2])) tier = 2;
      if (ruleSatisfied(layout, cell, definition.upgrades[3])) tier = 3;
      return tier;
    }
  }
}

function isTempleRoomId(value: unknown): value is TempleRoomId {
  return typeof value === "string" && value in TEMPLE_ROOMS;
}

function normalizeTier(value: unknown, roomId: TempleRoomId): TempleTier {
  if (roomId === "empty") return 0;
  if (value === 1 || value === 2 || value === 3) return value;
  return 1;
}

function canToggleTempleLock(cell: TempleCell) {
  return !(cell.x === 4 && cell.y === 8)
    && cell.roomId !== "empty"
    && cell.roomId !== "path"
    && cell.roomId !== "sacrifice_room"
    && cell.roomId !== "atziri_chamber";
}

function countDestabilizationRooms(layout: TempleLayoutState) {
  return layout.cells.filter((cell) =>
    cell.roomId !== "empty"
    && cell.roomId !== "path"
    && cell.roomId !== "architect"
    && cell.roomId !== "atziri_chamber"
    && cell.roomId !== "sacrifice_room",
  ).length;
}

function isDestabilizationTargetCandidate(cell: TempleCell) {
  return cell.reachable
    && cell.roomId !== "empty"
    && cell.roomId !== "path"
    && cell.roomId !== "architect"
    && cell.roomId !== "atziri_chamber"
    && cell.roomId !== "sacrifice_room";
}

function removalPreservesTempleConnectivity(layout: TempleLayoutState, cell: TempleCell) {
  const reachableKeysBefore = new Set(
    layout.cells
      .filter((entry) => entry.reachable && entry.roomId !== "empty" && entry.roomId !== "architect")
      .map((entry) => templeCellKey(entry.x, entry.y)),
  );
  const nextCells = layout.cells.map((entry) =>
    entry.x === cell.x && entry.y === cell.y
      ? { ...entry, roomId: "empty" as TempleRoomId, tier: 0 as TempleTier, manualTier: null, locked: false }
      : entry,
  );
  const nextLayout = calculateTempleReachability({ ...layout, cells: nextCells });
  return !nextLayout.cells.some((entry) =>
    !(entry.x === cell.x && entry.y === cell.y)
    && reachableKeysBefore.has(templeCellKey(entry.x, entry.y))
    && !entry.reachable,
  );
}

function removeTempleCellForDestabilization(layout: TempleLayoutState, cell: TempleCell) {
  return recalculateTempleLayout({
    ...layout,
    cells: layout.cells.map((entry) =>
      entry.x === cell.x && entry.y === cell.y
        ? {
            ...entry,
            roomId: "empty" as TempleRoomId,
            tier: 0 as TempleTier,
            manualTier: null,
            reachable: false,
            inGeneratorRange: false,
            generatorPower: 0,
            hasMedallion: false,
            locked: false,
          }
        : entry,
    ),
    selectedCellKey: layout.selectedCellKey === templeCellKey(cell.x, cell.y) ? null : layout.selectedCellKey,
    updatedAt: Date.now(),
  });
}

function cloneTempleLayout(layout: TempleLayoutState): TempleLayoutState {
  return {
    ...layout,
    cells: layout.cells.map((cell) => ({ ...cell })),
    atziriEndpoint: { ...layout.atziriEndpoint },
  };
}

function normalizeDestabilizationSeed(seed: number | string | undefined) {
  if (seed !== undefined && seed !== "") return String(seed);
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

function seededRandom(seed: string) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function validateTempleClear(layout: TempleLayoutState, cell: TempleCell): TemplePlacementResult {
  if (cell.roomId === "empty") return { valid: true, reason: null };
  if (cell.locked) return { valid: false, reason: "This temple endpoint is locked." };

  const reachableKeysBefore = new Set(
    layout.cells
      .filter((entry) => entry.reachable && entry.roomId !== "empty" && entry.roomId !== "architect")
      .map((entry) => templeCellKey(entry.x, entry.y)),
  );
  const nextCells = layout.cells.map((entry) =>
    entry.x === cell.x && entry.y === cell.y
      ? { ...entry, roomId: "empty" as TempleRoomId, tier: 0 as TempleTier, manualTier: null }
      : entry,
  );
  const nextLayout = calculateTempleReachability({ ...layout, cells: nextCells });
  const disconnected = nextLayout.cells.some((entry) =>
    !(entry.x === cell.x && entry.y === cell.y)
    && reachableKeysBefore.has(templeCellKey(entry.x, entry.y))
    && !entry.reachable,
  );

  if (disconnected) {
    return { valid: false, reason: "Clearing this tile would disconnect reachable rooms." };
  }

  return { valid: true, reason: null };
}

function repairLockedTempleEndpoints(layout: TempleLayoutState): TempleLayoutState {
  return {
    ...layout,
    atziriEndpoint: createTempleAtziriEndpoint(layout.atziriEndpoint?.reachable ?? false),
    cells: layout.cells.map((cell) => {
      if (cell.x === 4 && cell.y === 8) {
        return { ...cell, roomId: "path", tier: 1, manualTier: null, locked: true };
      }
      if (cell.x === 4 && cell.y === 0) {
        const isLegacyArchitectEndpoint = cell.roomId === "architect" && cell.locked;
        return {
          ...cell,
          roomId: isLegacyArchitectEndpoint ? "empty" : cell.roomId,
          tier: isLegacyArchitectEndpoint ? 0 : cell.tier,
          manualTier: isLegacyArchitectEndpoint ? null : cell.manualTier,
          locked: false,
        };
      }
      return { ...cell, locked: canToggleTempleLock(cell) ? cell.locked : false };
    }),
  };
}

function createTempleAtziriEndpoint(reachable: boolean): TempleEndpoint {
  return {
    id: "atziri",
    x: 4,
    y: -1,
    roomId: "atziri_chamber",
    tier: 1,
    reachable,
    locked: true,
  };
}

function templePlacementNeighbors(layout: TempleLayoutState, x: number, y: number) {
  const neighbors: Array<TempleCell | TempleEndpoint> = [...templeNeighbors(layout, x, y)];
  if (x === 4 && y === 0) neighbors.push(layout.atziriEndpoint);
  return neighbors;
}

function validateTempleChainRestrictions(
  layout: TempleLayoutState,
  target: TempleCell,
  roomId: TempleRoomId,
): TemplePlacementResult {
  const neighbors = templeNeighbors(layout, target.x, target.y);
  const neighborIds = neighbors.map((neighbor) => neighbor.roomId);

  if (roomId === "guardhouse") {
    const hasStableNeighbor = neighborIds.some((id) =>
      id === "path" || id === "commanders_chamber" || id === "armoury" || id === "spymasters_study",
    );
    if (!hasStableNeighbor) {
      const synthNeighbor = neighbors.find((neighbor) => neighbor.roomId === "synthflesh_lab");
      if (synthNeighbor && adjacentRoomCount(layout, synthNeighbor, ["guardhouse", "transcendent_barrack"], target) >= 1) {
        return {
          valid: false,
          reason: "Cannot chain: Synthflesh Lab already has a Garrison adjacent.",
        };
      }
    }
  }

  if (roomId === "synthflesh_lab") {
    const hasStableNeighbor = neighborIds.some((id) => id === "path" || id === "surgeons_ward");
    const garrisonNeighbor = neighbors.find((neighbor) =>
      neighbor.roomId === "guardhouse" || neighbor.roomId === "transcendent_barrack",
    );
    if (garrisonNeighbor && !hasStableNeighbor) {
      if (adjacentRoomCount(layout, garrisonNeighbor, ["synthflesh_lab"], target) >= 1) {
        return {
          valid: false,
          reason: "Cannot chain: Garrison already has a Synthflesh Lab adjacent.",
        };
      }
      if (hasLinearReachableChain(layout, garrisonNeighbor, "commanders_chamber", target)) {
        return {
          valid: false,
          reason: "Cannot place: Synthflesh Lab would be in a linear chain with Commander through a Garrison.",
        };
      }
    }
  }

  if (roomId === "spymasters_study") {
    const hasStableNeighbor = neighborIds.some((id) => id === "path" || id === "guardhouse");
    const legionNeighbor = neighbors.find((neighbor) => neighbor.roomId === "legion_barrack");
    if (legionNeighbor && !hasStableNeighbor && adjacentRoomCount(layout, legionNeighbor, ["spymasters_study"], target) >= 1) {
      return {
        valid: false,
        reason: "Cannot chain: Legion Barrack already has a Spymaster adjacent.",
      };
    }
    const garrisonNeighbor = neighbors.find((neighbor) =>
      neighbor.roomId === "guardhouse" || neighbor.roomId === "legion_barrack",
    );
    if (garrisonNeighbor && hasLinearReachableChain(layout, garrisonNeighbor, "commanders_chamber", target)) {
      return {
        valid: false,
        reason: "Cannot place: Spymaster would be in a linear chain with Commander through a Garrison.",
      };
    }
  }

  return { valid: true, reason: null };
}

function adjacentRoomCount(
  layout: TempleLayoutState,
  cell: TempleCell,
  roomIds: TempleRoomId[],
  ignoredCell: TempleCell,
) {
  return templeNeighbors(layout, cell.x, cell.y).filter((neighbor) =>
    !(neighbor.x === ignoredCell.x && neighbor.y === ignoredCell.y)
    && roomIds.includes(neighbor.roomId),
  ).length;
}

function hasLinearReachableChain(
  layout: TempleLayoutState,
  start: TempleCell,
  targetRoomId: TempleRoomId,
  blockedCell: TempleCell,
) {
  const stack = [{ cell: start, hasGarrison: false, previousKey: templeCellKey(blockedCell.x, blockedCell.y) }];
  const seen = new Set<string>();
  const blockedKey = templeCellKey(blockedCell.x, blockedCell.y);

  while (stack.length) {
    const current = stack.pop()!;
    const key = templeCellKey(current.cell.x, current.cell.y);
    if (key === blockedKey || seen.has(key) || current.cell.roomId === "empty" || !current.cell.reachable) continue;
    seen.add(key);

    const hasGarrison = current.hasGarrison || isGarrisonFamilyRoom(current.cell.roomId);
    if (current.cell.roomId === targetRoomId) return hasGarrison;

    const nextNeighbors = templeNeighbors(layout, current.cell.x, current.cell.y).filter((neighbor) => {
      const nextKey = templeCellKey(neighbor.x, neighbor.y);
      return nextKey !== blockedKey
        && nextKey !== current.previousKey
        && !seen.has(nextKey)
        && neighbor.roomId !== "empty"
        && neighbor.reachable;
    });

    if (nextNeighbors.length >= 2) continue;
    for (const neighbor of nextNeighbors) {
      stack.push({ cell: neighbor, hasGarrison, previousKey: key });
    }
  }

  return false;
}

function isGarrisonFamilyRoom(roomId: TempleRoomId) {
  return roomId === "guardhouse" || roomId === "transcendent_barrack" || roomId === "legion_barrack";
}

function templePowerStopsAt(roomId: TempleRoomId) {
  return roomId === "workshop"
    || roomId === "bronzeworks"
    || roomId === "synthflesh_lab"
    || roomId === "transcendent_barrack";
}

function applyGeneratorTierBonus(baseTier: TempleTier, cell: TempleCell, maxBonus = 1): TempleTier {
  if (baseTier === 0 || !cell.inGeneratorRange) return baseTier;
  return Math.min(3, baseTier + Math.min(maxBonus, cell.generatorPower || 1)) as TempleTier;
}
