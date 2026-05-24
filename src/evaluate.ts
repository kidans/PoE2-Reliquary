export type PriceProfileId = "quick" | "exact" | "broad" | "base";

export type ScannedItem = {
  name: string;
  rarity: string;
  family: string;
  item_class: string | null;
  base_type: string | null;
  item_level: number | null;
  property_lines: string[];
  explicit_mods: string[];
  sockets: number | null;
  spirit: number | null;
  hazards: string[];
  trade_url: string | null;
  raw_text: string;
};

export type TradeRateLimit = {
  policy: string | null;
  scope: string;
  current_hits: number | null;
  limit: number | null;
  interval_seconds: number | null;
  usage_ratio: number;
  active_timeout_seconds: number | null;
  retry_after_seconds: number | null;
};

export type CurrencyMeta = {
  id: string;
  name: string;
  icon_url: string | null;
};

export type PriceFilter = {
  label: string;
  source: string;
  enabled: boolean;
  value: number | null;
  min: number | null;
  max: number | null;
  tier: string | null;
};

export type ItemSpec = {
  key: string;
  label: string;
  kind: "item_level" | "required_level" | "quality" | "armour" | "evasion" | "energy_shield" | "sockets" | "spirit" | "explicit";
  value: number | null;
  template: string;
  tier_match?: TierMatch | null;
};

export type ActivePriceFilter = {
  kind: ItemSpec["kind"];
  label: string;
  value: number | null;
  template: string;
  min?: number | null;
  max?: number | null;
  tier?: string | null;
  tier_name?: string | null;
  affix?: AffixKind | null;
  source?: string | null;
};

export type FilterClass = "hard" | "score";

export type ClassifiedFilter = ActivePriceFilter & {
  classification: FilterClass;
  reason: string;
};

export type ListingRank = {
  listing: PriceListing;
  score: number;
  maxScore: number;
  penalties: string[];
};

export type AffixKind = "prefix" | "suffix" | "unknown";

export type RollBand = {
  min: number;
  max: number;
};

export type Poe2DbModTier = {
  id: string;
  tier: string;
  name: string;
  source_kind: string;
  required_level: number;
  affix: AffixKind | null;
  text: string;
  template: string;
  roll_bands: RollBand[];
  tags: string[];
};

export type Poe2DbModTierPage = {
  slug: string;
  source_url: string;
  tiers: Poe2DbModTier[];
};

export type Poe2DbDataSnapshot = {
  schema_version: number;
  source: string;
  fetched_at_epoch_ms: number;
  cache_path: string | null;
  families: Array<{
    family: string;
    poe2db_section: string;
    item_classes: string[];
    notes: string;
  }>;
  leagues: unknown[];
  mod_pages: Poe2DbModTierPage[];
  status: {
    state: string;
    message: string;
    fresh: boolean;
    cache_age_seconds: number | null;
    pages_cached: number;
    pages_failed: number;
    failed_pages: string[];
  };
};

export type TierMatch = {
  source: "repoe" | "poe2db" | "envelope";
  page_slug: string;
  tier: string;
  tier_name: string;
  required_level: number | null;
  affix: AffixKind | null;
  source_kind: string;
  min: number | null;
  max: number | null;
  template: string;
  confidence: "validated" | "template";
};

export type PriceListing = {
  price: string;
  amount: number | null;
  currency: string | null;
  currency_icon_url: string | null;
  normalized_price: string | null;
  normalized_amount: number | null;
  normalized_currency: string | null;
  normalized_currency_icon_url: string | null;
  item_level: number | null;
  listed: string;
  source_url: string;
  seller: string | null;
  online: boolean;
  required_level: number | null;
  quality: number | null;
  armour: number | null;
  evasion: number | null;
  energy_shield: number | null;
  explicit_mods: string[];
  preview_name: string | null;
  preview_base_type: string | null;
  preview_rarity: string | null;
  preview_item_class: string | null;
  preview_icon_url: string | null;
  preview_property_lines: string[];
  preview_description: string | null;
  hashes_explicit: string[];
  hashes_implicit: string[];
  hashes_rune: string[];
  hashes_desecrated: string[];
  hashes_enchant: string[];
  hash_count: number;
  mod_tier_infos: (ModTierInfo | null)[];
};

