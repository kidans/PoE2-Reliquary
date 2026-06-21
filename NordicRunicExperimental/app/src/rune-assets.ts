export const TAB_RUNE_ASSETS = {
  profile: { pair: "PR", url: "/runic/runes/tabs/profile-pr.svg" },
  scan: { pair: "SK", url: "/runic/runes/tabs/scan-sk.svg" },
  trade: { pair: "TR", url: "/runic/runes/tabs/trade-tr.svg" },
  campaign: { pair: "KM", url: "/runic/runes/tabs/campaign-km.svg" },
  atlas: { pair: "AT", url: "/runic/runes/tabs/atlas-at.svg" },
  data: { pair: "DT", url: "/runic/runes/tabs/data-dt.svg" },
  temple: { pair: "TM", url: "/runic/runes/tabs/temple-tm.svg" },
  settings: { pair: "ST", url: "/runic/runes/tabs/settings-st.svg" },
} as const;

export type TabRuneId = keyof typeof TAB_RUNE_ASSETS;
