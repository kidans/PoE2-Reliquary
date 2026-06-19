export type TempleRoomId =
  | "empty"
  | "path"
  | "guardhouse"
  | "transcendent_barrack"
  | "legion_barrack"
  | "commanders_chamber"
  | "armoury"
  | "spymasters_study"
  | "bronzeworks"
  | "dynamo"
  | "workshop"
  | "synthflesh_lab"
  | "surgeons_ward"
  | "chamber_of_souls"
  | "thaumaturges_laboratory"
  | "crimson_hall"
  | "altar_of_sacrifice"
  | "reward_room"
  | "sealed_vault"
  | "architect"
  | "atziri_chamber"
  | "sacrifice_room";

export type TempleTier = 0 | 1 | 2 | 3;

export type TempleRoomCategory =
  | "fixed"
  | "path"
  | "combat"
  | "crafting"
  | "reward"
  | "special";

export type TempleUpgradeRule =
  | {
      type: "adjacent";
      rooms: TempleRoomId[];
      count?: number;
      requireAll?: boolean;
      minTier?: TempleTier;
    }
  | {
      type: "manual";
      description: string;
    };

export type TempleRoomDefinition = {
  id: TempleRoomId;
  name: string;
  shortName: string;
  color: string;
  category: TempleRoomCategory;
  icon: string | null;
  placeable: boolean;
  description: string;
  tierEffects: Partial<Record<TempleTier, string[]>>;
  upgrades: Partial<Record<2 | 3, TempleUpgradeRule>>;
  upgradeInfo?: string;
};

export type TempleModifierSourceId = "spymasters_study" | "workshop" | "thaumaturges_laboratory";

const ICON_ROOT = "/temple/icons";

