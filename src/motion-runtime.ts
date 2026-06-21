import { gsap } from "gsap";
import type { MotionTabId, TabMotionDirection } from "./ui-motion";

export type CursorAuraKind = "card" | "tab";

export type MotionContext = {
  compactMode: boolean;
  previewWindow: boolean;
  reducedMotion: boolean;
};

export const CURSOR_AURA_TARGET_SELECTOR = [
  ".tab-button",
  ".evaluate-card",
  ".price-check",
  ".trade-sidebar",
  ".trade-market-main",
  ".settings-panel",
  ".profile-panel-shell",
  ".atlas-main",
  ".campaign-sidebar",
  ".campaign-main",
  ".data-source-card",
  ".temple-sidebar",
  ".temple-board-shell",
].join(",");

const CURSOR_AURA_SUPPRESS_SELECTOR = [
  ".risk-critical",
  ".risk-danger",
  ".status-error",
  ".warning-text",
  "[data-severity='critical']",
  "[data-severity='danger']",
].join(",");

const BUTTON_TRACE_TARGET_SELECTOR = [
  ".action-button",
  ".chrome-button",
  ".atlas-secondary-action",
  ".profile-import-button",
].join(",");

export const FEATURE_REVEAL_SELECTORS: Record<MotionTabId, readonly string[]> = {
  profile: [".profile-hero", ".profile-card", ".profile-skill-card"],
  scan: [".poe-item-banner", ".evaluate-card", ".price-check"],
  trade: [".trade-sidebar", ".trade-market-main", ".market-board-main"],
  campaign: [".campaign-sidebar", ".campaign-main"],
  atlas: [".trade-sidebar", ".atlas-main", ".atlas-card"],
  data: [".data-source-card"],
  temple: [".temple-sidebar", ".temple-board-shell", ".temple-inspector-card"],
  settings: [".settings-hero", ".settings-field"],
};

export function motionPolicy(context: MotionContext) {
  const enabled = !context.reducedMotion && !context.previewWindow && !context.compactMode;
  return {
    aura: enabled,
    panel: enabled,
    features: enabled,
  };
}

export function cursorAuraProfile(kind: CursorAuraKind) {
  return kind === "tab"
    ? { scale: 0.52, opacity: 0.34, duration: 0.12 }
    : { scale: 1, opacity: 0.16, duration: 0.16 };
}

export function panelEntryOffset(direction: TabMotionDirection) {
  if (direction === "forward") return 8;
  if (direction === "backward") return -8;
  return 0;
}

export type PanelEntryProfile = {
  autoAlpha: number;
  x: number;
  y: number;
  scale: number;
};

export function panelEntryProfile(tab: MotionTabId, direction: TabMotionDirection): PanelEntryProfile {
  return tab === "scan"
    ? { autoAlpha: 0.82, x: 0, y: 4, scale: 1 }
    : { autoAlpha: 0.82, x: panelEntryOffset(direction), y: 4, scale: 0.995 };
}

export function toggleMotionProfile(checked: boolean, travel: number) {
  return checked
    ? { fromX: 0, toX: travel, fromRotation: 0, toRotation: 120 }
    : { fromX: travel, toX: 0, fromRotation: 120, toRotation: 0 };
}

export function buttonTraceEligible(className: string, iconOnly: boolean) {
  const blocked = /(?:danger|destructive|tab-button|row-action|market-period)/.test(className);
  return !iconOnly && !blocked && /(?:action-button|chrome-button|atlas-secondary-action|profile-import-button)/.test(className);
}

export type ReliquaryMotionRuntime = {
  setContext: (context: Pick<MotionContext, "compactMode">) => void;
  animatePanelEntry: (
    tab: MotionTabId,
    panel: HTMLElement,
    direction: TabMotionDirection,
    activeTabButton: HTMLElement | null,
  ) => void;
  animateFeatureArrival: (tab: MotionTabId, panel: HTMLElement) => void;
  clearPanelMotion: (panel?: HTMLElement | null) => void;
  hideAura: (immediate?: boolean) => void;
  destroy: () => void;
};