export type ModTierInfo = {
  affix_kind: "prefix" | "suffix";
  tier_number: string;
  tier_code: string;
};

export type PriceCheck = {
  status: string;
  matched: number;
  source_url: string | null;
  selected_currency: string;
  selected_price_option: string;
  rate_source: string | null;
  rate_limit: TradeRateLimit | null;
  currencies: CurrencyMeta[];
  filters: PriceFilter[];
  requested_filters: ActivePriceFilter[];
  applied_filters: ActivePriceFilter[];
  listings: PriceListing[];
  error: string | null;
};

export type ItemProfile = {
  requiredLevel: number | null;
  quality: number | null;
  evasion: number | null;
  energyShield: number | null;
  armour: number | null;
};

type ItemSpecsCache = {
  item: ScannedItem;
  sourceTruth: Poe2DbDataSnapshot | null;
  profileKey: string;
  specs: ItemSpec[];
};

let itemSpecsCache: ItemSpecsCache | null = null;

export const PRICE_PROFILES: Array<{ id: PriceProfileId; label: string; title: string }> = [
  {
    id: "quick",
    label: "Quick Price",
    title: "Uses only high-impact explicit modifiers for a fast price check.",
  },
  {
    id: "exact",
    label: "Exact Match",
    title: "Uses every searchable stat or modifier.",
  },
  {
    id: "broad",
    label: "Broad (-10%)",
    title: "Keeps the same searchable stats but relaxes numeric values by roughly 10%.",
  },
  {
    id: "base",
    label: "Crafting Base",
    title: "Prices the base using item level and base-defining implicits/special mods.",
  },
];

export function priceProfileLabel(profileId: PriceProfileId) {
  return PRICE_PROFILES.find((profile) => profile.id === profileId)?.label ?? profileId;
}

export function itemProfile(item: ScannedItem): ItemProfile {
  return {
    requiredLevel: parseRawNumber(item.raw_text, /(?:^|\n)Requires:.*?\bLevel\s+(\d+)/i),
    quality: parseRawNumber(item.raw_text, /(?:^|\n)Quality:\s*\+?(\d+)%/i),
    evasion: parseRawNumber(item.raw_text, /(?:^|\n)Evasion Rating:\s*(\d+)/i),
    energyShield: parseRawNumber(item.raw_text, /(?:^|\n)Energy Shield:\s*(\d+)/i),
    armour: parseRawNumber(item.raw_text, /(?:^|\n)Armour:\s*(\d+)/i),
  };
}

export function itemSpecs(
  item: ScannedItem,
  profile = itemProfile(item),
  sourceTruth: Poe2DbDataSnapshot | null = null,
): ItemSpec[] {
  const profileKey = [
    profile.requiredLevel,
    profile.quality,
    profile.evasion,
    profile.energyShield,
    profile.armour,
  ].join("|");

  if (
    itemSpecsCache &&
    itemSpecsCache.item === item &&
    itemSpecsCache.sourceTruth === sourceTruth &&
    itemSpecsCache.profileKey === profileKey
  ) {
    return itemSpecsCache.specs;
  }

  const specs: ItemSpec[] = [];
  let specIndex = 0;
  let pendingTier: TierMatch | null = null;

  addNumericSpec(specs, "item_level", "Item Level", item.item_level);
  addNumericSpec(specs, "required_level", "Requires Level", profile.requiredLevel);
  addNumericSpec(specs, "armour", "Armour", profile.armour);
  addNumericSpec(specs, "evasion", "Evasion Rating", profile.evasion);
  addNumericSpec(specs, "energy_shield", "Energy Shield", profile.energyShield);
  addNumericSpec(specs, "quality", "Quality", profile.quality, "%");
  addNumericSpec(specs, "sockets", "Sockets", item.sockets);
  addNumericSpec(specs, "spirit", "Spirit", item.spirit);

  item.explicit_mods.forEach((modifier, index) => {
    const label = cleanTradeMarkup(modifier);
    const tierMatch = resolveTierMatch(modifier, sourceTruth, item);

    // Pure envelope entries carry tier metadata but no display text.
    // Skip the entry and defer its tier info to the next real modifier.
    if (!label || !label.trim()) {
      if (tierMatch) {
        pendingTier = tierMatch;
      }
      return;
    }

    specs.push({
      key: `explicit:${specIndex}:${specTemplate(label)}`,
      label,
      kind: "explicit",
      value: firstNumber(label),
      template: specTemplate(label),
      tier_match: pendingTier ?? tierMatch,
    });
    specIndex += 1;
    pendingTier = null;
  });

  itemSpecsCache = {
    item,
    sourceTruth,
    profileKey,
    specs,
  };

  return specs;
}