export const TEMPLE_ROOMS: Record<TempleRoomId, TempleRoomDefinition> = {
  empty: {
    id: "empty",
    name: "Empty",
    shortName: "",
    color: "#101619",
    category: "fixed",
    icon: null,
    placeable: false,
    description: "An unassigned temple tile.",
    tierEffects: { 0: [] },
    upgrades: {},
  },
  path: {
    id: "path",
    name: "Path",
    shortName: "P",
    color: "#344044",
    category: "path",
    icon: null,
    placeable: true,
    description: "A connector tile used to keep rooms reachable.",
    tierEffects: { 1: [] },
    upgrades: {},
  },
  guardhouse: {
    id: "guardhouse",
    name: "Garrison",
    shortName: "G",
    color: "#f28c8c",
    category: "combat",
    icon: `${ICON_ROOT}/IconGarrison.webp`,
    placeable: true,
    description: "Increases monster packs and can branch into Barrack variants.",
    tierEffects: {
      1: ["10% increased number of Monster Packs"],
      2: ["15% increased number of Monster Packs"],
      3: ["20% increased number of Monster Packs"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["commanders_chamber", "armoury"], count: 1 },
      3: { type: "adjacent", rooms: ["commanders_chamber", "armoury"], requireAll: true },
    },
  },
  transcendent_barrack: {
    id: "transcendent_barrack",
    name: "Transcendent Barrack",
    shortName: "TB",
    color: "#9b59b6",
    category: "combat",
    icon: `${ICON_ROOT}/IconTranscendentBarracks.webp`,
    placeable: false,
    description: "Variant barrack created by Synthflesh adjacency.",
    tierEffects: {
      1: ["20% increased number of Magic Monsters"],
      2: ["40% increased number of Magic Monsters"],
      3: ["60% increased number of Magic Monsters"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["synthflesh_lab"], count: 1 },
      3: { type: "manual", description: "Needs Synthflesh Lab plus Generator power; wired in the Energy System pass." },
    },
    upgradeInfo: "Created from Garrison beside Synthflesh Lab. Generator power can push it further.",
  },
  legion_barrack: {
    id: "legion_barrack",
    name: "Legion Barrack",
    shortName: "LB",
    color: "#c0392b",
    category: "combat",
    icon: `${ICON_ROOT}/IconViperLegionBarracks.webp`,
    placeable: false,
    description: "Variant barrack created by Spymaster adjacency.",
    tierEffects: {
      1: ["20% increased number of Rare Monsters"],
      2: ["40% increased number of Rare Monsters"],
      3: ["60% increased number of Rare Monsters"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["armoury", "spymasters_study"], count: 1 },
      3: { type: "adjacent", rooms: ["armoury", "spymasters_study"], requireAll: true },
    },
    upgradeInfo: "Created from Garrison beside Spymaster. Armoury + Spymaster adjacency upgrades it.",
  },
  commanders_chamber: {
    id: "commanders_chamber",
    name: "Commander",
    shortName: "C",
    color: "#f5a36f",
    category: "combat",
    icon: `${ICON_ROOT}/IconCommander.webp`,
    placeable: true,
    description: "Increases rare monster effectiveness.",
    tierEffects: {
      1: ["15% increased Rare Monster effectiveness"],
      2: ["30% increased Rare Monster effectiveness"],
      3: ["60% increased Rare Monster effectiveness"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["guardhouse", "transcendent_barrack"], count: 2 },
      3: { type: "adjacent", rooms: ["guardhouse", "transcendent_barrack"], count: 3 },
    },
  },
  armoury: {
    id: "armoury",
    name: "Armoury",
    shortName: "A",
    color: "#f5d36f",
    category: "crafting",
    icon: `${ICON_ROOT}/IconArmoury.webp`,
    placeable: true,
    description: "Increases humanoid monster effectiveness.",
    tierEffects: {
      1: ["15% increased Humanoid Monster effectiveness"],
      2: ["30% increased Humanoid Monster effectiveness"],
      3: ["60% increased Humanoid Monster effectiveness"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["bronzeworks", "chamber_of_souls"], count: 1 },
      3: { type: "adjacent", rooms: ["bronzeworks", "chamber_of_souls"], requireAll: true },
    },
  },
  spymasters_study: {
    id: "spymasters_study",
    name: "Spymaster",
    shortName: "Spy",
    color: "#6fcf6f",
    category: "special",
    icon: `${ICON_ROOT}/IconViperSpymaster.webp`,
    placeable: true,
    description: "Increases selected temple modifier effects.",
    tierEffects: {
      1: ["7.5% increased effect of Generator / Synthflesh / Surgeon / Transcendent / Alchemy mods"],
      2: ["15% increased effect of Generator / Synthflesh / Surgeon / Transcendent / Alchemy mods"],
      3: ["30% increased effect of Generator / Synthflesh / Surgeon / Transcendent / Alchemy mods"],
    },
    upgrades: {
      2: { type: "manual", description: "Use medallion/assassination planning manually in v1." },
      3: { type: "manual", description: "Use medallion/assassination planning manually in v1." },
    },
  },
  bronzeworks: {
    id: "bronzeworks",
    name: "Smithy",
    shortName: "S",
    color: "#fc8c6f",
    category: "crafting",
    icon: `${ICON_ROOT}/IconSmithy.webp`,
    placeable: true,
    description: "Improves chest item rarity and upgrades Armoury.",
    tierEffects: {
      1: ["15% increased Chest Item Rarity"],
      2: ["30% increased Chest Item Rarity"],
      3: ["60% increased Chest Item Rarity", "Vaal Infuser"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["workshop"], count: 1 },
      3: { type: "manual", description: "Needs Golem Works plus Generator power; wired in the Energy System pass." },
    },
    upgradeInfo: "Golem Works upgrades it; Generator power can push it further.",
  },
  dynamo: {
    id: "dynamo",
    name: "Generator",
    shortName: "D",
    color: "#8fcaf2",
    category: "special",
    icon: `${ICON_ROOT}/IconGenerator.webp`,
    placeable: true,
    description: "Powers eligible nearby rooms.",
    tierEffects: {
      1: ["Powers rooms within 3 tiles"],
      2: ["Powers rooms within 4 tiles"],
      3: ["Powers rooms within 5 tiles", "Adds Corrupted Abomination"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["thaumaturges_laboratory", "altar_of_sacrifice"], count: 1 },
      3: { type: "adjacent", rooms: ["thaumaturges_laboratory", "altar_of_sacrifice"], requireAll: true },
    },
  },
  workshop: {
    id: "workshop",
    name: "Golem Works",
    shortName: "GW",
    color: "#8cf2cf",
    category: "special",
    icon: `${ICON_ROOT}/IconGolemWorks.webp`,
    placeable: true,
    description: "Increases selected temple modifier effects and improves Smithy.",
    tierEffects: {
      1: ["7.5% increased effect of combat and crafting temple mods"],
      2: ["15% increased effect of combat and crafting temple mods"],
      3: ["30% increased effect of combat and crafting temple mods", "Adds High Priest"],
    },
    upgrades: {},
    upgradeInfo: "Generator power can raise this room's effective tier.",
  },
  synthflesh_lab: {
    id: "synthflesh_lab",
    name: "Synthflesh Lab",
    shortName: "SL",
    color: "#cf6fcf",
    category: "special",
    icon: `${ICON_ROOT}/IconSynthflesh.webp`,
    placeable: true,
    description: "Increases experience gain and creates Transcendent Barracks.",
    tierEffects: {
      1: ["10% increased Experience gain"],
      2: ["20% increased Experience gain"],
      3: ["40% increased Experience gain"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["surgeons_ward"], count: 1 },
      3: { type: "manual", description: "Needs Flesh Surgeon plus Generator power; wired in the Energy System pass." },
    },
  },
  surgeons_ward: {
    id: "surgeons_ward",
    name: "Flesh Surgeon",
    shortName: "FS",
    color: "#cf8c6f",
    category: "combat",
    icon: `${ICON_ROOT}/IconFleshSurgeon.webp`,
    placeable: true,
    description: "Increases unique monster effectiveness.",
    tierEffects: {
      1: ["10% increased Unique Monster effectiveness"],
      2: ["20% increased Unique Monster effectiveness"],
      3: ["40% increased Unique Monster effectiveness", "Limb Modification"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["synthflesh_lab"], count: 1 },
      3: { type: "adjacent", rooms: ["synthflesh_lab"], count: 1, minTier: 2 },
    },
  },
  chamber_of_souls: {
    id: "chamber_of_souls",
    name: "Alchemy Lab",
    shortName: "AL",
    color: "#f2cf6f",
    category: "reward",
    icon: `${ICON_ROOT}/IconAlchemyLab.webp`,
    placeable: true,
    description: "Improves monster item rarity and gold rewards.",
    tierEffects: {
      1: ["15% increased Item Rarity from Monsters"],
      2: ["30% increased Item Rarity from Monsters", "25% increased Gold"],
      3: ["60% increased Item Rarity from Monsters", "50% increased Gold", "Core Destabiliser"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["thaumaturges_laboratory"], count: 1 },
      3: { type: "adjacent", rooms: ["thaumaturges_laboratory"], count: 2 },
    },
  },
  thaumaturges_laboratory: {
    id: "thaumaturges_laboratory",
    name: "Thaumaturge's",
    shortName: "TH",
    color: "#6ff2cf",
    category: "special",
    icon: `${ICON_ROOT}/IconThaumaturge.webp`,
    placeable: true,
    description: "Increases selected magic-room temple modifier effects.",
    tierEffects: {
      1: ["7.5% increased effect of Corruption / Vault / Sacrifice mods"],
      2: ["15% increased effect of Corruption / Vault / Sacrifice mods"],
      3: ["30% increased effect of Corruption / Vault / Sacrifice mods", "Crystallised Corruption"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["altar_of_sacrifice"], count: 1 },
      3: { type: "adjacent", rooms: ["altar_of_sacrifice"], count: 2 },
    },
  },
  crimson_hall: {
    id: "crimson_hall",
    name: "Corruption Chamber",
    shortName: "CC",
    color: "#f26fcf",
    category: "reward",
    icon: `${ICON_ROOT}/IconCorruption.webp`,
    placeable: true,
    description: "Adds extra rare monster modifier chances.",
    tierEffects: {
      1: ["15% chance for Rare Monsters to have +1 Modifier"],
      2: ["30% chance for Rare Monsters to have +1 Modifier"],
      3: ["60% chance for Rare Monsters to have +1 Modifier", "Architect's Orb"],
    },
    upgrades: {
      2: { type: "adjacent", rooms: ["altar_of_sacrifice"], count: 1 },
      3: { type: "adjacent", rooms: ["altar_of_sacrifice"], count: 2 },
    },
  },
  altar_of_sacrifice: {
    id: "altar_of_sacrifice",
    name: "Sacrificial Chamber",
    shortName: "SC",
    color: "#8b0000",
    category: "special",
    icon: `${ICON_ROOT}/IconSacrificialChamber.webp`,
    placeable: true,
    description: "Sacrifice mechanics are tracked manually in the MVP.",
    tierEffects: {
      1: ["15% increased Rare Chests", "Contains Unique Item"],
      2: ["30% increased Rare Chests", "High chance for Sacrifice Room card"],
      3: ["60% increased Rare Chests", "Vaal Cultivation Orb"],
    },
    upgrades: {
      2: { type: "manual", description: "Sacrifice a valid dead-end room manually in v1." },
      3: { type: "manual", description: "Sacrifice a valid dead-end room manually in v1." },
    },
  },
  reward_room: {
    id: "reward_room",
    name: "Reward Room",
    shortName: "R",
    color: "#ffffff",
    category: "reward",
    icon: `${ICON_ROOT}/IconRewardCurrency.webp`,
    placeable: true,
    description: "Generic reward room for currency, gems, and other special rewards.",
    tierEffects: {
      1: ["Contains special rewards"],
    },
    upgrades: {},
  },
  sealed_vault: {
    id: "sealed_vault",
    name: "Sealed Vault",
    shortName: "SV",
    color: "#7a6c3a",
    category: "reward",
    icon: `${ICON_ROOT}/IconVault.webp`,
    placeable: true,
    description: "Improves item rarity.",
    tierEffects: {
      1: ["25% increased Rarity of Items"],
    },
    upgrades: {},
  },
  architect: {
    id: "architect",
    name: "Architect",
    shortName: "AR",
    color: "#e74c3c",
    category: "reward",
    icon: `${ICON_ROOT}/IconArchitect.webp`,
    placeable: true,
    description: "Randomly inserted architect encounter room.",
    tierEffects: {
      1: ["Architect encounter"],
    },
    upgrades: {},
  },
  atziri_chamber: {
    id: "atziri_chamber",
    name: "Atziri's Chamber",
    shortName: "AZ",
    color: "#e74c3c",
    category: "fixed",
    icon: `${ICON_ROOT}/IconArchitect.webp`,
    placeable: false,
    description: "Fixed final boss endpoint above the temple grid.",
    tierEffects: {
      1: ["Atziri encounter"],
    },
    upgrades: {},
  },
  sacrifice_room: {
    id: "sacrifice_room",
    name: "Sacrificed Room",
    shortName: "SR",
    color: "#2d1f1f",
    category: "fixed",
    icon: `${ICON_ROOT}/IconSacrificeRoom.webp`,
    placeable: false,
    description: "A removed room left behind by sacrifice mechanics.",
    tierEffects: {
      1: ["Room has been sacrificed"],
    },
    upgrades: {},
  },
};

