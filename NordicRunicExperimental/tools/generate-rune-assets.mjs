import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputRoot = path.resolve(toolDirectory, "../app/public/runic/runes");

const canonicalRunes = {
  fehu: "M7 21V3M7 7L17 3M7 12L16 8",
  uruz: "M6 21V7L12 3L18 7V21",
  thurisaz: "M8 21V3M8 7L17 12L8 17",
  ansuz: "M7 21V3M7 7L17 12M7 13L17 18",
  raidho: "M7 21V3H14L18 7L14 11H7M13 11L19 21",
  kenaz: "M7 3V21M7 12L18 5M7 12L18 19",
  gebo: "M5 4L19 20M19 4L5 20",
  wunjo: "M7 21V3H14L18 7L14 11H7",
  hagalaz: "M6 3V21M18 3V21M6 8L18 16M6 16L18 8",
  nauthiz: "M12 3V21M5 15L19 9",
  isa: "M12 3V21",
  jera: "M5 4L12 10L19 4M19 20L12 14L5 20",
  eihwaz: "M12 3V21M12 7L18 3M12 9L6 5M12 15L18 19M12 17L6 21",
  perthro: "M7 3V21M7 3L16 7L7 12M7 12L16 17L7 21",
  algiz: "M12 21V10M12 10L5 4M12 10L19 4",
  sowilo: "M18 3L8 9L16 13L6 21",
  tiwaz: "M12 21V4M5 10L12 3L19 10",
  berkano: "M7 3V21M7 3L16 7L7 12M7 12L16 17L7 21",
  ehwaz: "M5 21V3M19 21V3M5 3L19 21M19 3L5 21",
  mannaz: "M5 21V3M19 21V3M5 3L19 14M19 3L5 14",
  laguz: "M8 3V21M8 3L18 10",
  ingwaz: "M12 3L20 12L12 21L4 12Z",
  dagaz: "M5 3V21M19 3V21M5 3L19 21M19 3L5 21",
  othala: "M12 3L19 11L12 18L5 11ZM8 15L4 21M16 15L20 21",
};

const letterAliases = {
  a: { rune: "ansuz", note: "phonetic A" },
  b: { rune: "berkano", note: "phonetic B" },
  c: { rune: "kenaz", note: "hard C represented by K" },
  d: { rune: "dagaz", note: "phonetic D" },
  e: { rune: "ehwaz", note: "practical E alias" },
  f: { rune: "fehu", note: "phonetic F" },
  g: { rune: "gebo", note: "phonetic G" },
  h: { rune: "hagalaz", note: "phonetic H" },
  i: { rune: "isa", note: "phonetic I" },
  j: { rune: "jera", note: "phonetic J/Y" },
  k: { rune: "kenaz", note: "phonetic K" },
  l: { rune: "laguz", note: "phonetic L" },
  m: { rune: "mannaz", note: "phonetic M" },
  n: { rune: "nauthiz", note: "phonetic N" },
  o: { rune: "othala", note: "phonetic O" },
  p: { rune: "perthro", note: "phonetic P" },
  q: { rune: "kenaz", note: "Q represented by K sound" },
  r: { rune: "raidho", note: "phonetic R" },
  s: { rune: "sowilo", note: "phonetic S" },
  t: { rune: "tiwaz", note: "phonetic T" },
  u: { rune: "uruz", note: "phonetic U" },
  v: { rune: "wunjo", note: "V represented by related W sound" },
  w: { rune: "wunjo", note: "phonetic W" },
  x: { runes: ["kenaz", "sowilo"], note: "X represented by KS bindrune" },
  y: { rune: "jera", note: "Y represented by Jera's Y sound" },
  z: { rune: "algiz", note: "practical Z alias" },
};

