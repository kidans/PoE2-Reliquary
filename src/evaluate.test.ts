import { describe, expect, it } from "vitest";
import {
  activeFilterSignature,
  activePriceFiltersForSelection,
  classifySelectedSpecForSearch,
  filteredListingRanks,
  filteredListings,
  hardPriceFiltersForSelection,
  itemSpecs,
  listingMatchesSelectedPriceOption,
  profileSpecKeySet,
  rankListings,
  resolveTierMatch,
  type PriceCheck,
  type PriceListing,
  type Poe2DbDataSnapshot,
  type ScannedItem,
} from "./evaluate";

const baseItem: ScannedItem = {
  name: "Maji Talisman",
  rarity: "Rare",
  family: "accessory",
  item_class: "Talismans",
  base_type: "Maji Talisman",
  item_level: 81,
  property_lines: [],
  explicit_mods: [
    "Quality: +21%",
    "18% increased Physical Damage (Rune)",
    "Gain 5% of Damage as Extra Damage of all Elements (Rune)",
    "158% increased Physical Damage",
    "Adds 30 to 40 Physical Damage",
    "+5 to Level of all Attack Skills",
    "Gain 28% of Damage as Extra Physical Damage",
    "23% chance to gain Onslaught on Killing Hits with this Weapon",
    "+8 to Maximum Rage (Implicit)",
    "15% increased Attack Speed (Desecrated)",
  ],
  sockets: 2,
  spirit: null,
  hazards: [],
  trade_url: null,
  raw_text: [
    "Item Class: Talismans",
    "Rarity: Rare",
    "Maji Talisman",
    "Item Level: 81",
    "Requires Level: 79",
    "Sockets: 2",
    "Quality: +21%",
  ].join("\n"),
};

const poe2dbSnapshot: Poe2DbDataSnapshot = {
  schema_version: 1,
  source: "PoE2DB",
  fetched_at_epoch_ms: 1,
  cache_path: null,
  families: [],
  leagues: [],
  mod_pages: [
    {
      slug: "Physical_damage",
      source_url: "https://poe2db.tw/us/Physical_damage",
      tiers: [
        {
          id: "adds-physical-flaring",
          tier: "T1",
          name: "Flaring",
          source_kind: "normal",
          required_level: 75,
          affix: "prefix",
          text: "Adds (26-39) to (44-66) Physical Damage",
          template: "Adds # to # Physical Damage",
          roll_bands: [
            { min: 26, max: 39 },
            { min: 44, max: 66 },
          ],
          tags: ["damage", "physical", "attack"],
        },
        {
          id: "adds-physical-tempered",
          tier: "T2",
          name: "Tempered",
          source_kind: "normal",
          required_level: 65,
          affix: "prefix",
          text: "Adds (21-31) to (36-53) Physical Damage",
          template: "Adds # to # Physical Damage",
          roll_bands: [
            { min: 21, max: 31 },
            { min: 36, max: 53 },
          ],
          tags: ["damage", "physical", "attack"],
        },
        {
          id: "increased-physical-flaring",
          tier: "T1",
          name: "Flaring",
          source_kind: "normal",
          required_level: 75,
          affix: "prefix",
          text: "(150-169)% increased Physical Damage",
          template: "#% increased Physical Damage",
          roll_bands: [
            { min: 150, max: 169 },
          ],
          tags: ["damage", "physical", "attack"],
        },
        {
          id: "all-attack-skills-flaring",
          tier: "T1",
          name: "Flaring",
          source_kind: "normal",
          required_level: 75,
          affix: "prefix",
          text: "+(5-5) to Level of all Attack Skills",
          template: "+# to Level of all Attack Skills",
          roll_bands: [
            { min: 5, max: 5 },
          ],
          tags: ["attack", "gem"],
        },
      ],
    },
  ],
  status: {
    state: "ready",
    message: "ready",
    fresh: true,
    cache_age_seconds: 0,
    pages_cached: 1,
    pages_failed: 0,
    failed_pages: [],
  },
};

