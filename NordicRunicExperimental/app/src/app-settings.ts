export type AppSettings = {
  accentHue: number;
  panelAlpha: number;
  saturation: number;
  discordPresenceEnabled: boolean;
  scanMod: "Ctrl" | "Alt";
  scanKey: string;
  waystoneMod: "Ctrl" | "Alt";
  waystoneKey: string;
  tradeMod: "Ctrl" | "Alt";
  tradeKey: string;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  accentHue: 202,
  panelAlpha: 0.98,
  saturation: 112,
  discordPresenceEnabled: true,
  scanMod: "Ctrl",
  scanKey: "C",
  waystoneMod: "Alt",
  waystoneKey: "W",
  tradeMod: "Alt",
  tradeKey: "D",
};
