export const ATLAS_RUN_HISTORY_STORAGE_KEY = "reliquary.atlas.runHistory.v1";
export const ATLAS_RUN_HISTORY_LIMIT = 50;

export type MapRunConfidence = "armed" | "area_only" | "stale" | "unknown" | "ocr_partial" | "ocr_confirmed";

export type AtlasHistoryArea = {
  name: string;
  area_level: number | null;
  area_type: string;
  entered_at_epoch_ms: number;
  boss: string | null;
  waystone_mod_count?: number | null;
  waystone_quantity?: number | null;
  waystone_rarity?: number | null;
  waystone_pack_size?: number | null;
  waystone_hazard_count?: number | null;
};

export type AtlasHistoryHazardSummary = {
  info: number;
  warning: number;
  danger: number;
  build_breaking: number;
};

export type AtlasHistoryWaystone = {
  name: string;
  base_type: string | null;
  tier: number | null;
  item_level: number | null;
  explicit_mods: string[];
  quantity: number | null;
  rarity: number | null;
  pack_size: number | null;
  hazard_count: number;
  profile_hazard_summary: AtlasHistoryHazardSummary;
};

export type AtlasHistoryOcrEvidence = {
  state: string;
  normalized_mods: string[];
  raw_lines: string[];
  summary: {
    modifier_count: number;
    reward_lines: string[];
    player_danger_lines: string[];
    monster_danger_lines: string[];
    content_flags: string[];
  } | null;
  confidence_score: number | null;
  reason: string | null;
  captured_at_epoch_ms: number;
};

export type AtlasHistoryRunContext = {
  area: AtlasHistoryArea;
  waystone: AtlasHistoryWaystone | null;
  confidence: MapRunConfidence;
  ocr_evidence?: AtlasHistoryOcrEvidence | null;
  started_at_epoch_ms: number;
};

export type AtlasRunRecord = {
  id: string;
  area: AtlasHistoryArea;
  waystone: AtlasHistoryWaystone | null;
  confidence: MapRunConfidence;
  ocr_evidence: AtlasHistoryOcrEvidence | null;
  started_at_epoch_ms: number;
  completed_at_epoch_ms: number | null;
  elapsed_ms: number;
  deaths: number;
};

type AtlasRunStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function atlasRunId(run: Pick<AtlasHistoryRunContext, "started_at_epoch_ms" | "area">): string {
  return `${run.started_at_epoch_ms}:${run.area.name}:${run.area.area_level ?? "?"}`;
}

export function normalizeMapRunConfidence(value: unknown): MapRunConfidence {
  if (
    value === "armed" ||
    value === "area_only" ||
    value === "stale" ||
    value === "unknown" ||
    value === "ocr_partial" ||
    value === "ocr_confirmed"
  ) {
    return value;
  }
  return "area_only";
}

export function normalizeOcrEvidence(value: unknown): AtlasHistoryOcrEvidence | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<AtlasHistoryOcrEvidence>;
  const state = source.state;
  const isValidState = state === "none" || state === "pending" || state === "partial" || state === "confirmed" || state === "locked";
  const summary = source.summary && typeof source.summary === "object" ? source.summary : null;
  return {
    state: isValidState ? state : "none",
    normalized_mods: Array.isArray(source.normalized_mods) ? source.normalized_mods.map(String) : [],
    raw_lines: Array.isArray(source.raw_lines) ? source.raw_lines.map(String) : [],
    summary: summary ? {
      modifier_count: typeof summary.modifier_count === "number" ? summary.modifier_count : 0,
      reward_lines: Array.isArray(summary.reward_lines) ? summary.reward_lines.map(String) : [],
      player_danger_lines: Array.isArray(summary.player_danger_lines) ? summary.player_danger_lines.map(String) : [],
      monster_danger_lines: Array.isArray(summary.monster_danger_lines) ? summary.monster_danger_lines.map(String) : [],
      content_flags: Array.isArray(summary.content_flags) ? summary.content_flags.map(String) : [],
    } : null,
    confidence_score: typeof source.confidence_score === "number" ? source.confidence_score : null,
    reason: typeof source.reason === "string" ? source.reason : null,
    captured_at_epoch_ms: typeof source.captured_at_epoch_ms === "number" ? source.captured_at_epoch_ms : 0,
  };
}

export function normalizeAtlasRunRecord(value: unknown): AtlasRunRecord | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<AtlasRunRecord>;
  const area = normalizeArea(source.area);
  if (!area) return null;
  const started = typeof source.started_at_epoch_ms === "number" ? source.started_at_epoch_ms : area.entered_at_epoch_ms;
  return {
    id: typeof source.id === "string" ? source.id : atlasRunId({ area, started_at_epoch_ms: started }),
    area,
    waystone: normalizeWaystone(source.waystone),
    confidence: normalizeMapRunConfidence(source.confidence),
    ocr_evidence: normalizeOcrEvidence(source.ocr_evidence),
    started_at_epoch_ms: started,
    completed_at_epoch_ms: typeof source.completed_at_epoch_ms === "number" ? source.completed_at_epoch_ms : null,
    elapsed_ms: typeof source.elapsed_ms === "number" ? Math.max(0, source.elapsed_ms) : 0,
    deaths: typeof source.deaths === "number" ? Math.max(0, source.deaths) : 0,
  };
}