function listing(overrides: Partial<PriceListing> = {}): PriceListing {
  return {
    price: "1 exalted",
    amount: 1,
    currency: "exalted",
    currency_icon_url: null,
    normalized_price: "1 exalted",
    normalized_amount: 1,
    normalized_currency: "exalted",
    normalized_currency_icon_url: null,
    item_level: 81,
    listed: "1h",
    source_url: "https://www.pathofexile.com/trade2/listing/poe2/Fate%20of%20the%20Vaal/example",
    seller: "tester#1234",
    online: true,
    required_level: 79,
    quality: 21,
    armour: null,
    evasion: null,
    energy_shield: null,
    explicit_mods: [
      "154% increased Physical Damage",
      "+5 to Level of all Attack Skills",
      "Gain 31% of Damage as Extra Physical Damage",
    ],
    preview_name: null,
    preview_base_type: null,
    preview_rarity: null,
    preview_item_class: null,
    preview_icon_url: null,
    preview_property_lines: [],
    preview_description: null,
    hashes_explicit: [],
    hashes_implicit: [],
    hashes_rune: [],
    hashes_desecrated: [],
    hashes_enchant: [],
    hash_count: 0,
    mod_tier_infos: [],
    ...overrides,
  };
}

function priceCheck(overrides: Partial<PriceCheck> = {}): PriceCheck {
  return {
    status: "ready",
    matched: 3,
    source_url: null,
    selected_currency: "exalted",
    selected_price_option: "exalted",
    rate_source: null,
    rate_limit: null,
    currencies: [{ id: "exalted", name: "Exalted Orb", icon_url: null }],
    filters: [],
    requested_filters: [],
    applied_filters: [],
    listings: [listing(), listing({ currency: "divine", amount: 1 }), listing({ item_level: 70 })],
    error: null,
    ...overrides,
  };
}

describe("evaluate filter signatures", () => {
  it("sorts filters and normalizes numeric values", () => {
    expect(
      activeFilterSignature([
        {
          kind: "explicit",
          template: "maximum life",
          label: "+73 to Maximum Life",
          value: 73,
        },
        {
          kind: "quality",
          template: "quality",
          label: "Quality: 20%",
          value: 20.1234,
        },
      ]),
    ).toBe("explicit|maximum life|+73 to Maximum Life|73.000|||;quality|quality|Quality: 20%|20.123|||");
  });

  it("relaxes broad numeric filters without relaxing item level", () => {
    const specs = itemSpecs(baseItem);
    const selected = new Set([
      specs.find((spec) => spec.kind === "item_level")?.key,
      specs.find((spec) => spec.label === "+5 to Level of all Attack Skills")?.key,
    ].filter((key): key is string => Boolean(key)));

    expect(activePriceFiltersForSelection(baseItem, selected, "broad")).toEqual([
      expect.objectContaining({ kind: "item_level", value: 81 }),
      expect.objectContaining({ kind: "explicit", value: 4.5 }),
    ]);
  });
});

describe("evaluate profile defaults", () => {
  it("quick price selects high-impact explicit mods and ignores item values/runes/implicits", () => {
    const selectedKeys = profileSpecKeySet(baseItem, "quick");
    const selectedLabels = itemSpecs(baseItem)
      .filter((spec) => selectedKeys.has(spec.key))
      .map((spec) => spec.label);

    expect(selectedLabels).toEqual([
      "158% increased Physical Damage",
      "+5 to Level of all Attack Skills",
      "Gain 28% of Damage as Extra Physical Damage",
    ]);
  });

  it("crafting base keeps item level and base-defining special modifiers", () => {
    const selectedKeys = profileSpecKeySet(baseItem, "base");
    const selectedLabels = itemSpecs(baseItem)
      .filter((spec) => selectedKeys.has(spec.key))
      .map((spec) => spec.label);

    expect(selectedLabels).toEqual([
      "Item Level: 81",
      "+8 to Maximum Rage (Implicit)",
      "15% increased Attack Speed (Desecrated)",
    ]);
  });
});

