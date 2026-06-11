export type AtlasCompactSeverity = "none" | "info" | "warning" | "danger" | "critical";

export type AtlasCompactArea = {
  name: string;
  area_level: number | null;
  area_type: string;
  entered_at_epoch_ms: number;
  waystone_mod_count: number | null;
  waystone_quantity: number | null;
  waystone_rarity: number | null;
  waystone_pack_size: number | null;
  waystone_hazard_count: number | null;
};

export type AtlasCompactRun = {
  confidence: string;
  waystone: {
    explicit_mods?: string[];
    profile_hazards?: {
      severity: "info" | "warning" | "danger" | "build_breaking";
      reason: string;
      modifier: string;
    }[];
    profile_hazard_summary?: {
      info: number;
      warning: number;
      danger: number;
      build_breaking: number;
    };
  } | null;
  ocr_evidence?: {
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
  } | null;
};

export type AtlasCompactIndicator = {
  label: string;
  value: string;
  tone: "neutral" | "reward" | "monster" | "danger";
};

export type AtlasCompactLineState = {
  text: string;
  indicators: AtlasCompactIndicator[];
  riskReason: string;
  riskDetail: string;
  severity: AtlasCompactSeverity;
  shouldPulse: boolean;
};

export function atlasCompactLineState(
  area: AtlasCompactArea,
  run: AtlasCompactRun | null | undefined,
  runtimeLabel: string,
): AtlasCompactLineState {
  const armedText = armedWaystoneText(area, runtimeLabel);
  if (armedText) {
    const severity = severityFromWaystone(run);
    return {
      text: armedText,
      indicators: armedWaystoneIndicators(area, run),
      riskReason: riskReasonFromWaystone(run),
      riskDetail: riskDetailFromWaystone(run),
      severity,
      shouldPulse: shouldPulse(severity),
    };
  }

  const ocrText = ocrEvidenceText(run?.ocr_evidence, runtimeLabel);
  if (ocrText) {
    const severity = severityFromOcr(run?.ocr_evidence);
    return {
      text: ocrText,
      indicators: ocrIndicators(run?.ocr_evidence),
      riskReason: riskReasonFromOcr(run?.ocr_evidence),
      riskDetail: riskDetailFromOcr(run?.ocr_evidence),
      severity,
      shouldPulse: shouldPulse(severity),
    };
  }

  return {
    text: `Press Tab to read map mods | ${runtimeLabel}`,
    indicators: [],
    riskReason: "",
    riskDetail: "",
    severity: "none",
    shouldPulse: false,
  };
}

function shouldPulse(severity: AtlasCompactSeverity): boolean {
  return severity === "warning" || severity === "danger" || severity === "critical";
}

function armedWaystoneText(area: AtlasCompactArea, runtimeLabel: string): string {
  const parts: string[] = [];
  if (area.waystone_mod_count) parts.push(`${area.waystone_mod_count} mods`);
  if (area.waystone_quantity != null) parts.push(`Q:${area.waystone_quantity}%`);
  if (area.waystone_hazard_count && area.waystone_hazard_count > 0) {
    parts.push(`Risk:${area.waystone_hazard_count}`);
  }
  return parts.length ? `${parts.join(" | ")} | ${runtimeLabel}` : "";
}

function armedWaystoneIndicators(
  area: AtlasCompactArea,
  run: AtlasCompactRun | null | undefined,
): AtlasCompactIndicator[] {
  const indicators: AtlasCompactIndicator[] = [];
  if (area.waystone_rarity != null) {
    indicators.push({ label: "R", value: `${area.waystone_rarity}%`, tone: "reward" });
  }
  if (area.waystone_pack_size != null) {
    indicators.push({ label: "Pack", value: `${area.waystone_pack_size}%`, tone: "reward" });
  }
  const waystoneLines = [
    ...(run?.waystone?.explicit_mods ?? []),
    ...(run?.waystone?.profile_hazards?.map((hazard) => hazard.modifier) ?? []),
  ];
  const rare = rareMonsterIndicator(waystoneLines);
  if (rare) {
    indicators.push({ label: "Rare", value: rare, tone: "monster" });
  }
  const experience = experienceIndicator(waystoneLines);
  if (experience) {
    indicators.push({ label: "Exp", value: experience, tone: "reward" });
  }
  return indicators;
}

function ocrEvidenceText(
  evidence: AtlasCompactRun["ocr_evidence"],
  runtimeLabel: string,
): string {
  if (!evidence || evidence.state !== "confirmed") {
    return "";
  }

  const summary = evidence.summary;
  const modifierCount = summary?.modifier_count || evidence.normalized_mods.length;
  if (!modifierCount) {
    return "";
  }

  const parts = [`OCR ${modifierCount} mods`];
  if (summary?.content_flags.length) {
    parts.push(summary.content_flags.slice(0, 2).join(", "));
  }
  parts.push(runtimeLabel);
  return parts.join(" | ");
}

