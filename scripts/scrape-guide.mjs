import * as cheerio from "cheerio";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = "https://domistae.github.io/poe2-leveling";
const PAGES = [
  { act: 1, file: "poe2_act1_guide.html", name: "Clearfell to Ogham" },
  { act: 2, file: "poe2_act2_guide.html", name: "Vastiri to Dreadnought" },
  { act: 3, file: "poe2_act3_guide.html", name: "Sandswept to Ziggurat" },
  { act: 4, file: "poe2_act4_guide.html", name: "Karui Archipelago" },
  { act: 5, file: "poe2_interludes_guide.html", name: "Interludes V.I-V.III" },
];

const REWARD_RX = /(\+[\d%]+ (?:to )?(?:[A-Z][a-z]+ ?)+(?:Resistance|Spirit|Life|Mana|Skill Points?|Points?|Attributes))/g;
const PERM_RX = /permanent (?:buff|choice|reward)/i;
const OPTIONAL_RX = /\(Opt\)/i;

function cleanupText(raw) {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
}

function extractSteps($el, $) {
  const steps = [];
  // If $el is a .step, process its .step-content
  if ($el.is(".step")) {
    const $content = $el.find(".step-content");
    if (!$content.length) return steps;
    const text = cleanupText($content.text());
    if (!text || text.length < 3) return steps;

    const rewardMatch = text.match(REWARD_RX);
    const reward = rewardMatch ? rewardMatch.map(r => cleanupText(r)).join(", ") : null;

    let clean = text;
    if (rewardMatch) {
      for (const r of rewardMatch) clean = clean.replace(r, "").trim();
    }
    clean = clean.replace(/\s+/g, " ").replace(/\s*,\s*$/, "").replace(/\s*·\s*$/, "").trim();
    if (!clean) return steps;

    const tags = [];
    if ($content.find(".boss").length) tags.push("boss");
    if ($content.find(".npc").length) tags.push("npc");
    if ($content.find(".item").length) tags.push("item");
    if ($content.find(".crafting").length) tags.push("craft");
    if ($el.find(".reward-tag.perm").length || PERM_RX.test(text)) tags.push("perm");
    if (OPTIONAL_RX.test(text) || $el.find(".skip").length) tags.push("optional");

    const locEl = $content.find(".loc");
    const loc = locEl.length ? cleanupText(locEl.text()) : null;

    steps.push({ text: clean, reward, loc, tags });
  }
  return steps;
}

async function scrapeAct(page) {
  const url = `${BASE}/${page.file}`;
  console.log(`  Fetching ${url}...`);
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const zones = [];
  let rewards = [];
  let levelRange = "";

  // Extract rewards from summary
  $(".summary-item").each((_i, el) => {
    rewards.push(cleanupText($(el).text()));
  });
  if (!rewards.length) {
    $(".reward").each((_i, el) => {
      const t = cleanupText($(el).text());
      if (t && !rewards.includes(t)) rewards.push(t);
    });
  }
  rewards = [...new Set(rewards)];

  // Extract level range from header meta
  const meta = $(".act-meta").first().text();
  const lvlMatch = meta.match(/Lvl\s+([\d–\-]+)/i);
  if (lvlMatch) levelRange = lvlMatch[1].replace(/–/g, "-");

  // Process each zone-header as an anchor, grab steps that appear after it
  $(".zone-header").each((_i, el) => {
    const $el = $(el);
    const headerText = cleanupText($el.text());
    const wp = $el.find(".wp").length > 0;
    const town = $el.find(".town").length > 0;

    const nameMatch = headerText.match(/^(.+?)(?:Lvl|TOWN|WAYPOINT)/i);
    const name = nameMatch ? cleanupText(nameMatch[1]) : headerText.split("Lvl")[0]?.trim() ?? headerText;
    const lvlMatch = headerText.match(/Lvl\s+([\d\-–]+)/i);
    const level = lvlMatch ? lvlMatch[1].replace(/–/g, "-") : "";

    // Collect steps after this zone-header until the next zone-header
    const steps = [];
    let next = $el.next();
    while (next.length && !next.is(".zone-header")) {
      if (next.is(".step")) {
        const extracted = extractSteps(next, $);
        steps.push(...extracted);
      }
      next.find(".step").each((_j, stepEl) => {
        if (!$(stepEl).parent().is(".step")) {
          const extracted = extractSteps($(stepEl), $);
          steps.push(...extracted);
        }
      });
      next = next.next();
    }

    if (steps.length || name) {
      zones.push({ name, level, waypoint: wp, town, steps });
    }
  });

  return {
    act: page.act,
    name: page.name,
    level_range: levelRange,
    rewards,
    zones,
  };
}

async function main() {
  console.log("Scraping PoE2 leveling guide...");

  const acts = [];
  for (const page of PAGES) {
    try {
      const act = await scrapeAct(page);
      console.log(`  Act ${act.act}: ${act.zones.length} zones, ${act.zones.reduce((s, z) => s + z.steps.length, 0)} steps`);
      acts.push(act);
    } catch (err) {
      console.error(`  Failed to scrape ${page.file}:`, err);
    }
  }

  // Calculate total rewards from all acts
  const allRewards = [];
  for (const act of acts) {
    for (const r of act.rewards) {
      if (!allRewards.includes(r)) allRewards.push(r);
    }
  }

  // Compute total steps
  const totalSteps = acts.reduce((sum, act) =>
    sum + act.zones.reduce((zsum, zone) => zsum + zone.steps.length, 0), 0);

  const output = {
    version: "0.5",
    fetched_at: new Date().toISOString().split("T")[0],
    acts,
    _meta: {
      total_zones: acts.reduce((s, a) => s + a.zones.length, 0),
      total_steps: totalSteps,
      all_rewards: allRewards,
    },
  };

  const outPath = path.join(import.meta.dirname, "..", "src", "campaign-guide.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nDone! Written to ${outPath}`);
  console.log(`${acts.length} acts, ${output._meta.total_zones} zones, ${output._meta.total_steps} steps`);
}

main();
