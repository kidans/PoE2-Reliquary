import guide from "../src/campaign-guide.json" with { type: "json" };
import { writeFileSync } from "fs";

const REWARD_RULES = [
  { act: 1, zone: "Clearfell", match: /Kill Beira/, value: "+10% Cold Res", type: "reward", group: "res" },
  { act: 1, zone: "Freythorn", match: /King in the Mists/, value: "+30 Spirit", type: "reward", group: "spirit" },
  { act: 1, zone: "Ogham Village", match: /Salvage Bench/, value: "Salvage Bench", type: "choice", group: "choice" },
  { act: 1, zone: "Hunting Grounds", match: /Crowbell/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 1, zone: "Ogham Farmlands", match: /Una's Lute/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 1, zone: "Ogham Manor", match: /Candlemass/, value: "+20 Max Life", type: "reward", group: "life" },

  { act: 2, zone: "Keth", match: /Kabala, Constrictor/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 2, zone: "Deshar", match: /Fallen Dekhara/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 2, zone: "The Spires of Deshar", match: /Sisters of Garukhan/, value: "+10% Lightning Res", type: "reward", group: "res" },
  { act: 2, zone: "Buried Shrines", match: /Choose Offering/, value: "Resist Ring Choice", type: "choice", group: "choice" },
  { act: 2, zone: "Valley of the Titans", match: /Random Unique/, value: "Free Unique", type: "choice", group: "choice" },
  { act: 2, zone: "The Lost City", match: /Golden Tomb/, value: "Spirit Gem Lv7", type: "choice", group: "choice" },

  { act: 3, zone: "Jungle Ruins", match: /Mighty Silverfist/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 3, zone: "Aggorat", match: /Sacrificial Heart/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 3, zone: "Jiquani's Machinarium", match: /Blackjaw/, value: "+10% Fire Res", type: "reward", group: "res" },
  { act: 3, zone: "Azak Bog", match: /Ignagduk/, value: "+30 Spirit", type: "reward", group: "spirit" },
  { act: 3, zone: "Azak Bog", match: /Frozen Charm/, value: "Charm Choice", type: "choice", group: "choice" },
  { act: 3, zone: "Ziggurat Encampment", match: /PERMANENT CHOICE/, value: "Permanent Choice", type: "choice", group: "choice" },
  { act: 3, zone: "Ziggurat Encampment", match: /Verisium Runeforging/, value: "Unique Runeforging", type: "choice", group: "choice" },

  { act: 4, zone: "Abandoned Prison FRAG/MATIKI?", match: /Forael/, value: "Flask Choice", type: "choice", group: "choice" },
  { act: 4, zone: "Eye of Hinekora", match: /Silent Hall altar/, value: "+5% Max Mana", type: "reward", group: "mana" },
  { act: 4, zone: "Halls of the Dead", match: /Blank Tattoos/, value: "Blank Tattoos", type: "choice", group: "choice" },
  { act: 4, zone: "Trial of the Ancestors", match: /Choose tattoo/, value: "Tattoo Choice", type: "choice", group: "choice" },
  { act: 4, zone: "Trial of the Ancestors", match: /Hinekora/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 4, zone: "Journey's End", match: /Omniphobia/, value: "+2 Skill Points", type: "reward", group: "skill" },

  { act: 5, zone: "Interlude 5.1 — Ogham, The Refuge", match: /Oswin/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 5, zone: "Interlude 5.2 — Khari Bazaar", match: /Akthi/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 5, zone: "Interlude 5.2 — Khari Bazaar", match: /Molten One's Gift/, value: "+5% Maximum Life", type: "reward", group: "life" },
  { act: 5, zone: "Interlude 5.2 — Khari Bazaar", match: /Orbala's Pillar/, value: "7 Boons", type: "choice", group: "choice" },
  { act: 5, zone: "Interlude 5.3 — Mount Kriar, The Glade", match: /Lythara/, value: "+40 Spirit", type: "reward", group: "spirit" },
  { act: 5, zone: "Interlude 5.3 — Mount Kriar, The Glade", match: /Yeti/, value: "+2 Skill Points", type: "reward", group: "skill" },
  { act: 5, zone: "Interlude 5.3 — Mount Kriar, The Glade", match: /Free Unique Item/, value: "Free Unique", type: "choice", group: "choice" },
  { act: 5, zone: "Completion +2 SP Final", match: /Hooded One/, value: "+2 Skill Points", type: "reward", group: "skill" },
];

const fixes = [];
for (const act of guide.acts) {
  for (const zone of act.zones) {
    for (let i = 0; i < zone.steps.length; i++) {
      const step = zone.steps[i];
      for (const rule of REWARD_RULES) {
        if (rule.act === act.act && rule.zone === zone.name && rule.match.test(step.text)) {
          const old = step.reward;
          step.reward = rule.value;
          if (!step.tags.includes(rule.type)) step.tags.push(rule.type);
          if (!step.tags.includes(rule.group)) step.tags.push(rule.group);
          fixes.push({ act: act.act, zone: zone.name, text: step.text.slice(0, 60), was: old, now: rule.value });
          break;
        }
      }
    }
  }
}

// Fix the "Spirit Spirit" dupe
for (const act of guide.acts) {
  for (const zone of act.zones) {
    for (const step of zone.steps) {
      if (step.reward === "+40 Spirit Spirit") step.reward = "+40 Spirit";
    }
  }
}

writeFileSync("src/campaign-guide.json", JSON.stringify(guide, null, 2) + "\n");

console.log("Enriched:", fixes.length, "steps");
fixes.forEach(f => console.log(`  Act ${f.act} | ${f.zone} | ${f.text} | ${f.was ?? "null"} → ${f.now}`));