export function profileSpecKeySet(
  item: ScannedItem,
  profile: PriceProfileId,
  sourceTruth: Poe2DbDataSnapshot | null = null,
) {
  return new Set(profileSpecs(item, profile, itemSpecs(item, itemProfile(item), sourceTruth)).map((spec) => spec.key));
}

export function profileSpecs(item: ScannedItem, profile: PriceProfileId, specs = itemSpecs(item)) {
  const searchable = searchableProfileSpecs(specs);

  switch (profile) {
    case "exact":
    case "broad":
      return searchable;
    case "base":
      return searchable.filter((spec) => isBaseProfileSpec(spec));
    case "quick":
    default:
      return quickPriceSpecs(searchable);
  }
}

export function activePriceFiltersForSelection(
  item: ScannedItem | null,
  selectedSpecKeys: Set<string>,
  selectedPriceProfile: PriceProfileId,
  sourceTruth: Poe2DbDataSnapshot | null = null,
) {
  if (!item) {
    return [];
  }

  return itemSpecs(item, itemProfile(item), sourceTruth)
    .filter((spec) => selectedSpecKeys.has(spec.key))
    .map((spec) => activeFilterForSpec(spec, selectedPriceProfile, sourceTruth));
}

export function classifySelectedSpecForSearch(spec: ItemSpec): { classification: FilterClass; reason: string } {
  if (spec.kind === "item_level" || spec.kind === "quality" || spec.kind === "sockets" || spec.kind === "spirit") {
    return { classification: "hard", reason: `trusted numeric ${spec.kind}` };
  }

  if (spec.kind === "armour" || spec.kind === "evasion" || spec.kind === "energy_shield") {
    return { classification: "hard", reason: `trusted defense ${spec.kind}` };
  }

  if (spec.kind === "required_level") {
    return { classification: "score", reason: "required level varies with rolls, not identity" };
  }

  if (spec.kind === "explicit") {
    if (spec.tier_match && spec.tier_match.min !== null) {
      return { classification: "hard", reason: `matched tier ${spec.tier_match.tier} (${spec.tier_match.source})` };
    }
    if (spec.tier_match) {
      return { classification: "score", reason: "tier matched but lacks numeric band for hard filtering" };
    }
    const label = spec.label.toLowerCase();
    if (label.includes("(implicit)") || label.includes("(rune)") || label.includes("(desecrated)")) {
      return { classification: "score", reason: "non-explicit modifier without tier match" };
    }
    if (label.includes("(corrupted)") || label.includes("(enchant)") || label.includes("(fractured)")) {
      return { classification: "score", reason: "special modifier without tier match" };
    }
    return { classification: "score", reason: "explicit modifier without known tier band or stat ID" };
  }

  return { classification: "score", reason: `unknown spec kind ${spec.kind}` };
}

export function hardPriceFiltersForSelection(
  item: ScannedItem | null,
  selectedSpecKeys: Set<string>,
  selectedPriceProfile: PriceProfileId,
  sourceTruth: Poe2DbDataSnapshot | null = null,
): ActivePriceFilter[] {
  return activePriceFiltersForSelection(item, selectedSpecKeys, selectedPriceProfile, sourceTruth)
    .filter((filter, index, all) => {
      const spec = itemSpecs(item!, itemProfile(item!), sourceTruth)
        .filter((s) => selectedSpecKeys.has(s.key))
        [index];
      if (!spec) return false;
      return classifySelectedSpecForSearch(spec).classification === "hard";
    });
}