describe("evaluate listing matching", () => {
  it("respects the selected price option", () => {
    const check = priceCheck({ selected_price_option: "exalted_divine" });

    expect(listingMatchesSelectedPriceOption(check, listing({ currency: "exalted" }))).toBe(true);
    expect(listingMatchesSelectedPriceOption(check, listing({ currency: "divine" }))).toBe(true);
    expect(listingMatchesSelectedPriceOption(check, listing({ currency: "regal" }))).toBe(false);
  });

  it("keeps official rows visible while ranking selected soft specs first", () => {
    const specs = itemSpecs(baseItem);
    const selected = new Set([
      specs.find((spec) => spec.label === "+5 to Level of all Attack Skills")?.key,
    ].filter((key): key is string => Boolean(key)));

    const visible = filteredListings(priceCheck(), baseItem, selected);

    expect(visible).toHaveLength(2);
    expect(visible[0].explicit_mods).toContain("+5 to Level of all Attack Skills");
  });

  it("still removes rows that fail backend-applied structural hard specs", () => {
    const specs = itemSpecs(baseItem);
    const itemLevelSpec = specs.find((spec) => spec.kind === "item_level");
    const selected = new Set([
      itemLevelSpec?.key,
      specs.find((spec) => spec.label === "+5 to Level of all Attack Skills")?.key,
    ].filter((key): key is string => Boolean(key)));

    const visible = filteredListings(
      priceCheck({
        applied_filters: itemLevelSpec
          ? [{
              kind: itemLevelSpec.kind,
              label: itemLevelSpec.label,
              value: itemLevelSpec.value,
              template: itemLevelSpec.template,
            }]
          : [],
      }),
      baseItem,
      selected,
    );

    expect(visible).toHaveLength(1);
    expect(visible[0].item_level).toBe(81);
  });
});

describe("PoE2DB tier matching", () => {
  it("resolves copied wide-range mods to trusted tier bands", () => {
    const match = resolveTierMatch("Adds 30 to 50 Physical Damage", poe2dbSnapshot);

    expect(match).toEqual(
      expect.objectContaining({
        tier: "T1",
        tier_name: "Flaring",
        min: 26,
        max: 39,
        affix: "prefix",
        confidence: "validated",
      }),
    );
  });

  it("uses tier bands for exact filters and broadens one lower tier for broad filters", () => {
    const item = {
      ...baseItem,
      explicit_mods: ["Adds 30 to 50 Physical Damage"],
    };
    const specs = itemSpecs(item, undefined, poe2dbSnapshot);
    const selected = new Set([specs.find((spec) => spec.kind === "explicit")?.key].filter((key): key is string => Boolean(key)));

    expect(activePriceFiltersForSelection(item, selected, "exact", poe2dbSnapshot)).toEqual([
      expect.objectContaining({ min: 26, max: 39, tier: "T1", tier_name: "Flaring" }),
    ]);
    expect(activePriceFiltersForSelection(item, selected, "broad", poe2dbSnapshot)).toEqual([
      expect.objectContaining({ min: 21, max: null, tier: "T1+" }),
    ]);
  });
});

describe("tier matching with empty roll_bands", () => {
  it("returns a match when template matches but roll_bands are empty (PoE2DB scraping gap)", () => {
    const snapshot: Poe2DbDataSnapshot = {
      ...poe2dbSnapshot,
      mod_pages: [
        {
          slug: "Talismans",
          source_url: "https://poe2db.tw/us/Talismans",
          tiers: [
            {
              id: "crit-chance-t1",
              tier: "T1",
              name: "of Unmaking",
              source_kind: "normal",
              required_level: 82,
              affix: "suffix",
              text: "+1% to Critical Hit Chance",
              template: "+# % to Critical Hit Chance",
              roll_bands: [], // PoE2DB scraping failed here
              tags: [],
            },
          ],
        },
      ],
      status: { ...poe2dbSnapshot.status },
    };

    const match = resolveTierMatch("+2.43% to Critical Hit Chance", snapshot);

    expect(match).toBeDefined();
    expect(match!.tier).toBe("T1");
    expect(match!.tier_name).toBe("of Unmaking");
    expect(match!.affix).toBe("suffix");
    expect(match!.min).toBeNull();
    expect(match!.max).toBeNull();
    expect(match!.confidence).toBe("template");
  });

  it("still prefers tiers with populated roll_bands when they match", () => {
    const snapshot: Poe2DbDataSnapshot = {
      ...poe2dbSnapshot,
      mod_pages: [
        {
          slug: "Physical_damage",
          source_url: "https://poe2db.tw/us/Physical_damage",
          tiers: [
            {
              id: "adds-physical-tempered",
              tier: "T2",
              name: "Tempered",
              source_kind: "normal",
              required_level: 65,
              affix: "prefix",
              text: "Adds (21-31) to (36-53) Physical Damage",
              template: "Adds # to # Physical Damage",
              roll_bands: [
                { min: 21, max: 31 },
                { min: 36, max: 53 },
              ],
              tags: [],
            },
            {
              id: "adds-physical-flaring",
              tier: "T1",
              name: "Flaring",
              source_kind: "normal",
              required_level: 75,
              affix: "prefix",
              text: "Adds (26-39) to (44-66) Physical Damage",
              template: "Adds # to # Physical Damage",
              roll_bands: [
                { min: 26, max: 39 },
                { min: 44, max: 66 },
              ],
              tags: [],
            },
            // Empty-bands copy — lower req level so lower score, should NOT beat exact band match
            {
              id: "adds-physical-empty",
              tier: "T0",
              name: "Empty Bands",
              source_kind: "normal",
              required_level: 20,
              affix: "prefix",
              text: "Adds (0-0) to (0-0) Physical Damage",
              template: "Adds # to # Physical Damage",
              roll_bands: [],
              tags: [],
            },
          ],
        },
      ],
      status: { ...poe2dbSnapshot.status },
    };

    // "Adds 30 to 50 Physical Damage" should match T1 (Flaring) via roll_bands, not T0 (empty bands)
    const match = resolveTierMatch("Adds 30 to 50 Physical Damage", snapshot);
    expect(match).toBeDefined();
    expect(match!.tier).toBe("T1");
    expect(match!.tier_name).toBe("Flaring");
  });
});