export const PLACEABLE_TEMPLE_ROOMS: TempleRoomId[] = [
  "path",
  "guardhouse",
  "commanders_chamber",
  "armoury",
  "spymasters_study",
  "bronzeworks",
  "dynamo",
  "workshop",
  "synthflesh_lab",
  "surgeons_ward",
  "chamber_of_souls",
  "thaumaturges_laboratory",
  "crimson_hall",
  "altar_of_sacrifice",
  "reward_room",
  "sealed_vault",
  "architect",
];

export const TEMPLE_MODIFIER_TARGETS: Record<TempleModifierSourceId, TempleRoomId[]> = {
  spymasters_study: [
    "dynamo",
    "synthflesh_lab",
    "surgeons_ward",
    "transcendent_barrack",
    "chamber_of_souls",
  ],
  workshop: [
    "guardhouse",
    "transcendent_barrack",
    "legion_barrack",
    "commanders_chamber",
    "armoury",
    "bronzeworks",
  ],
  thaumaturges_laboratory: [
    "crimson_hall",
    "sealed_vault",
    "altar_of_sacrifice",
  ],
};

export const TEMPLE_ADJACENCY: Partial<Record<TempleRoomId, TempleRoomId[]>> = {
  path: [
    "path",
    "guardhouse",
    "legion_barrack",
    "transcendent_barrack",
    "commanders_chamber",
    "armoury",
    "bronzeworks",
    "dynamo",
    "spymasters_study",
    "synthflesh_lab",
    "surgeons_ward",
    "workshop",
    "chamber_of_souls",
    "thaumaturges_laboratory",
    "crimson_hall",
    "altar_of_sacrifice",
    "sealed_vault",
  ],
  guardhouse: ["path", "commanders_chamber", "armoury", "spymasters_study", "synthflesh_lab"],
  legion_barrack: ["path", "commanders_chamber", "armoury", "spymasters_study"],
  transcendent_barrack: ["path", "commanders_chamber", "armoury", "synthflesh_lab"],
  commanders_chamber: ["path", "guardhouse", "transcendent_barrack", "legion_barrack"],
  spymasters_study: ["path", "guardhouse", "legion_barrack"],
  armoury: ["path", "guardhouse", "legion_barrack", "transcendent_barrack", "bronzeworks", "chamber_of_souls"],
  bronzeworks: ["path", "armoury", "workshop"],
  workshop: ["path", "bronzeworks"],
  dynamo: ["path", "thaumaturges_laboratory", "altar_of_sacrifice"],
  synthflesh_lab: ["path", "guardhouse", "transcendent_barrack", "surgeons_ward"],
  surgeons_ward: ["path", "synthflesh_lab"],
  chamber_of_souls: ["path", "armoury", "thaumaturges_laboratory"],
  thaumaturges_laboratory: ["path", "chamber_of_souls", "altar_of_sacrifice", "crimson_hall", "dynamo"],
  crimson_hall: ["path", "thaumaturges_laboratory", "altar_of_sacrifice"],
  altar_of_sacrifice: ["path", "thaumaturges_laboratory", "crimson_hall", "dynamo"],
  sealed_vault: ["path"],
  architect: [
    "path",
    "guardhouse",
    "legion_barrack",
    "transcendent_barrack",
    "commanders_chamber",
    "armoury",
    "bronzeworks",
    "dynamo",
    "spymasters_study",
    "synthflesh_lab",
    "surgeons_ward",
    "workshop",
    "chamber_of_souls",
    "thaumaturges_laboratory",
    "crimson_hall",
    "altar_of_sacrifice",
    "sealed_vault",
  ],
  atziri_chamber: [
    "path",
    "guardhouse",
    "legion_barrack",
    "transcendent_barrack",
    "commanders_chamber",
    "armoury",
    "bronzeworks",
    "dynamo",
    "spymasters_study",
    "synthflesh_lab",
    "surgeons_ward",
    "workshop",
    "chamber_of_souls",
    "thaumaturges_laboratory",
    "crimson_hall",
    "altar_of_sacrifice",
    "sealed_vault",
    "architect",
    "reward_room",
  ],
};

