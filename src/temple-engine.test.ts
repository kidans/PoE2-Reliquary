import { describe, expect, it } from "vitest";
import { PLACEABLE_TEMPLE_ROOMS, TEMPLE_ROOMS } from "./temple-data";
import {
  calculateDiminishingMultiplier,
  calculateDestabilizationBudget,
  calculateTempleEffectSummary,
  canDestabilizeCell,
  createTempleLayout,
  getTempleCell,
  getTempleModifierTargets,
  parseTempleLayout,
  recalculateTempleLayout,
  serializeTempleLayout,
  setTempleManualTier,
  setTempleCellLocked,
  setTempleRoom,
  simulateDestabilization,
  templeAtziriEndpointPosition,
  templeCellKey,
  templeGridPosition,
  templeSummary,
  validateTemplePlacement,
  type TempleCell,
  type TempleLayoutState,
} from "./temple-engine";

describe("temple data", () => {
  it("keeps placeable room definitions complete", () => {
    expect(PLACEABLE_TEMPLE_ROOMS.length).toBeGreaterThan(10);
    for (const roomId of PLACEABLE_TEMPLE_ROOMS) {
      const room = TEMPLE_ROOMS[roomId];
      expect(room.placeable).toBe(true);
      expect(room.name.length).toBeGreaterThan(1);
      expect(room.shortName.length).toBeGreaterThan(0);
    }
  });

  it("does not allow mechanic-created rooms in the palette", () => {
    expect(PLACEABLE_TEMPLE_ROOMS).toContain("architect");
    expect(PLACEABLE_TEMPLE_ROOMS).toContain("reward_room");
    expect(PLACEABLE_TEMPLE_ROOMS).not.toContain("transcendent_barrack");
    expect(PLACEABLE_TEMPLE_ROOMS).not.toContain("legion_barrack");
    expect(PLACEABLE_TEMPLE_ROOMS).not.toContain("sacrifice_room");
    expect(PLACEABLE_TEMPLE_ROOMS).not.toContain("atziri_chamber");
  });
});

