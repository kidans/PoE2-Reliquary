import { describe, expect, it } from "vitest";

import { DEFAULT_APP_SETTINGS } from "./app-settings";

describe("default app settings", () => {
  it("enables Discord Rich Presence for new installs", () => {
    expect(DEFAULT_APP_SETTINGS.discordPresenceEnabled).toBe(true);
  });
});