function ocrIndicators(evidence: AtlasCompactRun["ocr_evidence"]): AtlasCompactIndicator[] {
  const summary = evidence?.summary;
  if (!summary) return [];

  const indicators: AtlasCompactIndicator[] = [];
  const rarity = firstPercentValue(summary.reward_lines, /rarity/i);
  const pack = firstPercentValue(summary.reward_lines, /pack size/i);
  const rare = rareMonsterIndicator([
    ...summary.reward_lines,
    ...summary.monster_danger_lines,
    ...evidence.normalized_mods,
  ]);
  const experience = experienceIndicator([
    ...summary.reward_lines,
    ...evidence.normalized_mods,
  ]);

  if (rarity) indicators.push({ label: "R", value: rarity, tone: "reward" });
  if (pack) indicators.push({ label: "Pack", value: pack, tone: "reward" });
  if (rare) indicators.push({ label: "Rare", value: rare, tone: "monster" });
  if (experience) indicators.push({ label: "Exp", value: experience, tone: "reward" });
  return indicators;
}

function firstPercentValue(lines: string[], matcher: RegExp): string {
  const line = lines.find((candidate) => matcher.test(candidate));
  const match = line?.match(/(\d+(?:\.\d+)?)%/);
  return match ? `${match[1]}%` : "";
}

function rareMonsterIndicator(lines: string[]): string {
  const line = lines.find((candidate) => /rare monster/i.test(candidate));
  if (!line) return "";
  const match = line.match(/(\d+(?:\.\d+)?)%/);
  if (match) return `${match[1]}%`;
  if (/additional|more|increased|modifier/i.test(line)) return "+";
  return "seen";
}

function experienceIndicator(lines: string[]): string {
  const line = lines.find((candidate) => /experience/i.test(candidate));
  if (!line) return "";
  const match = line.match(/(\d+(?:\.\d+)?)%/);
  return match ? `${match[1]}%` : "";
}

function severityFromWaystone(run: AtlasCompactRun | null | undefined): AtlasCompactSeverity {
  const summary = run?.waystone?.profile_hazard_summary;
  if (!summary) return "none";
  if (summary.build_breaking > 0) return "critical";
  if (summary.danger > 0) return "danger";
  if (summary.warning > 0) return "warning";
  if (summary.info > 0) return "info";
  return "none";
}

function riskReasonFromWaystone(run: AtlasCompactRun | null | undefined): string {
  const hazards = run?.waystone?.profile_hazards ?? [];
  const hazard = firstHazardBySeverity(hazards, "build_breaking")
    ?? firstHazardBySeverity(hazards, "danger")
    ?? firstHazardBySeverity(hazards, "warning");
  if (hazard?.reason) return compactRiskReason(hazard.reason);

  const summary = run?.waystone?.profile_hazard_summary;
  if (!summary) return "";
  if (summary.build_breaking > 0) return "Build-breaking";
  if (summary.danger > 0) return "Danger";
  if (summary.warning > 0) return "Warning";
  return "";
}

function riskDetailFromWaystone(run: AtlasCompactRun | null | undefined): string {
  const hazards = run?.waystone?.profile_hazards ?? [];
  const hazard = firstHazardBySeverity(hazards, "build_breaking")
    ?? firstHazardBySeverity(hazards, "danger")
    ?? firstHazardBySeverity(hazards, "warning");
  return hazard ? `${hazard.reason} (${hazard.modifier})` : "";
}

function firstHazardBySeverity(
  hazards: NonNullable<AtlasCompactRun["waystone"]>["profile_hazards"],
  severity: "info" | "warning" | "danger" | "build_breaking",
) {
  return hazards?.find((hazard) => hazard.severity === severity);
}

function severityFromOcr(evidence: AtlasCompactRun["ocr_evidence"]): AtlasCompactSeverity {
  const summary = evidence?.summary;
  if (!summary) return "none";
  if (summary.player_danger_lines.length > 0) return "danger";
  if (summary.monster_danger_lines.length > 0) return "warning";
  if (summary.reward_lines.length > 0 || summary.content_flags.length > 0) return "info";
  return "none";
}

function riskReasonFromOcr(evidence: AtlasCompactRun["ocr_evidence"]): string {
  const summary = evidence?.summary;
  if (!summary) return "";
  const line = summary.player_danger_lines[0] ?? summary.monster_danger_lines[0] ?? "";
  if (!line) return "";
  return compactRiskReason(line);
}

function riskDetailFromOcr(evidence: AtlasCompactRun["ocr_evidence"]): string {
  const summary = evidence?.summary;
  return summary?.player_danger_lines[0] ?? summary?.monster_danger_lines[0] ?? "";
}

function compactRiskReason(reason: string): string {
  const clean = reason.replace(/\s+/g, " ").trim();
  if (clean.length <= 58) return clean;
  return `${clean.slice(0, 55).trim()}...`;
}