describe("temple engine", () => {
  it("creates a 9x9 diamond grid with start tile and separate Atziri endpoint above top center", () => {
    const layout = createTempleLayout();
    expect(layout.cells).toHaveLength(81);

    const start = getTempleCell(layout, 4, 8);
    expect(start?.roomId).toBe("path");
    expect(start?.locked).toBe(true);
    expect(start?.reachable).toBe(true);

    const topCenter = getTempleCell(layout, 4, 0);
    expect(topCenter?.roomId).toBe("empty");
    expect(topCenter?.locked).toBe(false);

    expect(layout.atziriEndpoint.roomId).toBe("atziri_chamber");
    expect(layout.atziriEndpoint.x).toBe(4);
    expect(layout.atziriEndpoint.y).toBe(-1);
    expect(layout.atziriEndpoint.locked).toBe(true);
    expect(layout.atziriEndpoint.reachable).toBe(false);
  });

  it("maps coordinates into an isometric diamond instead of a square grid", () => {
    expect(templeGridPosition(4, 4)).toEqual({ left: 50, top: 50 });
    expect(templeGridPosition(0, 0).left).toBe(50);
    expect(templeGridPosition(0, 0).top).toBeLessThan(templeGridPosition(4, 4).top);
    expect(templeGridPosition(8, 8).left).toBe(50);
    expect(templeGridPosition(8, 8).top).toBeGreaterThan(templeGridPosition(4, 4).top);
    expect(templeAtziriEndpointPosition().top).toBeLessThan(templeGridPosition(4, 0).top);
  });

  it("places a room and recalculates summary state", () => {
    let layout = createTempleLayout();
    layout = setTempleRoom(layout, 4, 7, "guardhouse");

    expect(getTempleCell(layout, 4, 7)?.roomId).toBe("guardhouse");
    expect(getTempleCell(layout, 4, 7)?.reachable).toBe(true);
    expect(templeSummary(layout).placed).toBe(2);
  });

  it("connects Atziri's endpoint to any reachable room placed at 4,0", () => {
    let layout = createTempleLayout();
    for (let y = 7; y >= 0; y--) {
      layout = setTempleRoom(layout, 4, y, "path");
    }

    expect(getTempleCell(layout, 4, 0)?.roomId).toBe("path");
    expect(getTempleCell(layout, 4, 0)?.reachable).toBe(true);
    expect(layout.atziriEndpoint.reachable).toBe(true);
  });

  it("allows Architect and Reward Room to be placed anywhere because they are random inserts", () => {
    let layout = createTempleLayout();

    expect(validateTemplePlacement(layout, 0, 0, "architect").valid).toBe(true);
    layout = setTempleRoom(layout, 0, 0, "architect");
    expect(getTempleCell(layout, 0, 0)?.roomId).toBe("architect");

    expect(validateTemplePlacement(layout, 8, 0, "reward_room").valid).toBe(true);
    layout = setTempleRoom(layout, 8, 0, "reward_room");
    expect(getTempleCell(layout, 8, 0)?.roomId).toBe("reward_room");
  });

  it("rejects floating placement away from legal neighbors", () => {
    const layout = createTempleLayout();
    const result = validateTemplePlacement(layout, 0, 0, "guardhouse");

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("legal adjacent");
  });

  it("rejects rooms that are next to an illegal neighbor only", () => {
    let layout = createTempleLayout();
    layout = setTempleRoom(layout, 4, 7, "path");

    const result = validateTemplePlacement(layout, 5, 7, "dynamo");
    expect(result.valid).toBe(true);

    layout = setTempleRoom(layout, 5, 7, "dynamo");
    const illegalExtension = validateTemplePlacement(layout, 6, 7, "bronzeworks");
    expect(illegalExtension.valid).toBe(false);
    expect(illegalExtension.reason).toContain("Smithy");
  });

  it("keeps clearing from disconnecting reachable rooms", () => {
    let layout = createTempleLayout();
    layout = setTempleRoom(layout, 4, 7, "path");
    layout = setTempleRoom(layout, 4, 6, "guardhouse");

    const result = validateTemplePlacement(layout, 4, 7, "empty");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("disconnect");
  });

  it("protects the locked starting cell", () => {
    const layout = createTempleLayout();
    const next = setTempleRoom(layout, 4, 8, "guardhouse");

    expect(getTempleCell(next, 4, 8)?.roomId).toBe("path");
  });

  it("supports manual tier override", () => {
    let layout = createTempleLayout();
    layout = setTempleRoom(layout, 4, 7, "guardhouse");
    layout = setTempleManualTier(layout, 4, 7, 3);

    expect(getTempleCell(layout, 4, 7)?.tier).toBe(3);
  });

  it("blocks a second Garrison chain through one Synthflesh Lab", () => {
    let layout = createTempleLayout();
    layout = setTempleRoom(layout, 4, 7, "path");
    layout = setTempleRoom(layout, 4, 6, "path");
    layout = setTempleRoom(layout, 4, 5, "synthflesh_lab");
    layout = setTempleRoom(layout, 3, 5, "guardhouse");

    const result = validateTemplePlacement(layout, 5, 5, "guardhouse");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Synthflesh Lab already has a Garrison");
  });

  it("keeps Synthflesh-Commander chain validation asymmetric", () => {
    let allowed = createTempleLayout();
    allowed = setTempleRoom(allowed, 4, 7, "path");
    allowed = setTempleRoom(allowed, 4, 6, "synthflesh_lab");
    allowed = setTempleRoom(allowed, 4, 5, "guardhouse");

    expect(validateTemplePlacement(allowed, 4, 4, "commanders_chamber").valid).toBe(true);

    let blocked = createTempleLayout();
    blocked = setTempleRoom(blocked, 4, 7, "path");
    blocked = setTempleRoom(blocked, 4, 6, "commanders_chamber");
    blocked = setTempleRoom(blocked, 4, 5, "guardhouse");

    const result = validateTemplePlacement(blocked, 4, 4, "synthflesh_lab");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("linear chain with Commander");
  });

  it("upgrades Garrison from Commander and Armoury adjacency", () => {
    let layout = createTempleLayout();
    layout = setTempleRoom(layout, 4, 7, "guardhouse");
    layout = setTempleRoom(layout, 3, 7, "commanders_chamber");

    expect(getTempleCell(layout, 4, 7)?.tier).toBe(2);

    layout = setTempleRoom(layout, 5, 7, "armoury");
    expect(getTempleCell(layout, 4, 7)?.tier).toBe(3);
  });

  it("upgrades Commander by adjacent Garrison-family rooms", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "commanders_chamber"],
      [3, 7, "guardhouse"],
      [5, 7, "guardhouse"],
      [4, 6, "transcendent_barrack"],
    ]));

    expect(getTempleCell(layout, 4, 7)?.tier).toBe(3);
  });

  it("transforms Garrison variants before resolving upgrade tiers", () => {
    const transcendent = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "synthflesh_lab"],
      [3, 6, "guardhouse"],
    ]));
    expect(getTempleCell(transcendent, 3, 6)?.roomId).toBe("transcendent_barrack");

    const legion = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "spymasters_study"],
      [3, 6, "guardhouse"],
    ]));
    expect(getTempleCell(legion, 3, 6)?.roomId).toBe("legion_barrack");
  });

  it("resolves direct non-energy upgrade paths from the reference rules", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [1, 1, "bronzeworks"],
      [1, 2, "workshop"],
      [3, 1, "legion_barrack"],
      [3, 2, "armoury"],
      [4, 1, "spymasters_study"],
      [6, 1, "surgeons_ward"],
      [6, 2, "synthflesh_lab"],
      [7, 1, "synthflesh_lab"],
    ]));

    expect(getTempleCell(layout, 1, 1)?.tier).toBe(2);
    expect(getTempleCell(layout, 3, 1)?.tier).toBe(3);
    expect(getTempleCell(layout, 6, 1)?.tier).toBe(3);
  });

  it("does not upgrade Thaumaturge from non-sacrifice neighbors", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [2, 2, "thaumaturges_laboratory"],
      [2, 3, "chamber_of_souls"],
      [3, 2, "crimson_hall"],
    ]));

    expect(getTempleCell(layout, 2, 2)?.tier).toBe(1);
  });

  it("round-trips serialized layouts and rejects corrupt data", () => {
    let layout = createTempleLayout();
    layout = setTempleRoom(layout, 4, 7, "guardhouse");
    const parsed = parseTempleLayout(serializeTempleLayout(layout));

    expect(parsed).not.toBeNull();
    expect(getTempleCell(parsed!, 4, 7)?.roomId).toBe("guardhouse");
    expect(getTempleCell(parsed!, 4, 0)?.roomId).toBe("empty");
    expect(parsed!.atziriEndpoint.roomId).toBe("atziri_chamber");
    expect(parseTempleLayout("{not-json")).toBeNull();
  });

  it("powers eligible rooms in Generator range and upgrades them by one tier", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "dynamo"],
      [4, 6, "path"],
      [4, 5, "bronzeworks"],
    ]));

    expect(getTempleCell(layout, 4, 5)?.inGeneratorRange).toBe(true);
    expect(getTempleCell(layout, 4, 5)?.tier).toBe(2);
  });

  it("stacks two Generator sources for rooms that can receive two power levels", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "dynamo"],
      [4, 6, "path"],
      [5, 6, "dynamo"],
      [4, 5, "workshop"],
    ]));

    expect(getTempleCell(layout, 4, 5)?.generatorPower).toBe(2);
    expect(getTempleCell(layout, 4, 5)?.tier).toBe(3);
  });

  it("combines adjacency upgrade and Generator power for eligible rooms", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "dynamo"],
      [4, 6, "path"],
      [4, 5, "bronzeworks"],
      [3, 5, "workshop"],
      [5, 6, "synthflesh_lab"],
      [6, 6, "surgeons_ward"],
    ]));

    expect(getTempleCell(layout, 4, 5)?.tier).toBe(3);
    expect(getTempleCell(layout, 5, 6)?.tier).toBe(3);
  });

  it("stops Generator power propagation at consuming rooms", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "dynamo"],
      [4, 6, "path"],
      [4, 5, "bronzeworks"],
      [4, 4, "path"],
      [4, 3, "workshop"],
    ]));

    expect(getTempleCell(layout, 4, 5)?.inGeneratorRange).toBe(true);
    expect(getTempleCell(layout, 4, 3)?.inGeneratorRange).toBe(false);
  });

  it("exposes modifier target groups for effect source rooms", () => {
    expect(getTempleModifierTargets("spymasters_study")).toContain("dynamo");
    expect(getTempleModifierTargets("workshop")).toContain("armoury");
    expect(getTempleModifierTargets("thaumaturges_laboratory")).toContain("crimson_hall");
    expect(getTempleModifierTargets("armoury")).toEqual([]);
  });

  it("applies Spymaster only to its targeted room effects", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "path"],
      [3, 6, "spymasters_study"],
      [4, 5, "chamber_of_souls"],
      [5, 6, "commanders_chamber"],
    ]));
    const summary = calculateTempleEffectSummary(layout);

    expect(summary.spymasterModifier).toBe(7.5);
    expect(findEffect(summary.itemEffects, "Item Rarity")?.finalValue).toBe(16);
    expect(findEffect(summary.monsterEffects, "Rare Monster")?.finalValue).toBe(15);
  });

  it("applies Golem Works only to its targeted room effects", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "path"],
      [3, 6, "workshop"],
      [4, 5, "armoury"],
      [5, 6, "chamber_of_souls"],
    ]));
    const summary = calculateTempleEffectSummary(layout);

    expect(summary.golemWorksModifier).toBe(7.5);
    expect(findEffect(summary.monsterEffects, "Humanoid Monster")?.finalValue).toBe(16);
    expect(findEffect(summary.itemEffects, "Item Rarity")?.finalValue).toBe(15);
  });

  it("applies Thaumaturge only to its targeted room effects", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "path"],
      [3, 6, "thaumaturges_laboratory"],
      [4, 5, "crimson_hall"],
      [5, 6, "armoury"],
    ]));
    const summary = calculateTempleEffectSummary(layout);

    expect(summary.thaumaturgeModifier).toBe(7.5);
    expect(findEffect(summary.monsterEffects, "Rare Monsters")?.finalValue).toBe(16);
    expect(findEffect(summary.monsterEffects, "Humanoid Monster")?.finalValue).toBe(15);
  });

  it("uses full value for the first three duplicate room effects", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "path"],
      [3, 7, "armoury"],
      [5, 7, "armoury"],
      [4, 5, "armoury"],
    ]));
    const summary = calculateTempleEffectSummary(layout);
    const effect = findEffect(summary.monsterEffects, "Humanoid Monster");

    expect(effect?.baseValue).toBe(45);
    expect(effect?.finalValue).toBe(45);
    expect(effect?.hasDiminishingReturns).toBe(false);
  });

  it("applies 90% and 81% diminishing returns to the fourth and fifth duplicate effects", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "path"],
      [3, 7, "armoury"],
      [5, 7, "armoury"],
      [3, 6, "armoury"],
      [5, 6, "armoury"],
      [4, 5, "armoury"],
    ]));
    const summary = calculateTempleEffectSummary(layout);
    const effect = findEffect(summary.monsterEffects, "Humanoid Monster");

    expect(calculateDiminishingMultiplier(1)).toBe(1);
    expect(calculateDiminishingMultiplier(4)).toBe(0.9);
    expect(calculateDiminishingMultiplier(5)).toBe(0.81);
    expect(effect?.baseValue).toBe(75);
    expect(effect?.finalValue).toBe(70);
    expect(effect?.hasDiminishingReturns).toBe(true);
  });

  it("keeps buffing rooms exempt from diminishing return output effects", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "path"],
      [3, 7, "workshop"],
      [5, 7, "workshop"],
      [3, 6, "workshop"],
      [5, 6, "workshop"],
      [4, 5, "workshop"],
    ]));
    const summary = calculateTempleEffectSummary(layout);

    expect(summary.golemWorksModifier).toBe(37.5);
    expect(summary.monsterEffects).toEqual([]);
    expect(summary.itemEffects).toEqual([]);
    expect(summary.chestEffects).toEqual([]);
  });

  it("ignores unreachable rooms when calculating effect summaries", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [0, 0, "armoury"],
    ]));
    const summary = calculateTempleEffectSummary(layout);

    expect(summary.monsterEffects).toEqual([]);
    expect(summary.modifierSources).toEqual([]);
  });

  it("calculates destabilization budget from eligible room count and defeated bonuses", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "armoury"],
      [3, 6, "architect"],
      [5, 6, "reward_room"],
    ]));

    expect(calculateDestabilizationBudget(layout, { architectDefeated: false, atziriDefeated: false }))
      .toEqual({ roomCount: 2, budget: 1 });
    expect(calculateDestabilizationBudget(layout, { architectDefeated: true, atziriDefeated: true }))
      .toEqual({ roomCount: 2, budget: 3 });
  });

  it("keeps seeded destabilization deterministic", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [3, 7, "armoury"],
      [5, 7, "commanders_chamber"],
      [4, 6, "sealed_vault"],
    ]));
    const first = simulateDestabilization(layout, {
      architectDefeated: true,
      atziriDefeated: true,
      seed: "same-seed",
    });
    const second = simulateDestabilization(layout, {
      architectDefeated: true,
      atziriDefeated: true,
      seed: "same-seed",
    });

    expect(first.attempts).toEqual(second.attempts);
    expect(first.removedKeys).toEqual(second.removedKeys);
  });

  it("does not destabilize bridge rooms that would disconnect reachable rooms", () => {
    const layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "armoury"],
    ]));

    expect(canDestabilizeCell(layout, templeCellKey(4, 7))).toBe(false);
    expect(canDestabilizeCell(layout, templeCellKey(4, 6))).toBe(true);
  });

  it("lets locked rooms consume destabilization attempts without being removed", () => {
    let layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "armoury"],
    ]));
    layout = setTempleCellLocked(layout, 4, 6, true);
    const result = simulateDestabilization(layout, {
      architectDefeated: false,
      atziriDefeated: false,
      seed: "locked-leaf",
    });

    expect(result.attempts).toEqual([
      {
        attemptIndex: 1,
        targetKey: "4,6",
        roomId: "armoury",
        result: "locked",
        reason: "locked",
      },
    ]);
    expect(getTempleCell(result.after, 4, 6)?.roomId).toBe("armoury");
    expect(getTempleCell(result.after, 4, 6)?.locked).toBe(true);
  });

  it("records skipped destabilization attempts when no valid targets remain", () => {
    const layout = createTempleLayout();
    const result = simulateDestabilization(layout, {
      architectDefeated: false,
      atziriDefeated: false,
      seed: "empty",
    });

    expect(result.budget).toBe(1);
    expect(result.attempts[0]).toMatchObject({
      targetKey: null,
      roomId: null,
      result: "skipped",
      reason: "no-targets",
    });
    expect(result.after.cells).toEqual(layout.cells);
  });

  it("restores locked cells after serialize and parse", () => {
    let layout = recalculateTempleLayout(withRooms([
      [4, 8, "path"],
      [4, 7, "path"],
      [4, 6, "armoury"],
    ]));
    layout = setTempleCellLocked(layout, 4, 6, true);
    const parsed = parseTempleLayout(serializeTempleLayout(layout));

    expect(getTempleCell(parsed!, 4, 6)?.locked).toBe(true);
  });
});

function withRooms(
  entries: Array<[number, number, TempleCell["roomId"]]>,
): TempleLayoutState {
  const rooms = new Map(entries.map(([x, y, roomId]) => [`${x},${y}`, roomId]));
  const layout = createTempleLayout();
  return {
    ...layout,
    cells: layout.cells.map((cell) => {
      const roomId = rooms.get(`${cell.x},${cell.y}`) ?? "empty";
      return {
        ...cell,
        roomId,
        tier: roomId === "empty" ? 0 : 1,
        manualTier: null,
        generatorPower: 0,
        locked: cell.x === 4 && cell.y === 8,
      };
    }),
  };
}

function findEffect<T extends { name: string }>(effects: T[], text: string) {
  return effects.find((effect) => effect.name.includes(text));
}