export function rankListings(
  priceCheck: PriceCheck,
  item: ScannedItem | undefined,
  selectedSpecKeys: Set<string>,
  sourceTruth: Poe2DbDataSnapshot | null = null,
): ListingRank[] {
  const specs = item ? itemSpecs(item, itemProfile(item), sourceTruth) : [];
  const selectedSpecs = specs.filter((spec) => selectedSpecKeys.has(spec.key));
  const maxScore = selectedSpecs.length;
  if (!maxScore) {
    return priceCheck.listings.map((listing) => ({
      listing,
      score: 1,
      maxScore: 1,
      penalties: [],
    }));
  }

  const priceMatched = priceCheck.listings.map((listing) =>
    listingMatchesSelectedPriceOption(priceCheck, listing),
  );

  return priceCheck.listings.map((listing, listingIndex) => {
    if (!priceMatched[listingIndex]) {
      return { listing, score: -1, maxScore, penalties: ["price option mismatch"] };
    }

    const penalties: string[] = [];
    let hits = 0;

    for (const spec of selectedSpecs) {
      const classification = classifySelectedSpecForSearch(spec);
      if (!listingMatchesSpec(listing, spec)) {
        if (classification.classification === "hard") {
          penalties.push(`hard filter failed: ${spec.kind} "${spec.label}"`);
        } else {
          penalties.push(`score filter missed: ${spec.kind} "${spec.label}"`);
        }
      } else {
        hits++;
      }
    }

    const hardFailCount = penalties.filter((p) => p.startsWith("hard filter")).length;
    if (hardFailCount > 0) {
      return { listing, score: -1, maxScore, penalties };
    }

    return { listing, score: hits, maxScore, penalties };
  });
}

export function activeFilterSignature(filters: ActivePriceFilter[]) {
  return filters
    .map((filter) =>
      [
        filter.kind,
        filter.template,
        filter.label,
        filter.value === null ? "" : Number(filter.value).toFixed(3),
        filter.min === null || filter.min === undefined ? "" : Number(filter.min).toFixed(3),
        filter.max === null || filter.max === undefined ? "" : Number(filter.max).toFixed(3),
        filter.tier ?? "",
      ].join("|"),
    )
    .sort()
    .join(";");
}

export function appliedSpecKeySet(
  item: ScannedItem,
  priceCheck: PriceCheck,
  sourceTruth: Poe2DbDataSnapshot | null = null,
) {
  const applied = new Set<string>();
  const filters = priceCheck.applied_filters ?? [];
  if (!filters.length) {
    return applied;
  }

  const specs = itemSpecs(item, itemProfile(item), sourceTruth);
  filters.forEach((filter) => {
    const spec = specs.find((candidate) => activeFilterMatchesSpec(filter, candidate));
    if (spec) {
      applied.add(spec.key);
    }
  });

  return applied;
}

export function activeFilterMatchesSpec(filter: ActivePriceFilter, spec: ItemSpec) {
  if (filter.kind !== spec.kind) {
    return false;
  }

  if (filter.kind === "explicit") {
    if (filter.tier && spec.tier_match) {
      return filter.tier === spec.tier_match.tier || filter.tier.startsWith(`${spec.tier_match.tier}+`);
    }
    if (filter.tier && !spec.tier_match) {
      return false;
    }
    return templatesCompatible(filter.template, spec.template);
  }

  if (filter.label === spec.label) {
    return true;
  }

  if (filter.value === null || spec.value === null) {
    return filter.label === spec.label;
  }

  return Math.round(filter.value * 1000) === Math.round(spec.value * 1000);
}

