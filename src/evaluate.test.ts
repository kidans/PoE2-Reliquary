import { describe, expect, it } from "vitest";
import {
  activeFilterSignature,
  activePriceFiltersForSelection,
  filteredListings,
  itemSpecs,
  listingMatchesSelectedPriceOption,
  profileSpecKeySet,
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

  it("locally narrows listings by selected item specs", () => {
    const specs = itemSpecs(baseItem);
    const selected = new Set([
      specs.find((spec) => spec.kind === "item_level")?.key,
      specs.find((spec) => spec.label === "+5 to Level of all Attack Skills")?.key,
    ].filter((key): key is string => Boolean(key)));

    expect(filteredListings(priceCheck(), baseItem, selected)).toHaveLength(1);
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