export function createReliquaryMotionRuntime(
  root: HTMLElement,
  aura: HTMLElement,
  initialContext: Omit<MotionContext, "reducedMotion">,
): ReliquaryMotionRuntime {
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let context: MotionContext = {
    ...initialContext,
    reducedMotion: reducedMotionQuery.matches,
  };
  let panelTimeline: gsap.core.Timeline | null = null;
  let featureTimeline: gsap.core.Timeline | null = null;
  let pointerFrame = 0;
  let pendingPointer: { x: number; y: number; kind: CursorAuraKind } | null = null;

  gsap.set(aura, {
    xPercent: -50,
    yPercent: -50,
    x: -400,
    y: -400,
    scale: 1,
    opacity: 0,
    transformOrigin: "50% 50%",
  });

  const moveX = gsap.quickTo(aura, "x", { duration: 0.14, ease: "power3.out", overwrite: true });
  const moveY = gsap.quickTo(aura, "y", { duration: 0.14, ease: "power3.out", overwrite: true });
  const scaleTo = gsap.quickTo(aura, "scale", { duration: 0.14, ease: "power3.out", overwrite: true });
  const opacityTo = gsap.quickTo(aura, "opacity", { duration: 0.12, ease: "power2.out", overwrite: true });

  const currentPolicy = () => motionPolicy(context);

  function hideAura(immediate = false) {
    pendingPointer = null;
    aura.removeAttribute("data-aura-kind");
    if (immediate) {
      gsap.set(aura, { opacity: 0 });
      return;
    }
    opacityTo(0);
  }

  function applyPendingPointer() {
    pointerFrame = 0;
    const pointer = pendingPointer;
    if (!pointer || !currentPolicy().aura) {
      hideAura(true);
      return;
    }

    const bounds = root.getBoundingClientRect();
    const profile = cursorAuraProfile(pointer.kind);
    aura.dataset.auraKind = pointer.kind;
    moveX(pointer.x - bounds.left);
    moveY(pointer.y - bounds.top);
    scaleTo(profile.scale);
    opacityTo(profile.opacity);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!currentPolicy().aura || !(event.target instanceof Element)) {
      hideAura();
      return;
    }

    const target = event.target.closest<HTMLElement>(CURSOR_AURA_TARGET_SELECTOR);
    if (!target || event.target.closest(CURSOR_AURA_SUPPRESS_SELECTOR)) {
      hideAura();
      return;
    }

    pendingPointer = {
      x: event.clientX,
      y: event.clientY,
      kind: target.matches(".tab-button") ? "tab" : "card",
    };
    if (!pointerFrame) {
      pointerFrame = window.requestAnimationFrame(applyPendingPointer);
    }
  }

  function clearPanelMotion(panel?: HTMLElement | null) {
    panelTimeline?.kill();
    featureTimeline?.kill();
    panelTimeline = null;
    featureTimeline = null;
    if (panel) {
      panel.classList.remove("is-gsap-entering");
      gsap.set(panel, { clearProps: "opacity,visibility,transform" });
    }
  }

  function animatePanelEntry(
    tab: MotionTabId,
    panel: HTMLElement,
    direction: TabMotionDirection,
    activeTabButton: HTMLElement | null,
  ) {
    clearPanelMotion(panel);
    if (!currentPolicy().panel) return;

    const activeRune = activeTabButton?.querySelector<HTMLElement>(".tab-rune") ?? null;
    const animatedTargets: HTMLElement[] = activeRune ? [panel, activeRune] : [panel];
    const entry = panelEntryProfile(tab, direction);
    gsap.killTweensOf(animatedTargets);
    panel.classList.add("is-gsap-entering");

    panelTimeline = gsap.timeline({
      defaults: { overwrite: "auto" },
      onComplete: () => {
        panel.classList.remove("is-gsap-entering");
        gsap.set(panel, { clearProps: "opacity,visibility,transform" });
        if (activeRune) gsap.set(activeRune, { clearProps: "opacity,transform" });
        panelTimeline = null;
      },
    });
    panelTimeline.fromTo(
      panel,
      entry,
      { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: 0.2, ease: "power3.out" },
      0,
    );
    if (activeRune) {
      panelTimeline.fromTo(
        activeRune,
        { opacity: 0.7, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.18, ease: "power3.out" },
        0.01,
      );
    }
  }

  function animateFeatureArrival(tab: MotionTabId, panel: HTMLElement) {
    featureTimeline?.kill();
    featureTimeline = null;
    if (!currentPolicy().features) return;

    const elements = Array.from(new Set(
      FEATURE_REVEAL_SELECTORS[tab]
        .flatMap((selector) => Array.from(panel.querySelectorAll<HTMLElement>(selector))),
    )).slice(0, 6);
    if (!elements.length) return;

    gsap.killTweensOf(elements);
    featureTimeline = gsap.timeline({
      onComplete: () => {
        gsap.set(elements, { clearProps: "opacity,visibility,transform" });
        featureTimeline = null;
      },
    });
    featureTimeline.fromTo(
      elements,
      { autoAlpha: 0.76, y: 5 },
      { autoAlpha: 1, y: 0, duration: 0.18, stagger: 0.024, ease: "power3.out" },
      0.025,
    );
  }

  function setContext(nextContext: Pick<MotionContext, "compactMode">) {
    context = { ...context, ...nextContext, reducedMotion: reducedMotionQuery.matches };
    if (!currentPolicy().aura) hideAura(true);
    if (!currentPolicy().panel) clearPanelMotion();
  }

  function handleReducedMotionChange() {
    context = { ...context, reducedMotion: reducedMotionQuery.matches };
    if (context.reducedMotion) {
      hideAura(true);
      clearPanelMotion();
    }
  }

  function animateToggleControl(input: HTMLInputElement) {
    const control = input.closest<HTMLElement>("[data-runic-toggle]");
    const track = control?.querySelector<HTMLElement>(".runic-toggle-track") ?? null;
    const medallion = control?.querySelector<HTMLElement>(".runic-toggle-medallion") ?? null;
    const offLabel = control?.querySelector<HTMLElement>(".runic-toggle-off") ?? null;
    const onLabel = control?.querySelector<HTMLElement>(".runic-toggle-on") ?? null;
    if (!track || !medallion || !offLabel || !onLabel) return;

    const targets = [track, medallion, offLabel, onLabel];
    gsap.killTweensOf(targets);
    if (!currentPolicy().panel) {
      gsap.set(targets, { clearProps: "opacity,filter,transform" });
      return;
    }

    const travel = Number.parseFloat(getComputedStyle(track).getPropertyValue("--runic-toggle-travel")) || 54;
    const profile = toggleMotionProfile(input.checked, travel);
    const activeLabel = input.checked ? onLabel : offLabel;
    const inactiveLabel = input.checked ? offLabel : onLabel;
    const timeline = gsap.timeline({
      defaults: { overwrite: "auto" },
      onComplete: () => gsap.set(targets, { clearProps: "opacity,filter,transform" }),
    });

    timeline.fromTo(
      medallion,
      { x: profile.fromX, rotation: profile.fromRotation, scale: 1.08 },
      {
        x: profile.toX,
        rotation: profile.toRotation,
        scale: 1,
        duration: 0.18,
        ease: "power3.out",
      },
      0,
    );
    timeline.fromTo(activeLabel, { opacity: 0.34 }, { opacity: 1, duration: 0.14, ease: "power2.out" }, 0);
    timeline.fromTo(inactiveLabel, { opacity: 1 }, { opacity: 0.34, duration: 0.12, ease: "power2.out" }, 0);
    timeline.fromTo(track, { filter: "brightness(1.16)" }, { filter: "brightness(1)", duration: 0.2 }, 0);
  }

  function handleControlChange(event: Event) {
    if (!(event.target instanceof HTMLInputElement) || !event.target.matches("[data-runic-toggle-input]")) {
      return;
    }
    animateToggleControl(event.target);
  }

  function traceButtonFromTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLElement>(BUTTON_TRACE_TARGET_SELECTOR);
    if (!button) return null;
    const label = button.textContent?.trim() ?? "";
    const iconOnly = label.length <= 1 || button.classList.contains("tab-button-icon");
    return buttonTraceEligible(button.className, iconOnly) ? button : null;
  }

  function setButtonTrace(button: HTMLElement, visible: boolean) {
    button.dataset.runicTrace = "";
    gsap.killTweensOf(button);
    const cut = visible ? "0%" : "50%";
    if (!currentPolicy().panel) {
      gsap.set(button, { "--runic-trace-cut": cut });
      return;
    }
    gsap.to(button, {
      "--runic-trace-cut": cut,
      duration: visible ? 0.16 : 0.11,
      ease: visible ? "power2.out" : "power2.in",
      overwrite: true,
    });
  }

  function handleTracePointerOver(event: PointerEvent) {
    const button = traceButtonFromTarget(event.target);
    if (!button || (event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) return;
    setButtonTrace(button, true);
  }

  function handleTracePointerOut(event: PointerEvent) {
    const button = traceButtonFromTarget(event.target);
    if (!button || (event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) return;
    setButtonTrace(button, false);
  }

  function handleTraceFocusIn(event: FocusEvent) {
    const button = traceButtonFromTarget(event.target);
    if (button) setButtonTrace(button, true);
  }

  function handleTraceFocusOut(event: FocusEvent) {
    const button = traceButtonFromTarget(event.target);
    if (!button || (event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) return;
    setButtonTrace(button, false);
  }

  function destroy() {
    root.removeEventListener("pointermove", handlePointerMove);
    root.removeEventListener("pointerleave", handlePointerLeave);
    root.removeEventListener("change", handleControlChange);
    root.removeEventListener("pointerover", handleTracePointerOver);
    root.removeEventListener("pointerout", handleTracePointerOut);
    root.removeEventListener("focusin", handleTraceFocusIn);
    root.removeEventListener("focusout", handleTraceFocusOut);
    window.removeEventListener("blur", handleWindowBlur);
    reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    clearPanelMotion();
    gsap.killTweensOf(aura);
    gsap.killTweensOf(root.querySelectorAll<HTMLElement>("[data-runic-trace]"));
  }

  const handlePointerLeave = () => hideAura();
  const handleWindowBlur = () => hideAura(true);

  root.addEventListener("pointermove", handlePointerMove, { passive: true });
  root.addEventListener("pointerleave", handlePointerLeave, { passive: true });
  root.addEventListener("change", handleControlChange);
  root.addEventListener("pointerover", handleTracePointerOver, { passive: true });
  root.addEventListener("pointerout", handleTracePointerOut, { passive: true });
  root.addEventListener("focusin", handleTraceFocusIn);
  root.addEventListener("focusout", handleTraceFocusOut);
  window.addEventListener("blur", handleWindowBlur);
  reducedMotionQuery.addEventListener("change", handleReducedMotionChange);

  return {
    setContext,
    animatePanelEntry,
    animateFeatureArrival,
    clearPanelMotion,
    hideAura,
    destroy,
  };
}