describe("tier matching source_kind priority", () => {
  it("prefers normal source_kind over repoe (unique) when roll_bands on both pages match", () => {
    const snapshot: Poe2DbDataSnapshot = {
      ...poe2dbSnapshot,
      mod_pages: [
        {
          slug: "repoe-global",
          source_url: "https://repoe.github.io/poe2/data",
          tiers: [
            {
              id: "unique-pierce",
              tier: "T1",
              name: "UniquePierceChance",
              source_kind: "repoe",
              required_level: 72,
              affix: "prefix",
              text: "#% chance to Pierce an Enemy",
              template: "#% chance to [Pierce|Pierce] an Enemy",
              roll_bands: [{ min: 15, max: 25 }],
              tags: [],
            },
          ],
        },
        {
          slug: "repoe-dexjewel",
          source_url: "https://repoe.github.io/poe2/data",
          tiers: [
            {
              id: "normal-pierce",
              tier: "T1",
              name: "of Piercing",
              source_kind: "normal",
              required_level: 72,
              affix: "suffix",
              text: "#% chance to Pierce an Enemy",
              template: "#% chance to [Pierce|Pierce] an Enemy",
              roll_bands: [{ min: 10, max: 20 }],
              tags: [],
            },
          ],
        },
      ],
      status: { ...poe2dbSnapshot.status },
    };

    // 17% pierce chance falls in both bands (15-25 repoe, 10-20 normal)
    const match = resolveTierMatch("17% chance to Pierce an Enemy", snapshot);
    expect(match).toBeDefined();
    expect(match!.tier).toBe("T1");
    expect(match!.tier_name).toBe("of Piercing");
    expect(match!.source_kind).toBe("normal");
    expect(match!.page_slug).toBe("repoe-dexjewel");
  });

  it("falls through to repoe source_kind when no normal match exists", () => {
    const snapshot: Poe2DbDataSnapshot = {
      ...poe2dbSnapshot,
      mod_pages: [
        {
          slug: "repoe-global",
          source_url: "https://repoe.github.io/poe2/data",
          tiers: [
            {
              id: "unique-poison-on-crit",
              tier: "T1",
              name: "CausesPoisonOnCritUniqueDagger",
              source_kind: "repoe",
              required_level: 75,
              affix: "prefix",
              text: "#% chance to Cause Poison on Critical Hit",
              template: "#% chance to Cause Poison on [Critical|Critical Hit]",
              roll_bands: [{ min: 50, max: 50 }],
              tags: [],
            },
          ],
        },
      ],
      status: { ...poe2dbSnapshot.status },
    };

    // This mod template only exists in repoe-global — no normal page has it
    const match = resolveTierMatch("50% chance to Cause Poison on Critical Hit", snapshot);
    expect(match).toBeDefined();
    expect(match!.tier).toBe("T1");
    expect(match!.tier_name).toBe("CausesPoisonOnCritUniqueDagger");
    expect(match!.source_kind).toBe("repoe");
  });
});

