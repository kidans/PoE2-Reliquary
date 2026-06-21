import { describe, expect, it } from "vitest";
// @ts-expect-error Node types are intentionally absent from the browser bundle.
import { existsSync, readFileSync } from "node:fs";
// @ts-expect-error Node types are intentionally absent from the browser bundle.
import { fileURLToPath } from "node:url";

const pathFor = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const source = (relative: string) => readFileSync(pathFor(relative), "utf8");

describe("runic line mode contracts", () => {
  it("keeps the native compact window at 560 by 40", () => {
    const rust = source("../src-tauri/src/lib.rs");

    expect(rust).toContain("const COMPACT_WINDOW_WIDTH: f64 = 560.0;");
    expect(rust).toContain("const COMPACT_WINDOW_HEIGHT: f64 = 40.0;");
  });

  it("ships line-specific vector chrome", () => {
    expect(existsSync(pathFor("../public/runic/line/rail.svg"))).toBe(true);
    expect(existsSync(pathFor("../public/runic/line/endcap-left.svg"))).toBe(true);
    expect(existsSync(pathFor("../public/runic/line/endcap-right.svg"))).toBe(true);
  });

  it("reserves constrained truncation for detailed mapping", () => {
    const css = source("./styles.css");

    expect(css).toContain(".compact-strip:not(.is-mapping) .compact-primary");
    expect(css).toContain(".compact-strip.is-mapping:not(.has-map-detail) .compact-primary");
    expect(css).toContain(".compact-strip.is-mapping.has-map-detail .compact-primary");
  });

  it("keeps compact presentation out of the GSAP runtime", () => {
    const runtime = source("./motion-runtime.ts");

    expect(runtime).toContain(
      "const enabled = !context.reducedMotion && !context.previewWindow && !context.compactMode",
    );
  });
});