// Shared-stave bindrunes are intentionally simplified for the 21px navigation spine.
const tabBindrunes = {
  "profile-pr": {
    pair: "PR",
    runes: ["perthro", "raidho"],
    path: "M8 21V3M8 4L16 8L8 12M8 12L16 16L8 20M13 12L19 21",
  },
  "scan-sk": {
    pair: "SK",
    runes: ["sowilo", "kenaz"],
    path: "M17 3L8 8L15 12L7 21M8 12L19 5M8 12L18 19",
  },
  "trade-tr": {
    pair: "TR",
    runes: ["tiwaz", "raidho"],
    path: "M12 21V4M5 10L12 3L19 10M12 8L18 12L12 15M15 15L20 21",
  },
  "campaign-km": {
    pair: "KM",
    runes: ["kenaz", "mannaz"],
    path: "M6 3V21M18 3V21M6 12L18 5M6 12L18 19M6 3L18 14M18 3L6 14",
  },
  "atlas-at": {
    pair: "AT",
    runes: ["ansuz", "tiwaz"],
    path: "M11 21V4M4 10L11 3L18 10M11 8L19 13M11 13L19 18",
  },
  "data-dt": {
    pair: "DT",
    runes: ["dagaz", "tiwaz"],
    path: "M6 4V20M18 4V20M6 4L18 20M18 4L6 20M12 21V4M7 9L12 3L17 9",
  },
  "temple-tm": {
    pair: "TM",
    runes: ["tiwaz", "mannaz"],
    path: "M12 21V4M5 10L12 3L19 10M5 21V7M19 21V7M5 7L19 18M19 7L5 18",
  },
  "settings-st": {
    pair: "ST",
    runes: ["sowilo", "tiwaz"],
    path: "M18 3L8 8L16 12L6 21M12 21V4M5 10L12 3L19 10",
  },
};

const forbiddenSvgContent = ["<script", "<image", "data:", "<text"];

function makeSvg(paths, metadata = {}) {
  const pathList = Array.isArray(paths) ? paths : [paths];
  const dataAttributes = Object.entries(metadata)
    .map(([key, value]) => ` data-${key}="${String(value).replaceAll('"', "&quot;")}"`)
    .join("");
  const pathMarkup = pathList
    .map((d) => `  <path d="${d}" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"/>`)
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${dataAttributes}>\n${pathMarkup}\n</svg>\n`;
  const unsafeToken = forbiddenSvgContent.find((token) => svg.toLowerCase().includes(token));
  if (unsafeToken) {
    throw new Error(`Unsafe SVG token generated: ${unsafeToken}`);
  }
  return svg;
}

async function writeSvg(directory, fileName, paths, metadata) {
  await writeFile(path.join(directory, `${fileName}.svg`), makeSvg(paths, metadata), "utf8");
}

async function generate() {
  const canonicalEntries = Object.entries(canonicalRunes);
  const letterEntries = Object.entries(letterAliases);
  const tabEntries = Object.entries(tabBindrunes);

  if (canonicalEntries.length !== 24 || letterEntries.length !== 26 || tabEntries.length !== 8) {
    throw new Error(`Invalid rune inventory: ${canonicalEntries.length} canonical, ${letterEntries.length} letters, ${tabEntries.length} tabs`);
  }
  if (new Set(tabEntries.map(([, value]) => value.pair)).size !== tabEntries.length) {
    throw new Error("Every navigation tab must have a unique bindrune pair.");
  }

  await rm(outputRoot, { recursive: true, force: true });
  const canonicalDirectory = path.join(outputRoot, "elder-futhark");
  const letterDirectory = path.join(outputRoot, "letters");
  const tabDirectory = path.join(outputRoot, "tabs");
  await Promise.all([
    mkdir(canonicalDirectory, { recursive: true }),
    mkdir(letterDirectory, { recursive: true }),
    mkdir(tabDirectory, { recursive: true }),
  ]);

  for (const [name, runePath] of canonicalEntries) {
    await writeSvg(canonicalDirectory, name, runePath, { rune: name, family: "elder-futhark" });
  }

  for (const [letter, alias] of letterEntries) {
    const runeNames = alias.runes ?? [alias.rune];
    await writeSvg(
      letterDirectory,
      letter,
      runeNames.map((name) => canonicalRunes[name]),
      { letter: letter.toUpperCase(), runes: runeNames.join("+"), approximation: alias.note },
    );
  }

  for (const [fileName, bindrune] of tabEntries) {
    await writeSvg(tabDirectory, fileName, bindrune.path, {
      pair: bindrune.pair,
      runes: bindrune.runes.join("+"),
      use: "reliquary-navigation",
    });
  }

  const manifest = {
    schemaVersion: 1,
    generatedBy: "NordicRunicExperimental/tools/generate-rune-assets.mjs",
    policy: {
      canonicalAlphabet: "Elder Futhark (24 runes)",
      modernLetters: "phonetic aliases; approximations are explicitly documented",
      gameAssetSafeguard: "UI chrome only; never replace Path of Exile game art or icons",
    },
    canonical: Object.keys(canonicalRunes),
    letters: letterAliases,
    tabs: Object.fromEntries(tabEntries.map(([fileName, value]) => [fileName, {
      pair: value.pair,
      runes: value.runes,
      file: `tabs/${fileName}.svg`,
    }])),
  };
  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`Generated ${canonicalEntries.length} canonical, ${letterEntries.length} letters, ${tabEntries.length} tabs.\n`);
}

await generate();
