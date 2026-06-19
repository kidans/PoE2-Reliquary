export type MotionTabId =
  | "profile"
  | "scan"
  | "trade"
  | "campaign"
  | "atlas"
  | "data"
  | "temple"
  | "settings";

export type TabMotionDirection = "forward" | "backward" | "neutral";

export const PANEL_TAB_ORDER: MotionTabId[] = [
  "profile",
  "scan",
  "trade",
  "campaign",
  "atlas",
  "data",
  "temple",
  "settings",
];

export function shouldAnimateTabTransition(
  previousTab: MotionTabId | null,
  nextTab: MotionTabId,
  compactMode: boolean,
) {
  return Boolean(previousTab && previousTab !== nextTab && !compactMode);
}

export function tabMotionDirection(
  previousTab: MotionTabId | null,
  nextTab: MotionTabId,
): TabMotionDirection {
  if (!previousTab || previousTab === nextTab) {
    return "neutral";
  }

  const previousIndex = PANEL_TAB_ORDER.indexOf(previousTab);
  const nextIndex = PANEL_TAB_ORDER.indexOf(nextTab);
  if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) {
    return "neutral";
  }

  return nextIndex > previousIndex ? "forward" : "backward";
}
