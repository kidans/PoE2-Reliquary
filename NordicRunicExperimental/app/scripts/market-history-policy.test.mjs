import { describe, expect, it } from "vitest";

import { mergeRetainedSnapshots, selectComparisonBaseline } from "./market-history-policy.mjs";

describe("mergeRetainedSnapshots", () => {
  it("retains cadence snapshots even when the upstream fingerprint is unchanged", () => {
    const first = {
      league: "Runes of Aldur",
      captured_at_epoch_ms: 1_000,
      fingerprint: "same-feed",
      items: [{ id: "exalted-orb", price: 1 }],
    };
    const second = {
      ...first,
      captured_at_epoch_ms: 1_000 + 30 * 60 * 1_000,
    };

    expect(mergeRetainedSnapshots([first], [second], second.captured_at_epoch_ms, 8 * 24 * 60 * 60 * 1_000)).toEqual([
      first,
      second,
    ]);
  });

  it("uses the nearest scheduled baseline when it falls inside tolerance", () => {
    const current = { captured_at_epoch_ms: 120 * 60_000 };
    const expected = { captured_at_epoch_ms: 88 * 60_000 };
    const older = { captured_at_epoch_ms: 30 * 60_000 };

    expect(selectComparisonBaseline([older, expected, current], current, 30 * 60_000, 20 * 60_000)).toBe(expected);
  });

  it("falls back to the previous shared checkpoint when GitHub scheduling is delayed", () => {
    const previous = { captured_at_epoch_ms: 10 * 60_000 };
    const current = { captured_at_epoch_ms: 125 * 60_000 };

    expect(selectComparisonBaseline(
      [previous, current],
      current,
      30 * 60_000,
      20 * 60_000,
      4 * 60 * 60_000,
    )).toBe(previous);
  });

  it("does not disguise an excessively stale checkpoint as a short-period comparison", () => {
    const previous = { captured_at_epoch_ms: 0 };
    const current = { captured_at_epoch_ms: 5 * 60 * 60_000 };

    expect(selectComparisonBaseline(
      [previous, current],
      current,
      30 * 60_000,
      20 * 60_000,
      4 * 60 * 60_000,
    )).toBeNull();
  });
});