export const TEMPLE_PLACEMENT_ADJACENCY: Partial<Record<TempleRoomId, TempleRoomId[]>> = {
  path: ["path", "atziri_chamber"],
  guardhouse: ["path", "commanders_chamber", "armoury", "synthflesh_lab", "spymasters_study"],
  legion_barrack: ["path", "commanders_chamber", "armoury", "spymasters_study"],
  transcendent_barrack: ["path", "commanders_chamber", "armoury", "synthflesh_lab"],
  commanders_chamber: ["path", "guardhouse", "transcendent_barrack"],
  spymasters_study: ["path", "guardhouse", "legion_barrack"],
  armoury: ["path", "bronzeworks", "chamber_of_souls", "guardhouse", "transcendent_barrack", "legion_barrack"],
  bronzeworks: ["path", "workshop", "armoury"],
  workshop: ["path", "bronzeworks"],
  dynamo: ["path"],
  synthflesh_lab: ["path", "surgeons_ward", "guardhouse", "transcendent_barrack"],
  surgeons_ward: ["path", "synthflesh_lab"],
  chamber_of_souls: ["path", "thaumaturges_laboratory", "armoury"],
  thaumaturges_laboratory: ["path", "altar_of_sacrifice", "dynamo", "chamber_of_souls", "crimson_hall"],
  crimson_hall: ["path", "thaumaturges_laboratory", "altar_of_sacrifice"],
  altar_of_sacrifice: ["path", "thaumaturges_laboratory", "crimson_hall", "dynamo"],
  reward_room: [
    "path",
    "guardhouse",
    "legion_barrack",
    "transcendent_barrack",
    "commanders_chamber",
    "armoury",
    "bronzeworks",
    "dynamo",
    "spymasters_study",
    "synthflesh_lab",
    "surgeons_ward",
    "workshop",
    "chamber_of_souls",
    "thaumaturges_laboratory",
    "crimson_hall",
    "altar_of_sacrifice",
    "sealed_vault",
    "architect",
    "atziri_chamber",
  ],
  sealed_vault: ["path"],
  architect: [],
  atziri_chamber: [],
};