export function filteredListings(
  priceCheck: PriceCheck,
  item: ScannedItem | undefined,
  selectedSpecKeys: Set<string>,
  sourceTruth: Poe2DbDataSnapshot | null = null,
) {
  const ranked = rankListings(priceCheck, item, selectedSpecKeys, sourceTruth);

  return ranked
    .filter((entry) => entry.score > 0 || (entry.score === 1 && entry.maxScore <= 1))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.penalties.length !== right.penalties.length) return left.penalties.length - right.penalties.length;
      return 0;
    })
    .map((entry) => entry.listing);
}

export function listingMatchesSelectedPriceOption(priceCheck: PriceCheck, listing: PriceListing) {
  switch (priceCheck.selected_price_option) {
    case "equivalent":
      return listing.amount !== null && !!listing.currency;
    case "exalted_divine":
      return listing.currency === "exalted" || listing.currency === "divine";
    default:
      return listing.currency === priceCheck.selected_price_option;
  }
}

export function listingMatchesSpec(listing: PriceListing, spec: ItemSpec) {
  switch (spec.kind) {
    case "item_level":
      return numericAtLeast(listing.item_level, spec.value);
    case "required_level":
      return numericEquals(listing.required_level, spec.value);
    case "quality":
      return numericEquals(listing.quality, spec.value);
    case "armour":
      return numericAtLeast(listing.armour, spec.value);
    case "evasion":
      return numericAtLeast(listing.evasion, spec.value);
    case "energy_shield":
      return numericAtLeast(listing.energy_shield, spec.value);
    case "sockets":
    case "spirit":
      return true;
    case "explicit":
      return listing.explicit_mods.some((modifier) => listingModifierMatchesSpec(modifier, spec));
  }
}

const TIER_SOURCE_KIND_RANK: Record<string, number> = {
  normal: 100,
  implicit: 90,
  corrupted: 80,
  essence: 70,
  socketable: 60,
  rune: 50,
  item_card: 40,
  perfect_essence: 40,
  fractured: 30,
  enchant: 20,
  // "repoe" (uniques/unclassified) and anything else gets default 10
};

/** Higher rank = more specific/useful for price checking → preferred. */
function tierSourceKindRank(sourceKind: string): number {
  return TIER_SOURCE_KIND_RANK[sourceKind] ?? 10;
}

export function resolveTierMatch(
  modifierLabel: string,
  sourceTruth: Poe2DbDataSnapshot | null,
  item?: Pick<ScannedItem, "item_class" | "base_type"> | null,
): TierMatch | null {
  // Try direct extraction from PoE2 envelope format first:
  // { Prefix Modifier "ModName" (Tier: N) — Tag1, Tag2 }
  const envelopeMatch = modifierLabel.match(/^\{[^}]*\}/);
  if (envelopeMatch) {
    const envelope = envelopeMatch[0];
    const affix = envelope.includes("Prefix") ? "prefix" : envelope.includes("Suffix") ? "suffix" : null;
    const tierMatch = envelope.match(/Tier:\s*(\d+)/i);
    const nameMatch = envelope.match(/"([^"]+)"/);
    const tier = tierMatch?.[1] ?? null;
    const name = nameMatch?.[1] ?? null;
    
    if (affix && tier) {
      return {
        source: "envelope",
        page_slug: "",
        tier: `T${tier}`,
        tier_name: name ?? `Tier ${tier}`,
        required_level: null,
        affix,
        source_kind: "explicit",
        min: null,
        max: null,
        template: specTemplate(modifierLabel),
        confidence: "template",
      };
    }
  }

  if (!sourceTruth?.mod_pages?.length) {
    return null;
  }

  const template = specTemplate(modifierLabel);
  const values = numbersInText(modifierLabel);
  if (!values.length) {
    return null;
  }
  const sourceHints = sourceKindHints(modifierLabel);

  // Build item-relevance hints once for page scoring
  const itemHints = [item?.item_class, item?.base_type]
    .filter((v): v is string => Boolean(v))
    .map(normalizedPageHint);

  // Collect ALL matching candidates across all pages, then pick the best one.
  // This prevents repoe-global unique mods from beating normal affixes from
  // base-type-specific pages when they share the same template.
  let best: { tier: Poe2DbModTier; page: Poe2DbModTierPage } | null = null;
  let bestRank = -1;
  let bestScore = 0;

  for (const page of prioritizedModPages(sourceTruth.mod_pages, item)) {
    let sameTemplate = page.tiers.filter((tier) => templatesCompatible(specTemplate(tier.template), template));
    if (!sameTemplate.length) continue;

    if (sourceHints.length) {
      sameTemplate = sameTemplate.filter((tier) => sourceHints.includes(tier.source_kind));
    }

    const pageScore = pageHintScore(page.slug, itemHints);

    for (const tier of sameTemplate) {
      if (!tierMatchesValues(tier, values)) continue;

      const skRank = tierSourceKindRank(tier.source_kind);
      // Primary sort: source_kind rank (normal > repoe).
      // Secondary: page relevance score (base-type page > generic repoe-global).
      // Tertiary: required_level as tiebreaker (higher = later tier = tighter rolls).
      const score = skRank * 100000 + pageScore * 100 + (tier.required_level ?? 0);

      if (skRank > bestRank || (skRank === bestRank && score > bestScore)) {
        bestRank = skRank;
        bestScore = score;
        best = { tier, page };
      }
    }
  }

  if (!best) return null;

  const firstBand = best.tier.roll_bands[0];
  const confidence = firstBand ? "validated" : "template";
  return {
    source: best.page.slug.startsWith("repoe-") ? "repoe" : "poe2db",
    page_slug: best.page.slug,
    tier: best.tier.tier,
    tier_name: best.tier.name,
    required_level: best.tier.required_level,
    affix: best.tier.affix,
    source_kind: best.tier.source_kind,
    min: firstBand?.min ?? null,
    max: firstBand?.max ?? null,
    template,
    confidence,
  };
}

