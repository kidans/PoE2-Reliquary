import { describe, expect, it } from "vitest";

import { mergeRetainedSnapshots } from "./market-history-policy.mjs";

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
});