describe("hard/score filter classification", () => {
  it("classifies stats with trusted tier band matches as hard", () => {
    const specs = itemSpecs(baseItem, undefined, poe2dbSnapshot);
    const physicalSpec = specs.find((spec) => spec.label === "Adds 30 to 40 Physical Damage");
    expect(physicalSpec).toBeDefined();

    const classification = classifySelectedSpecForSearch(physicalSpec!);
    expect(classification.classification).toBe("hard");
    expect(classification.reason).toMatch(/matched tier/);
  });

  it("classifies explicit mods without tier band matches as score-only", () => {
    const specs = itemSpecs(baseItem);
    const gainSpec = specs.find((spec) => spec.label === "Gain 28% of Damage as Extra Physical Damage");
    expect(gainSpec).toBeDefined();

    const classification = classifySelectedSpecForSearch(gainSpec!);
    expect(classification.classification).toBe("score");
  });

  it("classifies item level, quality, and sockets as hard trusted numerics", () => {
    const specs = itemSpecs(baseItem);
    for (const kind of ["item_level", "quality", "sockets"] as const) {
      const spec = specs.find((s) => s.kind === kind);
      expect(spec).toBeDefined();
      expect(classifySelectedSpecForSearch(spec!).classification).toBe("hard");
    }
  });

  it("classifies required level as score-only", () => {
    const itemWithRequiredLevel: ScannedItem = {
      ...baseItem,
      raw_text: baseItem.raw_text + "\nRequires: Level 79",
    };
    const specs = itemSpecs(itemWithRequiredLevel);
    const requiredLevel = specs.find((s) => s.kind === "required_level");
    expect(requiredLevel).toBeDefined();
    expect(classifySelectedSpecForSearch(requiredLevel!).classification).toBe("score");
    expect(classifySelectedSpecForSearch(requiredLevel!).reason).toContain("varies");
  });

  it("classifies implicits, runes, and desecrated mods without tier match as score", () => {
    const specs = itemSpecs(baseItem);
    const implicit = specs.find((s) => s.label.includes("(Implicit)"));
    const rune = specs.find((s) => s.label.includes("(Rune)"));
    const desecrated = specs.find((s) => s.label.includes("(Desecrated)"));

    expect(implicit).toBeDefined();
    expect(classifySelectedSpecForSearch(implicit!).classification).toBe("score");

    expect(rune).toBeDefined();
    expect(classifySelectedSpecForSearch(rune!).classification).toBe("score");

    expect(desecrated).toBeDefined();
    expect(classifySelectedSpecForSearch(desecrated!).classification).toBe("score");
  });
});

describe("hard filter routing", () => {
  it("sends only hard filters to the API and keeps all for ranking", () => {
    const specs = itemSpecs(baseItem, undefined, poe2dbSnapshot);
    const allKeys = new Set(specs.map((s) => s.key));
    const hardFilters = hardPriceFiltersForSelection(baseItem, allKeys, "quick", poe2dbSnapshot);

    expect(hardFilters.length).toBeLessThan(allKeys.size);
    expect(hardFilters.length).toBeGreaterThan(0);

    expect(hardFilters.every((f) => (
      f.kind === "item_level"
      || f.kind === "quality"
      || f.kind === "sockets"
      || (f.kind === "explicit" && f.tier !== null)
    ))).toBe(true);
  });

  it("sends every selected hard explicit filter so the redirect matches the query", () => {
    const specs = itemSpecs(baseItem, undefined, poe2dbSnapshot);
    const selected = new Set(
      specs
        .filter((s) =>
          s.label.includes("Adds 30 to 40 Physical Damage")
          || s.label.includes("158% increased Physical Damage")
          || s.label.includes("Level of all Attack")
        )
        .map((s) => s.key),
    );

    const hardFilters = hardPriceFiltersForSelection(baseItem, selected, "quick", poe2dbSnapshot);

    expect(hardFilters.filter((filter) => filter.kind === "explicit")).toHaveLength(3);
  });
});