function prioritizedModPages(
  pages: Poe2DbModTierPage[],
  item?: Pick<ScannedItem, "item_class" | "base_type"> | null,
) {
  const hints = [item?.item_class, item?.base_type]
    .filter((value): value is string => Boolean(value))
    .map(normalizedPageHint);

  if (!hints.length) {
    return pages;
  }

  return [...pages].sort((left, right) => pageHintScore(right.slug, hints) - pageHintScore(left.slug, hints));
}

function pageHintScore(slug: string, hints: string[]) {
  const normalizedSlug = normalizedPageHint(slug);
  if (hints.some((hint) => normalizedSlug === hint || normalizedSlug.endsWith(`_${hint}`))) {
    return 100;
  }
  if (hints.some((hint) => normalizedSlug.includes(hint) || hint.includes(normalizedSlug))) {
    return 50;
  }
  const hintWords = hints.flatMap((hint) => hint.split("_")).filter((word) => word.length > 3);
  return hintWords.some((word) => normalizedSlug.includes(word)) ? 20 : 0;
}

function normalizedPageHint(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sourceKindHints(value: string) {
  const normalized = cleanTradeMarkup(value).toLowerCase();
  const hints: string[] = [];
  if (normalized.includes("rune")) {
    hints.push("socketable", "rune", "item_card");
  }
  if (normalized.includes("desecrated")) {
    hints.push("desecrated");
  }
  if (normalized.includes("implicit")) {
    hints.push("implicit", "rune", "item_card");
  }
  if (normalized.includes("corrupted")) {
    hints.push("corrupted");
  }
  if (normalized.includes("essence")) {
    hints.push("essence", "perfect_essence");
  }
  return hints;
}

function sourceKindScore(sourceKind: string, hints: string[]) {
  if (!hints.length) {
    return 0;
  }
  const index = hints.indexOf(sourceKind);
  return index >= 0 ? 100 - index : 0;
}

export function cleanTradeMarkup(value: string) {
  // Strip PoE1-style tag markers [Tag|text] -> text
  let cleaned = value.replace(/\[([^|\]]+\|)?([^\]]+)\]/g, "$2");
  
  // Strip PoE2 envelope prefix: { Prefix "Name" (Tier: N) — Tags }
  // Envelope is metadata for tier/affix labels, not display text.
  cleaned = cleaned.replace(/^\{\s*[^}]*\}\s*/, "");
  
  // Strip em-dash tag lists ( — Tag1, Tag2 )
  cleaned = cleaned.replace(/\s*—\s*.*$/, "");
  
  // Strip remaining em-dashes
  cleaned = cleaned.replace(/—/g, " ").replace(/\s+/g, " ").trim();
  
  return cleaned;
}