export function loadAtlasRunHistory(storage: AtlasRunStorage): AtlasRunRecord[] {
  try {
    const raw = storage.getItem(ATLAS_RUN_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data)
      ? data.map(normalizeAtlasRunRecord).filter((run): run is AtlasRunRecord => Boolean(run)).slice(0, ATLAS_RUN_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function saveAtlasRunHistory(storage: AtlasRunStorage, history: AtlasRunRecord[]): void {
  storage.setItem(ATLAS_RUN_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, ATLAS_RUN_HISTORY_LIMIT)));
}

export function clearAtlasRunHistory(storage: AtlasRunStorage): AtlasRunRecord[] {
  storage.removeItem(ATLAS_RUN_HISTORY_STORAGE_KEY);
  return [];
}

export function upsertAtlasRun(history: AtlasRunRecord[], run: AtlasHistoryRunContext): AtlasRunRecord[] {
  const id = atlasRunId(run);
  const existing = history.findIndex((record) => record.id === id);
  const previous = existing >= 0 ? history[existing] : null;
  const next: AtlasRunRecord = {
    id,
    area: run.area,
    waystone: run.waystone,
    confidence: run.confidence,
    ocr_evidence: run.ocr_evidence ?? null,
    started_at_epoch_ms: run.started_at_epoch_ms,
    completed_at_epoch_ms: previous?.completed_at_epoch_ms ?? null,
    elapsed_ms: previous?.elapsed_ms ?? 0,
    deaths: previous?.deaths ?? 0,
  };

  const nextHistory = existing >= 0
    ? history.map((record, index) => (index === existing ? next : record))
    : [next, ...history];
  return nextHistory.slice(0, ATLAS_RUN_HISTORY_LIMIT);
}

export function completeAtlasRun(
  history: AtlasRunRecord[],
  run: AtlasHistoryRunContext | null,
  completedAtEpochMs: number,
): AtlasRunRecord[] {
  if (!run) return history;
  const id = atlasRunId(run);
  return history.map((record) => {
    if (record.id !== id || record.completed_at_epoch_ms != null) return record;
    return {
      ...record,
      completed_at_epoch_ms: completedAtEpochMs,
      elapsed_ms: Math.max(0, completedAtEpochMs - run.started_at_epoch_ms),
    };
  });
}

export function incrementAtlasRunDeaths(history: AtlasRunRecord[], run: AtlasHistoryRunContext | null): AtlasRunRecord[] {
  if (!run) return history;
  const id = atlasRunId(run);
  return history.map((record) => (
    record.id === id ? { ...record, deaths: record.deaths + 1 } : record
  ));
}

function normalizeArea(value: unknown): AtlasHistoryArea | null {
  if (!value || typeof value !== "object") return null;
  const area = value as Partial<AtlasHistoryArea>;
  if (typeof area.name !== "string" || !area.name.trim()) return null;
  return {
    name: area.name,
    area_level: typeof area.area_level === "number" ? area.area_level : null,
    area_type: typeof area.area_type === "string" ? area.area_type : "map",
    entered_at_epoch_ms: typeof area.entered_at_epoch_ms === "number" ? area.entered_at_epoch_ms : Date.now(),
    boss: typeof area.boss === "string" ? area.boss : null,
    waystone_mod_count: typeof area.waystone_mod_count === "number" ? area.waystone_mod_count : null,
    waystone_quantity: typeof area.waystone_quantity === "number" ? area.waystone_quantity : null,
    waystone_rarity: typeof area.waystone_rarity === "number" ? area.waystone_rarity : null,
    waystone_pack_size: typeof area.waystone_pack_size === "number" ? area.waystone_pack_size : null,
    waystone_hazard_count: typeof area.waystone_hazard_count === "number" ? area.waystone_hazard_count : null,
  };
}

function normalizeWaystone(value: unknown): AtlasHistoryWaystone | null {
  if (!value || typeof value !== "object") return null;
  const waystone = value as Partial<AtlasHistoryWaystone>;
  if (typeof waystone.name !== "string") return null;
  return {
    name: waystone.name,
    base_type: typeof waystone.base_type === "string" ? waystone.base_type : null,
    tier: typeof waystone.tier === "number" ? waystone.tier : null,
    item_level: typeof waystone.item_level === "number" ? waystone.item_level : null,
    explicit_mods: Array.isArray(waystone.explicit_mods) ? waystone.explicit_mods.map(String) : [],
    quantity: typeof waystone.quantity === "number" ? waystone.quantity : null,
    rarity: typeof waystone.rarity === "number" ? waystone.rarity : null,
    pack_size: typeof waystone.pack_size === "number" ? waystone.pack_size : null,
    hazard_count: typeof waystone.hazard_count === "number" ? Math.max(0, waystone.hazard_count) : 0,
    profile_hazard_summary: normalizeHazardSummary(waystone.profile_hazard_summary),
  };
}

function normalizeHazardSummary(value: unknown): AtlasHistoryHazardSummary {
  if (!value || typeof value !== "object") {
    return { info: 0, warning: 0, danger: 0, build_breaking: 0 };
  }
  const summary = value as Partial<AtlasHistoryHazardSummary>;
  return {
    info: typeof summary.info === "number" ? Math.max(0, summary.info) : 0,
    warning: typeof summary.warning === "number" ? Math.max(0, summary.warning) : 0,
    danger: typeof summary.danger === "number" ? Math.max(0, summary.danger) : 0,
    build_breaking: typeof summary.build_breaking === "number" ? Math.max(0, summary.build_breaking) : 0,
  };
}