describe("soft listing ranking", () => {
  it("ranks listings by selected spec match count instead of all-or-nothing", () => {
    const specs = itemSpecs(baseItem);
    const selected = new Set([
      specs.find((s) => s.kind === "item_level")?.key,
      specs.find((s) => s.label === "+5 to Level of all Attack Skills")?.key,
    ].filter((key): key is string => Boolean(key)));

    const itemLevelSpec = specs.find((s) => s.kind === "item_level");
    const check = priceCheck({
      selected_price_option: "exalted_divine",
      applied_filters: itemLevelSpec
        ? [{
            kind: itemLevelSpec.kind,
            label: itemLevelSpec.label,
            value: itemLevelSpec.value,
            template: itemLevelSpec.template,
          }]
        : [],
    });
    const rankings = rankListings(check, baseItem, selected);

    const passing = rankings.filter((r) => r.score >= 0);
    const failing = rankings.filter((r) => r.score < 0);
    expect(passing.length).toBe(2);
    expect(failing.length).toBe(1);
    expect(failing[0].penalties).toEqual(
      expect.arrayContaining([expect.stringContaining("item_level")]),
    );
  });

  it("Maji Talisman shows listings even when some selected mods lack stat ID mappings", () => {
    const specs = itemSpecs(baseItem, undefined, poe2dbSnapshot);
    const selected = new Set(
      specs
        .filter((s) =>
          s.label.includes("158% increased Physical Damage")
          || s.label.includes("Level of all Attack")
          || s.label.includes("Gain 28%")
          || s.label.includes("Item Level"),
        )
        .map((s) => s.key),
    );
    expect(selected.size).toBeGreaterThanOrEqual(3);

    const hardCount = hardPriceFiltersForSelection(baseItem, selected, "quick", poe2dbSnapshot).length;
    expect(hardCount).toBeGreaterThan(0);
    expect(hardCount).toBeLessThan(selected.size);

    const visible = filteredListings(priceCheck(), baseItem, selected, poe2dbSnapshot);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThanOrEqual(3);
  });

  it("does not return empty results when hard filters match but score filters miss", () => {
    const check = priceCheck({
      listings: [
        listing({
          explicit_mods: [
            "158% increased Physical Damage",
            "+5 to Level of all Attack Skills",
          ],
        }),
        listing({
          explicit_mods: [
            "Adds 28 to 48 Physical Damage",
            "+5 to Level of all Attack Skills",
          ],
        }),
      ],
    });

    const specs = itemSpecs(baseItem, undefined, poe2dbSnapshot);
    const selected = new Set(
      specs
        .filter((s) =>
          s.label.includes("Physical Damage")
          || s.label.includes("Level of all Attack")
          || s.label.includes("Gain 28% as Extra Physical Damage"),
        )
        .map((s) => s.key),
    );

    const visible = filteredListings(check, baseItem, selected, poe2dbSnapshot);
    expect(visible.length).toBeGreaterThan(0);
  });

  it("keeps soft-missed official rows visible with ranking penalties for UI disclosure", () => {
    const check = priceCheck({
      listings: [
        listing({
          explicit_mods: [
            "158% increased Physical Damage",
            "+5 to Level of all Attack Skills",
          ],
        }),
      ],
    });

    const specs = itemSpecs(baseItem, undefined, poe2dbSnapshot);
    const selected = new Set(
      specs
        .filter((s) =>
          s.label.includes("158% increased Physical Damage")
          || s.label.includes("Gain 28% of Damage as Extra Physical Damage"),
        )
        .map((s) => s.key),
    );

    const ranked = filteredListingRanks(check, baseItem, selected, poe2dbSnapshot);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBeLessThan(ranked[0].maxScore);
    expect(ranked[0].penalties).toEqual(
      expect.arrayContaining([expect.stringContaining("score filter missed")]),
    );
  });

  it("hides rows with no selected explicit modifier overlap", () => {
    const check = priceCheck({
      applied_filters: [],
      listings: [
        listing({
          explicit_mods: ["+5 to Level of all Attack Skills"],
        }),
      ],
    });
    const specs = itemSpecs(baseItem, undefined, poe2dbSnapshot);
    const selected = new Set(
      specs
        .filter((s) => s.label.includes("Adds 30 to 40 Physical Damage"))
        .map((s) => s.key),
    );

    const ranked = filteredListingRanks(check, baseItem, selected, poe2dbSnapshot);

    expect(ranked).toHaveLength(0);
  });

  it("keeps partial rows when at least one selected explicit modifier overlaps", () => {
    const check = priceCheck({
      applied_filters: [],
      listings: [
        listing({
          explicit_mods: [
            "158% increased Physical Damage",
            "1 to 3 Physical Thorns Damage",
          ],
        }),
      ],
    });
    const specs = itemSpecs(baseItem, undefined, poe2dbSnapshot);
    const selected = new Set(
      specs
        .filter((s) =>
          s.label.includes("158% increased Physical Damage")
          || s.label.includes("Level of all Attack")
          || s.label.includes("Gain 28% of Damage as Extra Physical Damage")
        )
        .map((s) => s.key),
    );

    const ranked = filteredListingRanks(check, baseItem, selected, poe2dbSnapshot);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBe(1);
    expect(ranked[0].penalties).toEqual(
      expect.arrayContaining([expect.stringContaining("score filter missed")]),
    );
  });
});