export function specTemplate(value: string) {
  return cleanTradeMarkup(value)
    .toLowerCase()
    .replace(/\b(rune|implicit|desecrated|corrupted|fractured|enchant|augmented)\b/g, " ")
    .replace(/\d+(?:\.\d+)?/g, "#")
    .replace(/\s*%\s*/g, "% ")
    .replace(/[^a-z#%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstNumber(value: string) {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function isItemValueModifier(label: string) {
  return /^(quality|armour|evasion rating|energy shield|physical damage|critical hit chance|attacks per second|dps):/i.test(
    cleanTradeMarkup(label),
  );
}

function addNumericSpec(
  specs: ItemSpec[],
  kind: ItemSpec["kind"],
  label: string,
  value: number | null,
  suffix = "",
) {
  if (value === null) {
    return;
  }

  specs.push({
    key: `${kind}:${value}`,
    label: `${label}: ${value}${suffix}`,
    kind,
    value,
    template: kind,
  });
}

function searchableProfileSpecs(specs: ItemSpec[]) {
  return specs.filter((spec) => {
    if (spec.kind === "sockets" || spec.kind === "spirit" || spec.kind === "required_level") {
      return false;
    }

    if (spec.kind !== "explicit") {
      return spec.value !== null;
    }

    if (isItemValueModifier(spec.label)) {
      return false;
    }

    return true;
  });
}

function quickPriceSpecs(specs: ItemSpec[]) {
  return specs
    .filter((spec) => spec.kind === "explicit" && isQuickPriceCandidate(spec))
    .map((spec) => ({ spec, score: priceImpactScore(spec) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.spec.label.localeCompare(right.spec.label))
    .slice(0, 3)
    .map((entry) => entry.spec);
}

function isQuickPriceCandidate(spec: ItemSpec) {
  const label = spec.label.toLowerCase();
  return !(
    label.includes("(implicit)") ||
    label.includes("(rune)") ||
    label.includes("(desecrated)") ||
    label.includes("(corrupted)") ||
    label.includes("(enchant)") ||
    label.includes("(fractured)")
  );
}

function isBaseProfileSpec(spec: ItemSpec) {
  if (spec.kind === "item_level") {
    return true;
  }

  if (spec.kind !== "explicit") {
    return false;
  }

  const label = spec.label.toLowerCase();
  return (
    label.includes("(implicit)") ||
    label.includes("(fractured)") ||
    label.includes("(desecrated)") ||
    label.includes("(corrupted)")
  );
}

function priceImpactScore(spec: ItemSpec) {
  const label = spec.label.toLowerCase();
  const value = Math.abs(spec.value ?? 0);
  let score = Math.min(value, 120);

  if (/level of all|level of .* skills|gem level/.test(label)) {
    score += 320;
  }
  if (/movement speed|attack speed|cast speed|projectile speed/.test(label)) {
    score += 260;
  }
  if (/gain .* as extra|power charge|frenzy charge|endurance charge|maximum power charges|maximum rage/.test(label)) {
    score += 250;
  }
  if (/physical damage|elemental damage|spell damage|attack damage|damage with/.test(label)) {
    score += 220;
  }
  if (/maximum life|maximum mana|spirit|strength|dexterity|intelligence|all attributes/.test(label)) {
    score += 180;
  }
  if (/resistance|chaos resistance|rarity of items/.test(label)) {
    score += 150;
  }
  if (/stun threshold|accuracy|light radius|life regeneration/.test(label)) {
    score += 70;
  }

  return score;
}

function activeFilterForSpec(
  spec: ItemSpec,
  selectedPriceProfile: PriceProfileId,
  sourceTruth: Poe2DbDataSnapshot | null,
): ActivePriceFilter {
  const tierBand = tierBandForProfile(spec, selectedPriceProfile, sourceTruth);
  return {
    kind: spec.kind,
    label: spec.label,
    value: valueForProfileFilter(spec, selectedPriceProfile),
    template: spec.template,
    min: tierBand?.min ?? null,
    max: tierBand?.max ?? null,
    tier: tierBand?.tier ?? spec.tier_match?.tier ?? null,
    tier_name: tierBand?.tier_name ?? spec.tier_match?.tier_name ?? null,
    affix: spec.tier_match?.affix ?? null,
    source: spec.tier_match?.source ?? null,
  };
}

function tierBandForProfile(
  spec: ItemSpec,
  selectedPriceProfile: PriceProfileId,
  sourceTruth: Poe2DbDataSnapshot | null,
) {
  const match = spec.tier_match;
  if (!match || match.min === null) {
    return null;
  }

  if (selectedPriceProfile !== "broad") {
    return match;
  }

  const neighboringTier = nextLowerTier(match, sourceTruth);
  if (!neighboringTier?.roll_bands[0]) {
    return {
      ...match,
      max: null,
    };
  }

  return {
    ...match,
    tier: `${match.tier}+`,
    tier_name: `${match.tier_name} or lower neighbor`,
    min: neighboringTier.roll_bands[0].min,
    max: null,
  };
}

function nextLowerTier(match: TierMatch, sourceTruth: Poe2DbDataSnapshot | null) {
  const page = sourceTruth?.mod_pages.find((candidate) => candidate.slug === match.page_slug);
  if (!page) {
    return null;
  }

  const group = page.tiers
    .filter((tier) => specTemplate(tier.template) === match.template && (tier.affix ?? null) === (match.affix ?? null))
    .sort((left, right) => right.required_level - left.required_level);
  const currentIndex = group.findIndex((tier) => tier.tier === match.tier && tier.name === match.tier_name);
  return currentIndex >= 0 ? group[currentIndex + 1] ?? null : null;
}

function valueForProfileFilter(spec: ItemSpec, selectedPriceProfile: PriceProfileId) {
  if (selectedPriceProfile !== "broad" || spec.value === null) {
    return spec.value;
  }

  if (spec.kind === "item_level" || spec.kind === "required_level") {
    return spec.value;
  }

  return Math.floor(spec.value * 0.9 * 10) / 10;
}

function templatesCompatible(left: string, right: string) {
  return left === right || left.includes(right) || right.includes(left);
}

function listingModifierMatchesSpec(modifier: string, spec: ItemSpec) {
  const cleaned = cleanTradeMarkup(modifier);
  if (specTemplate(cleaned) !== spec.template) {
    return false;
  }

  const tier = spec.tier_match;
  if (!tier || tier.min === null) {
    return true;
  }

  const first = firstNumber(cleaned);
  if (first === null) {
    return true;
  }

  return first >= tier.min && (tier.max === null || first <= tier.max);
}

function tierMatchesValues(tier: Poe2DbModTier, values: number[]) {
  // If the mod has no roll bands at all, accept template match without value validation.
  // This handles PoE2DB pages where roll range scraping failed (11.9% of tiers).
  if (!tier.roll_bands.length) {
    return true;
  }

  return values.every((value, index) => {
    const band = tier.roll_bands[index];
    if (!band) {
      return false;
    }
    return value >= band.min && value <= band.max;
  }) && values.length <= tier.roll_bands.length;
}

function numbersInText(value: string) {
  return cleanTradeMarkup(value)
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((number) => Number.isFinite(number)) ?? [];
}

function numericAtLeast(actual: number | null, expected: number | null) {
  return actual !== null && expected !== null && actual >= expected;
}

function numericEquals(actual: number | null, expected: number | null) {
  return actual !== null && expected !== null && Math.round(actual) === Math.round(expected);
}

function parseRawNumber(rawText: string, regex: RegExp) {
  const match = rawText.match(regex);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}
