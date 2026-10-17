/**
 * dsh-account-balance — client half.
 *
 * Adds a balance panel to the sidebar account menu: clicking the avatar shows
 * the recharge wallet ("充值余额" / topped-up balance) and the granted credit
 * ("赠金余额" / bonus wallets) directly in the menu, the way Codex shows the
 * remaining quota in its account flyout.
 *
 * How it plugs in
 * ---------------
 * `settings.launcher` is a `single` slot owned by
 * `@deepseek-ai/dsh-client-ui-settings-general` and occupied by the shipped
 * `client-ui-settings-account` AccountMenu. A single slot renders its LOWEST
 * priority entry and a second registration at the SAME priority throws, so
 * registering at `priority: -1` shadows the shipped menu without destroying
 * it: that entry keeps its registration and is rendered again the moment this
 * entry is disposed.
 *
 * The entry exists only while an account credential is stored. Signed out, the
 * shipped AccountMenu keeps owning the trigger, the sign-in dialog and the
 * onboarding entry.
 *
 * One source of truth
 * -------------------
 * The shipped launcher entry's own inject face is read through the slot
 * registry (`ctx.slots.entries`), and this plugin renders the SAME account
 * snapshot it publishes (`hooks.account`) and calls the SAME operations it
 * hands its own component. That keeps one read and one refresh for the whole
 * account feature:
 *
 *   - the figures and the Settings → 账号与余额 page can never disagree, and
 *     no Platform request is duplicated;
 *   - the Settings-open refresh the shipped launcher used to perform (the
 *     account page never refreshes itself) still happens, so replacing the
 *     launcher does not freeze that page;
 *   - sign-out, the running-task query, the Feedback destination and the
 *     native embedded Platform page stay the shipped implementations.
 *
 * Every face is used defensively: a missing member degrades one control
 * (the top-up action falls back to the Platform URL in the system browser)
 * and a missing account face means this plugin simply does not take over.
 *
 * Bundle shape
 * ------------
 * Factory-form CJS: the page registers one factory and its module body (this
 * file, styles included) runs at first materialization. `react` and
 * `@deepseek-ai/dsh-client-ui-primitives` are platform seeds, so the package
 * needs no `dsh.client.external` entry.
 */

window.__ModuleLoader__.load({
  id: "dsh-account-balance",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = React.createElement;
    const { Component, useEffect, useRef, useState } = React;

    const {
      Button,
      IconDarkOutlineMedium,
      IconGlobeOutlineMedium,
      IconLightOutlineMedium,
      IconNewChatOutlineMedium,
      IconPaperPlaneOutlineMedium,
      IconPluginPinwheelOutlineMedium,
      IconRefreshOutlineMedium,
      IconSettingsOutlineMedium,
      IconUserOutlineMedium,
      IconWarningTriangleOutlineMedium,
      Menu,
      Modal,
      Toast,
    } = primitives;

    // ---------------------------------------------------------------- constants

    const PLUGIN_ID = "dsh-account-balance";
    /** Locale namespace owned by this plugin (bilingual dictionaries below). */
    const NS = "account.balance";
    /** The seat this plugin takes over while an account credential is stored. */
    const LAUNCHER_SLOT = "settings.launcher";
    /** Shadow the shipped launcher: lowest priority renders a single slot. */
    const SHADOW_PRIORITY = -1;
    /** Embedded Platform pages the Desktop host accepts. */
    const TOP_UP_PAGE = "top-up";
    /**
     * The three-column macOS/Finder layering this plugin paints:
     *
     *   rail (#F5F5F5)  │ soft shadow │  project column (#FFF, rounded top-left)  │ 1px #E5E5E5 │  main window (#FFF)
     *
     * Only the frame tone needs the theme service: `--dsw-specific-sidebar-fill`
     * paints the window, the caption strip and the sidebar column behind the
     * project column — so the top bar and the rail are one continuous L of the
     * same light gray. The columns, the corner, the hairline and the cast shadow
     * are stated in CSS with light-dark(), driven by the theme's color-scheme.
     */
    const FRAME_TONE = { light: "#F5F5F5", dark: "var(--dsw-static-neutral-bluish-900)" };
    /**
     * Below these amounts (in cents) the composer banner warns that the account
     * is running out: Codex's "quota used up" card, in DSH's currency terms.
     */
    const LOW_BALANCE_CENTS = { CNY: 500, USD: 100 };
    /**
     * The account snapshot shown before any shipped account face is available.
     * Keeping one constant keeps the hook contract's snapshot stability.
     */
    const ABSENT_ACCOUNT = { view: { status: "loading", links: undefined, attempt: null }, details: undefined };
    /** @returns the warning threshold in cents for one currency. */
    function lowBalanceThreshold(currency) {
      return LOW_BALANCE_CENTS[currency] ?? 100;
    }

    // ---------------------------------------------------------------- styles

    const CSS = `
/* Three columns, macOS style: the project column is a plain white surface that
   sits over the rail, so no border is drawn where they meet — only the shadow the
   rail carries along its inner edge. Its top-left corner alone is rounded, which
   lets the light gray of the bar/rail L show through and joins the column to the
   chrome. The hairline belongs to the other junction (project column to main
   window) and runs the column's full height.
   Both palettes come from CSS light-dark() (the theme sets color-scheme), so no
   script-side theme bookkeeping is involved. */
[data-slot="sidebar"]>div{--dsab-column-fill:light-dark(#FFFFFF,var(--dsw-static-neutral-bluish-900));background:var(--dsab-column-fill);border:0;border-inline-end:1px solid light-dark(#E5E5E5,#2E2E30);border-top-left-radius:12px;border-bottom-left-radius:12px}
/* The session list fades its last row out at the bottom (a 24px gradient that
   ships fading into --dsw-specific-sidebar-fill, the column's old fill). This
   plugin repaints the column white / bluish-900, so the shipped end tone no longer
   matches and the fade reads as a gray block above the footer. Re-point it at the
   column's own fill. Scoped to the sidebar — the chat view has fade classes too,
   and those work with masks. */
[data-slot="sidebar"] [class*="_fade"]{background:linear-gradient(to bottom,#0000,var(--dsab-column-fill,#FFF))}
/* The main window is the same flat white as the project column; no rounding, so
   the junction runs unbroken from the caption strip to the window's bottom. */
[data-slot="root"]>div>div:has(>[data-slot="main"]){background:light-dark(#FFFFFF,var(--dsw-static-neutral-bluish-875));border-radius:0}
.dsab-anchor{width:100%}
/* The account entry lives at the rail's foot (Codex), not in the sidebar row. */
.dsab-railAccount{justify-content:center;display:flex;flex:none}
.dsab-avatar{corner-shape:round;background:var(--dsw-alias-bg-skeleton);width:28px;height:28px;color:var(--dsw-alias-label-tertiary);border-radius:50%;flex:none;justify-content:center;align-items:center;display:flex}
.dsab-avatarImage{corner-shape:round;object-fit:cover;border-radius:50%;width:100%;height:100%;display:block}
.dsab-balance{order:-1;flex-direction:column;padding:2px 2px 0;display:flex}
.dsab-balanceRow{justify-content:space-between;align-items:center;gap:12px;min-height:28px;padding:4px 8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);display:flex}
.dsab-balanceLabel{color:var(--dsw-alias-label-secondary)}
.dsab-balanceValue{align-items:baseline;gap:8px;font-variant-numeric:tabular-nums;display:inline-flex}
.dsab-balanceMuted{color:var(--dsw-alias-label-tertiary)}
.dsab-error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}
/* The app rail owns the frame's left strip and the panel icons. It stays
   click-through, so the shipped sidebar toggle keeps painting and responding at
   its own 12px position on top of the rail.
   The rail's inner edge carries the project column's cast shadow — a soft 9px
   inset shadow, no border — so the white column reads as slightly overlapping it.
   It starts at the strip's bottom edge: above that the bar and the rail are one
   continuous light-gray L, and a shadow there would draw a seam through it. */
.dsab-rail{position:fixed;left:0;top:0;bottom:0;width:48px;box-sizing:border-box;z-index:1;background:var(--dsw-specific-sidebar-fill);border-top-left-radius:14px;flex-direction:column;align-items:center;gap:2px;padding:60px 0 16px;display:flex;pointer-events:none}
.dsab-rail::after{content:"";position:absolute;top:var(--dsh-windows-titlebar-height,0px);bottom:0;inset-inline-end:0;width:9px;pointer-events:none;box-shadow:inset -9px 0 9px -9px light-dark(rgba(0,0,0,0.045),rgba(0,0,0,0.5))}
.dsab-railButton{pointer-events:auto;-webkit-app-region:no-drag;justify-content:center;align-items:center;width:36px;height:36px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:var(--dsw-radius-md);flex:none;display:inline-flex}
.dsab-railButton:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsab-railButton:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dsab-railButton[aria-current=page]{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-primary)}
.dsab-railSpacer{flex:1;min-height:0}
/* One continuous surface: the frame, its title strip and the rail share the
   frame tone. The rail strip is carved out with a MARGIN, not with padding: the
   frame's absolutely positioned children (the column resize handle above all)
   resolve against its padding box, which padding would leave at x=0 — that is
   what put the resize handle ~48px left of the column divider. With a margin the
   box itself starts after the rail, so every child — the columns, the divider and
   the handle — shares one origin. The rail paints the strip's left end, so the
   surface stays continuous and the app's own corner is cut out of the rail. */
[data-slot="root"]>div{box-sizing:border-box;margin-left:48px}
html[data-windows-titlebar]{--dsh-windows-menu-start:60px}
/* The panel rows moved into the rail; the sidebar list would be a second entry
   point for the same panels. */
[data-slot="sidebar"] nav[aria-label="全局面板"],[data-slot="sidebar"] nav[aria-label="Global panels"]{display:none}
/* Codex's "new chat" row: a flat left-aligned icon + label instead of the
   shipped elevated pill (which is a white fill with a hairline border and a
   centred label). Only the expanded sidebar is restyled — the collapsed state is
   already a flat round button.
   The class names carry the CSS-module key (newSession…), which survives the
   build's hash prefix, but the inner spans are keyed newSessionLabelMask,
   newSessionContent and newSessionShortcut — so the button rules below are
   scoped to the button element. Matching the bare class fragment there would put
   one translucent hover fill on the button, its label box and its content at
   once, which paints the row in three tones instead of one. */
[data-slot="sidebar"]>div:not([class*="_collapsed"]) button[class*="_newSession"],
[data-slot="sidebar"]>div:not([class*="_collapsed"]) button[aria-label="新会话"],
[data-slot="sidebar"]>div:not([class*="_collapsed"]) button[aria-label="New session"]{background:0 0;border-color:#0000;justify-content:flex-start;font-weight:400;padding:7px 10px}
[data-slot="sidebar"]>div:not([class*="_collapsed"]) button[class*="_newSession"]:hover,
[data-slot="sidebar"]>div:not([class*="_collapsed"]) button[aria-label="新会话"]:hover,
[data-slot="sidebar"]>div:not([class*="_collapsed"]) button[aria-label="New session"]:hover{background:var(--dsw-alias-interactive-bg-hover)}
[data-slot="sidebar"]>div:not([class*="_collapsed"]) span[class*="_newSessionLabelMask"]{overflow:visible;mask-image:none;-webkit-mask-image:none}
[data-slot="sidebar"]>div:not([class*="_collapsed"]) span[class*="_newSessionContent"]{width:auto;justify-content:flex-start;gap:8px}
[data-slot="sidebar"]>div:not([class*="_collapsed"]) span[class*="_newSessionContent"]>svg{width:16px;height:16px}
[data-slot="sidebar"]>div:not([class*="_collapsed"]) span[class*="_newSessionShortcut"]{display:none}
/* The conversation header's hairline. Codex runs the header into the transcript
   without a rule, so the half-pixel border is made transparent (keeping its
   width, so nothing shifts). The subject is found through the stable data
   attribute its leading child carries, not through the hashed class. */
[data-slot="main"] *:has(>[data-conversation-header-leading]){border-bottom-color:#0000}
/* Codex's transcript dissolve. The chat viewport fades out at both edges, and both
   fades are fixed to the viewport rather than scrolling with the text:
   — top: a mask on the scroll container itself (a mask is not part of the scrolled
     content), so messages soften into the bar as they pass under it;
   — bottom: the composer seat already ships a sticky backdrop for exactly this,
     but it points at --dsw-alias-bg-base, which is transparent in this renderer,
     so the transcript was cut off hard. It is re-pointed at the window's own tone
     and lengthened to the 70-120px band.
   No filter is involved and the composer itself stays fully opaque. */
[data-slot="main"] [data-conversation-scroll]{animation:dsab-top-dissolve linear both;animation-timeline:scroll(self block);animation-range:0 64px}
@keyframes dsab-top-dissolve{from{-webkit-mask-image:linear-gradient(to bottom,#000 0,#000 0,#000 100%);mask-image:linear-gradient(to bottom,#000 0,#000 0,#000 100%)}to{-webkit-mask-image:linear-gradient(to bottom,#0000 0,#000 72px,#000 100%);mask-image:linear-gradient(to bottom,#0000 0,#000 72px,#000 100%)}}
/* The composer seat is only as tall as the composer, so its own backdrop cannot
   reach into the transcript; the fade is therefore a veil pinned above it — the
   seat is sticky, so the veil stays put while the text scrolls under it. */
[data-slot="main"] [data-conversation-scroll]>[data-composer-seat]{background:linear-gradient(180deg,#0000 0,light-dark(#FFFFFF,var(--dsw-static-neutral-bluish-875)) 36px)}
[data-slot="main"] [data-conversation-scroll]>[data-composer-seat]::before{content:"";position:absolute;left:0;right:0;bottom:100%;height:104px;pointer-events:none;background:linear-gradient(180deg,#0000 0,light-dark(#FFFFFF,var(--dsw-static-neutral-bluish-875)) 100%)}
/* Codex's context rail. DSH already ships the navigator (one mark per turn, a
   preview bubble, click to jump) but docks it on the right and grows the ticks
   leftwards. It is docked here against the project column's divider with a 16px
   gap, and every tick keeps its left origin so it extends to the right — which is
   what lets the fisheye in the client half read as one continuous band. */
[data-slot="main"] nav[aria-label="轮次导航"],[data-slot="main"] nav[aria-label="Turn navigation"]{right:auto;left:16px}
[data-slot="main"] nav[aria-label="轮次导航"] [class*="_mark"]::before,
[data-slot="main"] nav[aria-label="Turn navigation"] [class*="_mark"]::before{left:0;right:auto;width:26px;height:2px;border-radius:1px;transform-origin:0 50%;transform:translateY(-50%) scaleX(var(--dsab-tick,.19));transition:background-color .14s}
/* The preview bubble ships anchored to the rail's left (right:calc(100% + 10px)),
   which is off-screen now that the rail sits at the column's left edge; it opens to
   the right instead. */
[data-slot="main"] nav[aria-label="轮次导航"]>[class*="_preview"],
[data-slot="main"] nav[aria-label="Turn navigation"]>[class*="_preview"]{right:auto;left:calc(100% + 10px)}
/* The ship's own active mark follows the conversation's turn, so it stays put
   while the user reads; the client half labels the tick nearest the scroll
   fraction instead, and that one carries the dark tone. */
[data-slot="main"] nav[aria-label="轮次导航"] [class*="_mark"][class*="markActive"]:not([data-dsab-current])::before,
[data-slot="main"] nav[aria-label="Turn navigation"] [class*="_mark"][class*="markActive"]:not([data-dsab-current])::before{background:var(--dsw-alias-border-l4)}
[data-slot="main"] nav[aria-label="轮次导航"] [data-dsab-current]::before,
[data-slot="main"] nav[aria-label="Turn navigation"] [data-dsab-current]::before{background:var(--dsw-alias-label-primary)}
/* Codex's quota card, above the composer. */
.dsab-banner{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);align-items:center;gap:8px;width:100%;max-width:640px;margin-inline:auto;padding:7px 10px;display:flex}
.dsab-bannerHide{flex:none;margin:0;padding:0 2px;border:0;background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;border-radius:4px}
.dsab-bannerHide:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}
.dsab-bannerIcon{color:var(--dsw-alias-state-warn-primary);flex:none;display:flex}
.dsab-bannerText{flex-direction:column;min-width:0;gap:2px;flex:1;display:flex}
.dsab-bannerTitle{font-size:12px;line-height:18px;font-weight:500}
.dsab-bannerDetail{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.dsab-bannerActions{align-items:center;gap:8px;flex:none;display:flex}
`;

    /**
     * Install this plugin's stylesheet. The tag is reused in place so a code
     * replacement (HMR) updates the rules instead of keeping the old sheet.
     */
    const STYLE_TAG_ID = PLUGIN_ID + "/AccountMenu.module.css";
    if (typeof document !== "undefined") {
      const selector = "style[data-plugin-css=" + JSON.stringify(STYLE_TAG_ID) + "]";
      let tag = document.querySelector(selector);
      if (tag === null) {
        tag = document.createElement("style");
        tag.dataset.plugin = PLUGIN_ID;
        tag.dataset.pluginCss = STYLE_TAG_ID;
        document.head.appendChild(tag);
      }
      if (tag.textContent !== CSS) tag.textContent = CSS;
    }

    // ------------------------------------------------------- turn navigator

    /**
     * Codex's context rail, on top of DSH's own turn navigator.
     *
     * The navigator already ships one mark per turn, a preview bubble and
     * click-to-jump; the stylesheet docks it against the project column and flips
     * the ticks so they grow to the right. Two behaviours CSS cannot express live
     * here — the fisheye the pointer carves into the mark lengths, and scrubbing by
     * dragging. Only the marks' own custom property is written per frame and no
     * React state is touched, so the chat's virtual list, auto-scroll and message
     * anchoring keep working exactly as shipped.
     */
    const TURN_NAV_SELECTOR = 'nav[aria-label="轮次导航"],nav[aria-label="Turn navigation"]';
    /** Tick lengths in px: at rest, under the pointer, and the falloff width. */
    const TICK_REST = 5;
    const TICK_PEAK = 26;
    const TICK_SIGMA = 22;
    /** The width of the mark's pseudo element that scaleX() maps onto. */
    const TICK_UNIT = 26;
    /** Per-frame approach factor: 26% of the distance is ~150ms at 60fps. */
    const TICK_EASING = 0.26;

    /**
     * Bind the fisheye and the drag scrubber to whatever navigator is mounted.
     * @returns a teardown that removes every listener, observer, frame and write.
     */
    function installTurnRail() {
      if (typeof document === "undefined" || typeof document.querySelector !== "function") return () => {};
      const raf = typeof window === "undefined" ? undefined : window.requestAnimationFrame;
      const caf = typeof window === "undefined" ? undefined : window.cancelAnimationFrame;
      if (typeof raf !== "function") return () => {};
      if (typeof MutationObserver !== "function") return () => {};

      /** The mounted navigator, or null while the conversation has none. */
      let host = null;
      /** Viewport-space pointer y while the pointer is on the rail; null outside. */
      let pointerY = null;
      /** Active press: which pointer, where it started and whether it is scrubbing. */
      let press = null;
      let frame = 0;
      let scrollFrame = 0;
      /** The mark currently labelled as the reading position, if any. */
      let current = null;
      const painted = new Map();
      const suspended = [];

      const chatScroller = () => document.querySelector("[data-conversation-scroll]");
      const marks = () => (host === null ? [] : Array.from(host.querySelectorAll('[class*="_mark"]')));
      const lengthFor = (distance) => {
        const falloff = Math.exp(-(distance * distance) / (2 * TICK_SIGMA * TICK_SIGMA));
        return TICK_REST + (TICK_PEAK - TICK_REST) * falloff;
      };

      /**
       * Mark the tick at the transcript's reading position. The ship's own active
       * mark tracks the conversation's turn, not the viewport, so it does not move
       * while the user reads; this labels the tick closest to the scroll fraction
       * instead, and the stylesheet gives that one the dark tone.
       *
       * The labelling is re-asserted on every pass rather than diffed against the
       * previous mark: the navigator's marks are virtualized, so a re-render can
       * hand back a fresh element that never carried the attribute.
       */
      const syncCurrent = () => {
        scrollFrame = 0;
        if (host === null) return;
        const scroller = chatScroller();
        if (scroller === null) return;
        const list = marks();
        const range = scroller.scrollHeight - scroller.clientHeight;
        const ratio = range > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / range)) : 0;
        const rect = host.getBoundingClientRect();
        const target = rect.top + ratio * rect.height;
        let nearest = null;
        let distance = Number.POSITIVE_INFINITY;
        for (const mark of list) {
          const box = mark.getBoundingClientRect();
          const candidate = Math.abs(target - (box.top + box.height / 2));
          if (candidate < distance) {
            distance = candidate;
            nearest = mark;
          }
        }
        current = nearest;
        for (const mark of list) {
          if (mark !== nearest) {
            if (mark.hasAttribute("data-dsab-current")) mark.removeAttribute("data-dsab-current");
          } else if (!mark.hasAttribute("data-dsab-current")) {
            mark.setAttribute("data-dsab-current", "");
          }
        }
      };

      const wakeCurrent = () => {
        if (scrollFrame === 0) scrollFrame = raf(syncCurrent);
      };

      /** One animation step: approach every mark's target length, then reschedule. */
      const paint = () => {
        frame = 0;
        if (host === null) return;
        let settling = false;
        for (const mark of marks()) {
          const box = mark.getBoundingClientRect();
          const center = box.top + box.height / 2;
          const target = pointerY === null ? TICK_REST : lengthFor(Math.abs(pointerY - center));
          const before = painted.get(mark) ?? TICK_REST;
          const next = Math.abs(target - before) < 0.12 ? target : before + (target - before) * TICK_EASING;
          if (Math.abs(next - target) > 0.12) settling = true;
          if (next !== before || !mark.style.getPropertyValue("--dsab-tick")) {
            painted.set(mark, next);
            mark.style.setProperty("--dsab-tick", (next / TICK_UNIT).toFixed(3));
          }
        }
        wakeCurrent();
        if (settling || pointerY !== null) frame = raf(paint);
      };

      const wake = () => {
        if (frame === 0) frame = raf(paint);
      };

      /** Put the transcript at the rail fraction under `y` (instant, for dragging). */
      const scrubTo = (y, rect) => {
        const scroller = chatScroller();
        if (scroller === null || rect.height <= 0) return;
        const range = scroller.scrollHeight - scroller.clientHeight;
        if (range <= 0) return;
        const ratio = Math.min(1, Math.max(0, (y - rect.top) / rect.height));
        scroller.scrollTop = ratio * range;
      };

      /** Hand the release position to the navigator so it lands on a real turn. */
      const settleOnNearestMark = (y) => {
        let nearest = null;
        let distance = Number.POSITIVE_INFINITY;
        for (const mark of marks()) {
          const box = mark.getBoundingClientRect();
          const candidate = Math.abs(y - (box.top + box.height / 2));
          if (candidate < distance) {
            distance = candidate;
            nearest = mark;
          }
        }
        nearest?.click();
      };

      const onPointerMove = (event) => {
        if (host === null) return;
        if (press !== null && press.pointerId === event.pointerId) {
          if (!press.scrubbing && Math.abs(event.clientY - press.startY) > 3) {
            press.scrubbing = true;
            const scroller = chatScroller();
            if (scroller !== null) {
              suspended.push([scroller, scroller.style.scrollBehavior]);
              scroller.style.scrollBehavior = "auto";
            }
            event.preventDefault();
          }
          if (press.scrubbing) scrubTo(event.clientY, host.getBoundingClientRect());
        }
        const rect = host.getBoundingClientRect();
        if (event.clientY < rect.top - 8 || event.clientY > rect.bottom + 8) return;
        pointerY = event.clientY;
        wake();
      };

      const onPointerLeave = () => {
        if (press !== null) return;
        pointerY = null;
        wake();
      };

      const onPointerDown = (event) => {
        if (host === null || event.button !== 0) return;
        press = { pointerId: event.pointerId, startY: event.clientY, scrubbing: false };
      };

      const onPointerUp = (event) => {
        if (press === null || press.pointerId !== event.pointerId) return;
        const scrubbing = press.scrubbing;
        press = null;
        for (const [scroller, behavior] of suspended.reverse()) scroller.style.scrollBehavior = behavior;
        suspended.length = 0;
        if (scrubbing) settleOnNearestMark(event.clientY);
      };

      const bind = () => {
        const next = document.querySelector(TURN_NAV_SELECTOR);
        if (next === host) return;
        unbind();
        host = next;
        if (host === null) return;
        host.addEventListener("pointermove", onPointerMove);
        host.addEventListener("pointerleave", onPointerLeave);
        host.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointerup", onPointerUp, true);
        window.addEventListener("pointercancel", onPointerUp, true);
        // scroll never bubbles but it does capture, so one document-level capture
        // listener survives the scroll container being re-created by a re-render.
        document.addEventListener("scroll", wakeCurrent, true);
        wake();
        wakeCurrent();
      };

      const unbind = () => {
        if (host === null) return;
        host.removeEventListener("pointermove", onPointerMove);
        host.removeEventListener("pointerleave", onPointerLeave);
        host.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("pointercancel", onPointerUp, true);

        for (const mark of painted.keys()) mark.style.removeProperty("--dsab-tick");
        painted.clear();
        current?.removeAttribute("data-dsab-current");
        current = null;
        host = null;
        pointerY = null;
      };

      // The navigator mounts with the conversation and is remounted when the
      // session changes; a body watcher re-binds, and its callback is an O(1)
      // connectivity check so streaming appends cost nothing.
      const watcher = new MutationObserver(() => {
        if (host !== null && host.isConnected) {
          // The marks are virtualized, so a re-render can replace the element that
          // carried the reading-position label; re-assert it on the next frame.
          wakeCurrent();
          return;
        }
        bind();
      });
      watcher.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
      bind();
      // A light safety net: the navigator re-renders on its own schedule (a new
      // turn, a streamed message, a locale change) and a replaced mark takes its
      // label with it, so the reading position is re-asserted on a slow beat too.
      const keepAlive = typeof setInterval === "function" ? setInterval(wakeCurrent, 400) : 0;

      return () => {
        watcher.disconnect();
        document.removeEventListener("scroll", wakeCurrent, true);
        if (keepAlive !== 0) clearInterval(keepAlive);
        if (frame !== 0 && typeof caf === "function") caf(frame);
        if (scrollFrame !== 0 && typeof caf === "function") caf(scrollFrame);
        frame = 0;
        scrollFrame = 0;
        unbind();
      };
    }

    // ---------------------------------------------------------------- copy

    /** Simplified Chinese dictionary. */
    const zh = {
      title: "账号余额",
      balance: "充值余额",
      bonusBalance: "赠金余额",
      loading: "读取中…",
      unavailable: "暂不可用",
      available: "可用",
      settings: "设置",
      topUp: "前往充值",
      contactUs: "意见反馈",
      refresh: "刷新余额",
      menu: "账号菜单",
      signedIn: "已登录 DeepSeek",
      close: "关闭",
      cancel: "取消",
      signOut: "退出登录",
      signOutUnknownDescription: "暂时无法确认任务状态。退出登录可能会中断使用此账号的任务，是否继续？",
      signOutDescription: "退出登录不会丢失任何数据，你仍可以登录此账号。",
      signOutRunningDescription: "当前有进程正在执行中，点击“退出登录”，将会打断进程，是否即刻退出登录？",
      failed: "操作未完成，请重试。",
      sessionExpired: "登录信息已失效，请重新登录",
      modelSignInRequired: "当前模型暂不可用，请登录后再试",
      rail: "应用导航栏",
      railNewSession: "新会话",
      themeToDark: "切换到深色",
      themeToLight: "切换到浅色",
      lowTitleExhausted: "可用余额已用完",
      lowTitleLow: "账号余额不足",
      lowDetail: "当前可用 {amount}，余额用尽后新任务将无法开始。",
      usage: "查询用量",
      hide: "隐藏",
    };

    /** English dictionary, key-complete against the Chinese source. */
    const en = {
      title: "Account balance",
      balance: "Topped-up balance",
      bonusBalance: "Granted balance",
      loading: "Loading…",
      unavailable: "Not available",
      available: "Available",
      settings: "Settings",
      topUp: "Top up",
      contactUs: "Feedback",
      refresh: "Refresh balance",
      menu: "Account menu",
      signedIn: "Signed in to DeepSeek",
      close: "Close",
      cancel: "Cancel",
      signOut: "Sign out",
      signOutUnknownDescription: "Could not check running tasks. Signing out may interrupt tasks using this account. Sign out now?",
      signOutDescription: "Signing out will not delete any data. You can sign in to this account again.",
      signOutRunningDescription: "Tasks are currently running. Signing out will interrupt them. Sign out now?",
      failed: "Could not complete the operation. Try again.",
      sessionExpired: "Your sign-in has expired. Sign in again.",
      modelSignInRequired: "The current model is unavailable. Sign in and try again.",
      rail: "App rail",
      railNewSession: "New session",
      themeToDark: "Switch to dark",
      themeToLight: "Switch to light",
      lowTitleExhausted: "No balance available",
      lowTitleLow: "Low account balance",
      lowDetail: "{amount} left. New tasks cannot start once it runs out.",
      usage: "View usage",
      hide: "Hide",
    };

    // ---------------------------------------------------------------- values

    /** @returns the display symbol for one Platform wallet currency. */
    function currencySymbol(currency) {
      return currency === "CNY" ? "\u00a5" : "$";
    }

    /** @returns the integer part grouped the way Platform Web groups it. */
    function group(fixed) {
      const [integer, fraction] = fixed.split(".");
      return Number(integer).toLocaleString() + "." + fraction;
    }

    /** @returns the decimal string truncated (never rounded up) to cents. */
    function truncateToCents(text) {
      const [integer = "0", fraction = ""] = text.split(".");
      const digits = (fraction + "00").slice(0, 2);
      return integer.replace(/^0+(?=\d)/, "") + "." + digits;
    }

    /**
     * Format one balance string with Platform Web's display rules: two
     * decimals with digit grouping, positive amounts truncated to cents,
     * positive sub-cent amounts shown as `<0.01`, and negative amounts rounded
     * with a minimum displayed magnitude of 0.01.
     * @param amount - decimal balance string from the Host.
     * @param symbol - currency symbol.
     * @returns signed currency text.
     */
    function formatBalance(amount, symbol) {
      const text = String(amount ?? "").trim();
      const value = Number(text);
      if (text === "" || !Number.isFinite(value)) return symbol + "0.00";
      if (value === 0) return symbol + "0.00";
      if (value < 0) {
        const magnitude = text.replace(/^-/, "");
        return "-" + symbol + (value > -0.01 ? "0.01" : group(Number(magnitude).toFixed(2)));
      }
      if (value < 0.01) return "<" + symbol + "0.01";
      return symbol + group(truncateToCents(text));
    }

    /** @returns whether a wallet holds positive credit. */
    function holdsCredit(wallet) {
      return Number(wallet.balance) > 0;
    }

    /** @returns one decimal string as an exact integer number of cents. */
    function centsOf(text) {
      const raw = String(text ?? "").trim();
      const negative = raw.startsWith("-");
      const [integer = "0", fraction = ""] = raw.replace(/^[+-]/, "").split(".");
      const cents = Number(integer) * 100 + Number((fraction + "00").slice(0, 2));
      if (!Number.isFinite(cents)) return 0;
      return negative ? -cents : cents;
    }

    /** @returns grouped currency text for an exact number of cents. */
    function formatCents(cents, symbol) {
      const text = (Math.abs(cents) / 100).toFixed(2);
      return (cents < 0 ? "-" : "") + symbol + group(text);
    }

    /**
     * What the account can currently spend, per currency, summed exactly from the
     * wallet strings. The rail shows only the avatar, so this is the menu's
     * accessible summary of the same figures.
     * @param balance - the shared snapshot's balance outcome.
     * @param t - bound locale function, used while the read is pending or failed.
     * @returns the summary text.
     */
    function availableSummary(balance, t) {
      if (balance === undefined) return t("loading");
      if (balance.status !== "ready") return t("unavailable");
      const totals = new Map();
      for (const wallet of [...balance.value, ...balance.bonusWallets]) {
        totals.set(wallet.currency, (totals.get(wallet.currency) ?? 0) + centsOf(wallet.balance));
      }
      const parts = [...totals.entries()]
        .filter(([, cents]) => cents !== 0)
        .map(([currency, cents]) => formatCents(cents, currencySymbol(currency)));
      return parts.length === 0 ? `${t("available")} ${formatCents(0, "\u00a5")}` : `${t("available")} ${parts.join(" · ")}`;
    }

    // ---------------------------------------------------------------- icons

    /** Figma logout glyph; the shipped account menu stores the same artwork. */
    function LogoutIcon() {
      return h(
        "span",
        { style: { width: 16, height: 16, position: "relative" }, "aria-hidden": "true" },
        h(
          "svg",
          {
            style: { position: "absolute", left: 1.168, top: 1.214 },
            width: "13.664",
            height: "13.571",
            viewBox: "0 0 14 14",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
          },
          h("path", {
            d: "M3.9961 1.40039C3.37842 1.40039 2.96028 1.40039 2.63867 1.42871C2.32631 1.45627 2.17171 1.50666 2.06641 1.56543C1.85606 1.68288 1.68189 1.85605 1.56446 2.06641C1.50569 2.17173 1.45625 2.32627 1.42871 2.63867C1.40036 2.9603 1.39942 3.37827 1.39942 3.9961L1.39942 9.5752C1.39942 10.193 1.40036 10.611 1.42871 10.9326C1.45625 11.245 1.50569 11.3996 1.56445 11.5049C1.68188 11.7153 1.85605 11.8884 2.06641 12.0059C2.17171 12.0646 2.32631 12.115 2.63867 12.1426C2.96028 12.1709 3.37842 12.1709 3.9961 12.1709V13.5713C3.4033 13.5713 2.91297 13.5721 2.51563 13.5371C2.10906 13.5013 1.73277 13.4233 1.38379 13.2285C0.946838 12.9845 0.585697 12.6235 0.341799 12.1865C0.14725 11.8377 0.0700118 11.4621 0.0341815 11.0557C-0.000847399 10.6583 1.58129e-06 10.1681 1.85029e-06 9.5752L2.09416e-06 3.9961C1.83027e-06 3.40325 -0.000846367 2.91297 0.0341818 2.51563C0.0700164 2.10924 0.147239 1.73362 0.341799 1.38477C0.585703 0.947758 0.946825 0.586744 1.38379 0.342775C1.73277 0.148001 2.10906 0.0700381 2.51563 0.0341813C2.91297 -0.000823893 3.40331 1.37805e-06 3.9961 1.71712e-06L3.9961 1.40039Z",
            fill: "currentColor",
          }),
          h("path", {
            d: "M13.6426 6.51953C13.6705 6.6957 13.6705 6.8756 13.6426 7.05176C13.5902 7.38188 13.4302 7.64112 13.2539 7.86035C13.0857 8.06937 12.8546 8.29971 12.6006 8.55371L9.3086 11.8447L8.31836 10.8545L11.6104 7.56348C11.637 7.53681 11.6628 7.51104 11.6875 7.48633H3.74317V6.08594H11.6885C11.6635 6.06088 11.6374 6.03487 11.6104 6.00781L8.31836 2.7168L9.3086 1.72656L12.6006 5.01758C12.8547 5.27169 13.0857 5.50185 13.2539 5.71094C13.4303 5.93018 13.5902 6.18939 13.6426 6.51953Z",
            fill: "currentColor",
          })
        )
      );
    }

    /** Circular profile image with the shipped account icon as its fallback. */
    function AccountAvatar({ url }) {
      const [failedUrl, setFailedUrl] = useState(undefined);
      if (url !== null && url !== undefined && url !== "" && url !== failedUrl) {
        return h("img", {
          className: "dsab-avatarImage",
          src: url,
          alt: "",
          referrerPolicy: "no-referrer",
          onError: () => setFailedUrl(url),
        });
      }
      return h(IconUserOutlineMedium, { size: 16 });
    }

    // ---------------------------------------------------------------- balance

    /**
     * The menu's leading balance panel.
     * @param props - the shared account snapshot and the bound copy.
     * @returns two wallet rows, the granted one only when it can be meaningful.
     */
    function BalancePanel({ account, t }) {
      const balance = account.details?.balance;
      const ready = balance !== undefined && balance.status === "ready";
      const wallets = ready ? balance.value : undefined;
      const bonusWallets = ready ? balance.bonusWallets.filter(holdsCredit) : [];
      // The shipped settings card shows the granted row while loading, after a
      // failed read, and whenever a wallet holds positive credit.
      const showBonus = !ready || bonusWallets.length > 0;

      const amount = (rows) => {
        if (ready && rows !== undefined && rows.length > 0) {
          return rows.map((wallet) =>
            h("span", { key: wallet.currency }, formatBalance(wallet.balance, currencySymbol(wallet.currency)))
          );
        }
        return h("span", { className: "dsab-balanceMuted" }, t(ready ? "unavailable" : "loading"));
      };

      return h(
        "div",
        { className: "dsab-balance", role: "group", "aria-label": t("title") },
        h(
          "div",
          { className: "dsab-balanceRow" },
          h("span", { className: "dsab-balanceLabel" }, t("balance")),
          h("span", { className: "dsab-balanceValue" }, amount(wallets))
        ),
        showBonus &&
          h(
            "div",
            { className: "dsab-balanceRow" },
            h("span", { className: "dsab-balanceLabel" }, t("bonusBalance")),
            h("span", { className: "dsab-balanceValue" }, amount(bonusWallets))
          )
      );
    }

    // ---------------------------------------------------------------- dialogs

    /** Local sign-out confirmation; the shipped menu renders the same modal. */
    function SignOutDialog({ state, onCancel, onConfirm, t }) {
      return h(
        Modal,
        {
          open: true,
          title: t("signOut"),
          closeLabel: t("close"),
          description: t(
            state.running === "unknown"
              ? "signOutUnknownDescription"
              : state.running === true
                ? "signOutRunningDescription"
                : "signOutDescription"
          ),
          onClose: onCancel,
          footer: [
            h(Button, { key: "cancel", variant: "outline", disabled: state.busy, onClick: onCancel }, t("cancel")),
            h(Button, { key: "confirm", variant: "primary", disabled: state.busy, onClick: onConfirm }, t("signOut")),
          ],
        },
        state.failed === true ? h("p", { className: "dsab-error", role: "alert" }, t("failed")) : null
      );
    }

    // ---------------------------------------------------------------- menu

    /**
     * The launcher seat while an account credential is stored.
     *
     * It renders nothing itself: the account entry belongs in the rail, and a
     * fixed element inside the sidebar column is clipped by that column (its
     * scroll region owns the overflow). This seat exists to shadow the shipped
     * account menu — the only legal way to take the seat — and to publish the
     * props its owner hands it (Settings navigation) to the rail.
     * @param props - the seat's owner props plus the publish sink.
     * @returns nothing.
     */
    function AccountLauncherShadow(props) {
      const { publish, ...ownerProps } = props;
      useEffect(() => {
        publish(ownerProps);
      });
      return null;
    }

    /**
     * The account entry: an avatar-only button in the rail's foot, with Codex's
     * balance menu anchored above it.
     * @param props - the shared account snapshot hook, the launcher owner props,
     * the shipped account actions and the bound locale function.
     * @returns the account button, its menu, and any dialog or toast it owns.
     */
    function AccountEntry(props) {
      const {
        useSettings,
        useAccount,
        refreshAccount,
        signOut,
        hasRunningAccountTasks,
        openExternal,
        openPlatformPage,
        contactUs,
        subscribeSessionExpired,
        subscribeModelSignInRequired,
        t,
      } = props;
      const settings = useSettings((value) => value);
      const { settingsOpen, settingsShortcut, openSettings } = settings;

      const account = useAccount((snapshot) => snapshot);
      const links = account.view?.links;
      const profile = account.details?.profile;
      const profileReady = profile !== undefined && profile.status === "ready";
      const label = profile === undefined ? null : profileReady ? profile.value.name ?? profile.value.contact ?? t("signedIn") : t("signedIn");
      // Codex's account block carries the account name over the plan line; this
      // row carries the name over what the account can currently spend.
      const summary = availableSummary(account.details?.balance, t);

      const [open, setOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      const [refreshing, setRefreshing] = useState(false);
      const [confirm, setConfirm] = useState(null);
      const [signInNotice, setSignInNotice] = useState(0);
      const [expiryNotice, setExpiryNotice] = useState(false);
      const trigger = useRef(null);
      const settingsWasOpen = useRef(false);
      const mounted = useRef(true);

      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);

      /** Re-read through the shared account owner, so one read serves both surfaces. */
      const refresh = () => {
        setRefreshing(true);
        return Promise.resolve()
          .then(() => refreshAccount?.())
          .catch(() => {})
          .finally(() => {
            if (mounted.current) setRefreshing(false);
          });
      };

      // Read again on every menu opening, and on the edge that opens Settings:
      // that edge is what keeps Settings → 账号与余额 current, because the
      // account page never refreshes itself.
      useEffect(() => {
        if (open) refresh();
      }, [open]);

      useEffect(() => {
        if (settingsOpen && !settingsWasOpen.current) refresh();
        settingsWasOpen.current = settingsOpen;
      }, [refreshAccount, settingsOpen]);

      useEffect(() => subscribeModelSignInRequired?.(() => setSignInNotice((value) => value + 1)), [subscribeModelSignInRequired]);
      useEffect(() => subscribeSessionExpired?.(() => setExpiryNotice(true)), [subscribeSessionExpired]);

      const requestSignOut = async () => {
        setBusy(true);
        try {
          setConfirm({ running: await hasRunningAccountTasks(), busy: false, failed: false });
        } catch (_error) {
          setConfirm({ running: "unknown", busy: false, failed: false });
        } finally {
          setOpen(false);
          setBusy(false);
        }
      };

      const confirmSignOut = async () => {
        setConfirm((state) => (state === null ? state : { ...state, busy: true, failed: false }));
        try {
          await signOut();
          setConfirm(null);
        } catch (_error) {
          setConfirm((state) => (state === null ? state : { ...state, busy: false, failed: true }));
        }
      };

      const networkTopUp = () => {
        if (typeof openPlatformPage === "function") {
          openPlatformPage(TOP_UP_PAGE, () => {});
          return;
        }
        openExternal(links?.topUpUrl);
      };

      const items = [
        { id: "balance-separator", type: "separator" },
        {
          id: "settings",
          label: t("settings"),
          icon: h(IconSettingsOutlineMedium, { size: 16 }),
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }),
        },
        {
          id: "topup",
          label: t("topUp"),
          icon: h(IconGlobeOutlineMedium, { size: 16 }),
          disabled: typeof openPlatformPage !== "function" && (typeof links?.topUpUrl !== "string" || links.topUpUrl === ""),
        },
        {
          id: "refresh",
          label: t("refresh"),
          icon: h(IconRefreshOutlineMedium, { size: 16 }),
          disabled: refreshing,
        },
        {
          id: "contact",
          label: t("contactUs"),
          icon: h(IconPaperPlaneOutlineMedium, { size: 16 }),
        },
        {
          id: "signout",
          label: t("signOut"),
          icon: h(LogoutIcon, {}),
          disabled: busy,
        },
      ];

      const onSelect = (id) => {
        if (id === "settings") {
          setOpen(false);
          trigger.current?.focus();
          openSettings();
        } else if (id === "topup") {
          setOpen(false);
          networkTopUp();
        } else if (id === "refresh") {
          refresh();
        } else if (id === "contact") {
          setOpen(false);
          contactUs();
        } else if (id === "signout") {
          requestSignOut();
        }
      };

      if (account.view?.status !== "credential-stored") return null;

      return h(
        "div",
        { className: "dsab-railAccount" },
        signInNotice > 0 && h(Toast, { key: signInNotice, text: t("modelSignInRequired"), onDone: () => setSignInNotice(0) }),
        expiryNotice && h(Toast, { text: t("sessionExpired"), onDone: () => setExpiryNotice(false) }),
        h(
          Menu,
          {
            open,
            side: "top",
            portal: true,
            autoFocus: true,
            className: "dsab-anchor",
            anchor: h(
              "button",
              {
                ref: trigger,
                type: "button",
                className: "dsab-railButton",
                "aria-label": t("menu"),
                "aria-haspopup": "menu",
                "aria-expanded": open,
                title: label === null ? t("menu") : `${label} · ${summary}`,
                onClick: () => setOpen((value) => !value),
              },
              h("span", { className: "dsab-avatar" }, h(AccountAvatar, { url: profileReady ? profile.value.avatarUrl : null }))
            ),
            items,
            onClose: () => setOpen(false),
            onSelect,
          },
          h(BalancePanel, { account, t })
        ),
        confirm !== null &&
          h(SignOutDialog, {
            state: confirm,
            onCancel: () => {
              if (confirm.busy !== true) setConfirm(null);
            },
            onConfirm: confirmSignOut,
            t,
          })
      );
    }

    // ---------------------------------------------------------------- rail

    /**
     * One rail icon. Panel icons come from other plugins' `sidebar.panellist`
     * registrations, so an icon that cannot render on its own falls back to a
     * generic glyph instead of taking the rail down.
     */
    class RailIconBoundary extends Component {
      /** @returns the boundary's initial state. */
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }

      /** @returns the fallback state after a child render error. */
      static getDerivedStateFromError() {
        return { failed: true };
      }

      /** @returns the child, or the plugin icon as a fallback. */
      render() {
        if (this.state.failed) return h(IconPluginPinwheelOutlineMedium, { size: this.props.size });
        return this.props.children;
      }
    }

    /**
     * Codex's permanent left icon rail: the app's global entries as icons at the
     * window's left edge — a new session, every registered app panel, the
     * light/dark switch, Settings — with the account avatar in its foot cell. The
     * rail itself is click-through, so the shipped sidebar toggle keeps working at
     * its own position on top of it.
     * @param props - the panel registry, the layout's panel selector, the sidebar
     * and account actions, and the account face the foot entry renders.
     * @returns the rail.
     */
    function AccountRail(props) {
      const { usePanels, useSettings, useTheme, selectPanel, startSession, setTheme, openSettings, usePanelInfo, t } = props;
      const panels = usePanels((list) => list);
      const settings = useSettings((value) => value);
      const theme = useTheme((value) => value);
      const activePanelId = usePanelInfo((info) => info.activePanelId ?? null);

      /** One rail entry. */
      const entry = (key, label, icon, onClick, current) =>
        h(
          "button",
          {
            key,
            type: "button",
            className: "dsab-railButton",
            "aria-label": label,
            "aria-current": current === true ? "page" : undefined,
            title: label,
            onClick,
          },
          icon
        );

      // The theme entry offers the other scheme, so its icon is the target one.
      const dark = theme.active?.colorScheme === "dark";
      const otherTheme = (theme.themes ?? []).find((candidate) => candidate.id !== theme.active?.id && candidate.colorScheme !== theme.active?.colorScheme);
      const themeLabel = dark ? t("themeToLight") : t("themeToDark");

      return h(
        "div",
        { className: "dsab-rail", role: "toolbar", "aria-label": t("rail") },
        startSession === undefined ? null : entry("new-session", t("railNewSession"), h(IconNewChatOutlineMedium, { size: 18 }), () => startSession()),
        panels.map((panel) =>
          entry(
            panel.id,
            panel.label,
            h(RailIconBoundary, { size: 18 }, h(panel.component, { size: 18, active: activePanelId === panel.id })),
            () => selectPanel?.(panel.id),
            activePanelId === panel.id
          )
        ),
        h("span", { className: "dsab-railSpacer" }),
        otherTheme === undefined
          ? null
          : entry("theme", themeLabel, dark ? h(IconLightOutlineMedium, { size: 18 }) : h(IconDarkOutlineMedium, { size: 18 }), () =>
              setTheme?.(otherTheme.id)
            ),
        typeof settings.openSettings === "function"
          ? entry("settings", t("settings"), h(IconSettingsOutlineMedium, { size: 18 }), () => openSettings?.())
          : null,
        h(AccountEntry, props)
      );
    }

    // ---------------------------------------------------------------- banner

    /**
     * Codex's quota card for the composer area: shown while the account can no
     * longer cover much work, with the two actions that resolve it.
     * @param props - the shared account snapshot, the shipped Platform page
     * opener and the bound locale function.
     * @returns the banner, or nothing while the balance is healthy or unknown.
     */
    /** localStorage key for the permanent "hidden" state of the low-balance notice. */
    const LOW_BANNER_HIDDEN_KEY = "dsab-low-balance-hidden";

    function readBannerHidden() {
      try {
        return window.localStorage.getItem(LOW_BANNER_HIDDEN_KEY) === "1";
      } catch {
        return false;
      }
    }

    function LowBalanceBanner({ useAccount, refreshAccount, openPlatformPage, openExternal, t }) {
      const account = useAccount((snapshot) => snapshot);
      const [hidden, setHidden] = useState(readBannerHidden);
      if (hidden === true) return null;
      const links = account.view?.links;
      const balance = account.details?.balance;
      if (account.view?.status !== "credential-stored" || balance === undefined || balance.status !== "ready") return null;

      const totals = new Map();
      for (const wallet of [...balance.value, ...balance.bonusWallets]) {
        totals.set(wallet.currency, (totals.get(wallet.currency) ?? 0) + centsOf(wallet.balance));
      }
      const low = [...totals.entries()].filter(([currency, cents]) => cents < lowBalanceThreshold(currency));
      if (low.length === 0) return null;

      const amount = low.map(([currency, cents]) => formatCents(cents, currencySymbol(currency))).join(" · ");
      const exhausted = low.every(([, cents]) => cents <= 0);
      const openPage = (page, fallbackUrl) => {
        if (typeof openPlatformPage === "function") {
          openPlatformPage(page, () => refreshAccount?.());
          return;
        }
        openExternal(fallbackUrl);
      };

      return h(
        "div",
        { className: "dsab-banner", role: "status" },
        h("span", { className: "dsab-bannerIcon" }, h(IconWarningTriangleOutlineMedium, { size: 16 })),
        h(
          "div",
          { className: "dsab-bannerText" },
          h("div", { className: "dsab-bannerTitle" }, t(exhausted ? "lowTitleExhausted" : "lowTitleLow")),
          h("div", { className: "dsab-bannerDetail" }, t("lowDetail", { amount }))
        ),
        h(
          "div",
          { className: "dsab-bannerActions" },
          h(Button, { variant: "outline", size: "sm", onClick: () => openPage("usage", links?.usageUrl) }, t("usage")),
          h(Button, { variant: "primary", size: "sm", onClick: () => openPage("top-up", links?.topUpUrl) }, t("topUp")),
          h(
            "button",
            {
              type: "button",
              className: "dsab-bannerHide",
              onClick: () => {
                try {
                  window.localStorage.setItem(LOW_BANNER_HIDDEN_KEY, "1");
                } catch {
                  // Storage may be unavailable; the notice still hides for this session.
                }
                setHidden(true);
              }
            },
            t("hide")
          )
        )
      );
    }

    // ---------------------------------------------------------------- plugin

    /** Client services this plugin reads; the account figures come from the shipped entry. */
    const inject = ["slots", "locale", "theme", "layout"];

    /**
     * Take the sidebar launcher over while an account credential is stored,
     * driven by the shipped account feature's own snapshot and operations, and
     * carry the Codex-style layout: app rail, sidebar panel, composer banner.
     * @param ctx - client plugin context.
     */
    function apply(ctx) {
      // Account credentials and the account Remote exist only in the Desktop
      // renderer; a plain Web client keeps the shipped menu composition.
      if (!("dshDesktop" in globalThis)) return;

      ctx.effect(() => ctx.locale.register(NS, { en, zh }), "account-balance: dictionaries");

      // The frame tone is a token layer: the theme service owns it, applies it to
      // both palettes and removes it when this plugin unloads.
      ctx.effect(
        () => ctx.theme.overrideTokens(PLUGIN_ID, { "--dsw-specific-sidebar-fill": FRAME_TONE }),
        "account-balance: frame, caption and rail tone"
      );

      // The stylesheet only moves the navigator; the fisheye and the drag scrubber
      // are DOM behaviour, so they are installed on the live navigator instead.
      ctx.effect(() => installTurnRail(), "account-balance: turn navigator fisheye and scrubbing");

      /**
       * The registered app panels, as the rail renders them. The snapshot is
       * cached per slot version so repeated renders stay referentially stable,
       * which is what the renderer's hook contract requires.
       */
      const panelCache = { version: -1, list: [] };
      const panelsSnapshot = () => {
        const version = ctx.slots.getVersion("sidebar.panellist");
        if (version === panelCache.version) return panelCache.list;
        const list = ctx.slots
          .entries("sidebar.panellist")
          .map((entry, index) => ({
            id: String(entry.options.id ?? index),
            order: entry.options.order ?? 0,
            label: typeof entry.options.label === "function" ? entry.options.label() : String(entry.options.label ?? ""),
            component: entry.component,
          }))
          .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
        panelCache.version = version;
        panelCache.list = list;
        return list;
      };

      /**
       * The shipped account feature, resolved from its own launcher entry
       * through the slot registry. Every surface this plugin renders reads this
       * one face, so one read and one refresh serve the whole feature.
       */
      const bridge = { entry: undefined, face: undefined, unsubscribe: undefined, listeners: new Set() };
      /** Listeners of the forwarded account snapshot (the rail's account entry). */
      const accountListeners = new Set();
      const notifyBridge = () => {
        for (const listener of [...bridge.listeners]) listener();
        for (const listener of [...accountListeners]) listener();
      };
      const releaseBridge = () => {
        // Notify only when something was actually released: listeners call back
        // into `resolveBridge`, and notifying unconditionally would recurse.
        const had = bridge.entry !== undefined;
        bridge.unsubscribe?.();
        bridge.unsubscribe = undefined;
        bridge.face = undefined;
        bridge.entry = undefined;
        if (had) notifyBridge();
      };
      let resolving = false;
      const resolveBridge = () => {
        if (resolving) return;
        const entry = ctx.slots.entries(LAUNCHER_SLOT).find((candidate) => candidate.component !== AccountLauncherShadow);
        if (entry === undefined || typeof entry.inject !== "function") {
          if (bridge.entry !== undefined) releaseBridge();
          return;
        }
        if (bridge.entry === entry) return;
        resolving = true;
        try {
          releaseBridge();
          const face = entry.inject();
          const source = face?.hooks?.account;
          if (source === undefined) return;
          bridge.entry = entry;
          bridge.face = face;
          bridge.unsubscribe = source.subscribe(notifyBridge);
          notifyBridge();
        } catch (_error) {
          releaseBridge();
        } finally {
          resolving = false;
        }
      };
      ctx.effect(() => () => releaseBridge(), "account-balance: account bridge lifetime");

      /**
       * The props the settings row hands to whichever entry holds the launcher
       * seat. The rail renders the account entry, so it reads them here.
       */
      const launcher = { props: {}, version: 0, listeners: new Set() };
      const settingsSource = {
        getSnapshot: () => launcher.props,
        subscribe: (listener) => {
          launcher.listeners.add(listener);
          return () => launcher.listeners.delete(listener);
        },
      };
      const publishLauncherProps = (ownerProps) => {
        launcher.props = ownerProps;
        launcher.version += 1;
        for (const listener of [...launcher.listeners]) listener();
      };

      /**
       * The account snapshot as the rail sees it: forwarded from whichever
       * shipped face is current, so the rail can register before that face
       * exists. The absent value is a constant, which keeps the hook contract's
       * referential stability.
       */
      const accountView = {
        getSnapshot: () => bridge.face?.hooks?.account?.getSnapshot() ?? ABSENT_ACCOUNT,
        subscribe: (listener) => {
          accountListeners.add(listener);
          return () => accountListeners.delete(listener);
        },
      };
      /** @returns the shipped operation, called only once a face exists. */
      const viaFace = (operation) => (...args) => bridge.face?.[operation]?.(...args);
      /**
       * The sidebar's own navigation face: the shipped entry owns "new session"
       * and panel selection, so the rail calls those instead of re-inventing them.
       */
      const sidebarFace = () => {
        const entry = ctx.slots.entries("sidebar").find((candidate) => typeof candidate.inject === "function");
        return entry === undefined ? undefined : entry.inject();
      };
      /** The active theme, cached per revision so the hook snapshot stays stable. */
      const themeCache = { key: "", value: { active: undefined, themes: [] } };
      const themeSnapshot = () => {
        const snapshot = ctx.theme.getTheme();
        const key = `${snapshot.active?.id ?? ""}:${snapshot.active?.colorScheme ?? ""}:${(snapshot.themes ?? []).length}`;
        if (themeCache.key !== key) {
          themeCache.key = key;
          themeCache.value = { active: snapshot.active, themes: snapshot.themes ?? [] };
        }
        return themeCache.value;
      };
      /** The account-facing props every surface shares. */
      const accountProps = {
        useAccount: accountView,
        refreshAccount: viaFace("refreshAccount"),
        signOut: viaFace("signOut"),
        hasRunningAccountTasks: viaFace("hasRunningAccountTasks"),
        contactUs: viaFace("contactUs"),
        openPlatformPage: viaFace("openPlatformPage"),
        openExternal: (url) => {
          if (typeof url !== "string" || url === "") return;
          window.open(url, "_blank", "noopener,noreferrer");
        },
        subscribeSessionExpired: (listener) => bridge.face?.subscribeSessionExpired?.(listener),
        subscribeModelSignInRequired: (listener) => bridge.face?.subscribeModelSignInRequired?.(listener),
      };

      // One launcher seat: the account entry (in the rail) while signed in, the
      // shipped menu otherwise.
      ctx.slots.inject(LAUNCHER_SLOT, () => {
        let unregister;
        const offSlots = ctx.slots.subscribe(LAUNCHER_SLOT, resolveBridge);
        const sync = () => {
          resolveBridge();
          const signedIn = bridge.face?.hooks?.account?.getSnapshot()?.view?.status === "credential-stored";
          if (bridge.face === undefined || !signedIn) {
            unregister?.();
            unregister = undefined;
            return;
          }
          unregister ??= ctx.slots.register(
            {
              name: LAUNCHER_SLOT,
              priority: SHADOW_PRIORITY,
              locale: NS,
              inject: () => ({ publish: publishLauncherProps }),
            },
            AccountLauncherShadow
          );
        };
        bridge.listeners.add(sync);
        sync();
        return () => {
          offSlots?.();
          bridge.listeners.delete(sync);
          unregister?.();
          unregister = undefined;
        };
      });

      // Codex's app rail: every registered app panel as an icon at the window's
      // left edge. It is click-through, so the shipped sidebar toggle keeps
      // working on top of it; the rail needs the panel registry and the layout's
      // panel selector, not the account.
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          {
            name: "shell.overlay",
            id: "account-rail",
            locale: NS,
            inject: () => ({
              hooks: {
                panels: {
                  getSnapshot: panelsSnapshot,
                  subscribe: (listener) => ctx.slots.subscribe("sidebar.panellist", listener),
                },
                account: accountView,
                settings: settingsSource,
                theme: {
                  getSnapshot: themeSnapshot,
                  subscribe: (listener) => ctx.on("theme/change", listener),
                },
              },
              startSession: () => sidebarFace()?.startSession?.(),
              setTheme: (themeId) => ctx.theme.setTheme(themeId),
              openSettings: () => launcher.props.openSettings?.(),
              refreshAccount: accountProps.refreshAccount,
              signOut: accountProps.signOut,
              hasRunningAccountTasks: accountProps.hasRunningAccountTasks,
              contactUs: accountProps.contactUs,
              openPlatformPage: accountProps.openPlatformPage,
              openExternal: accountProps.openExternal,
              subscribeSessionExpired: accountProps.subscribeSessionExpired,
              subscribeModelSignInRequired: accountProps.subscribeModelSignInRequired,
              selectPanel: (panelId) => ctx.layout.selectPanel(panelId),
            }),
          },
          AccountRail
        )
      );

      // Codex's quota card above the composer.
      ctx.slots.inject("conversation.input.dock", () => {
        let unregister;
        const sync = () => {
          if (bridge.face === undefined) {
            unregister?.();
            unregister = undefined;
            return;
          }
          unregister ??= ctx.slots.register(
            {
              name: "conversation.input.dock",
              id: "account-low-balance",
              order: 0,
              locale: NS,
              inject: () => sharedFace(bridge.face),
            },
            LowBalanceBanner
          );
        };
        bridge.listeners.add(sync);
        sync();
        return () => {
          bridge.listeners.delete(sync);
          unregister?.();
          unregister = undefined;
        };
      });
    }

    /**
     * Project the shipped account face into this menu's props, so both surfaces
     * read one snapshot and call one set of operations.
     * @param face - the shipped account launcher entry's inject face.
     * @returns this plugin's business props.
     */
    function sharedFace(face) {
      return {
        hooks: { account: face.hooks.account },
        refreshAccount: () => face.refreshAccount?.(),
        signOut: () => face.signOut(),
        hasRunningAccountTasks: () => face.hasRunningAccountTasks(),
        contactUs: () => face.contactUs(),
        openPlatformPage: (page, onClose) => face.openPlatformPage?.(page, onClose),
        openExternal: (url) => {
          if (typeof url !== "string" || url === "") return;
          window.open(url, "_blank", "noopener,noreferrer");
        },
        subscribeSessionExpired: (listener) => face.subscribeSessionExpired?.(listener),
        subscribeModelSignInRequired: (listener) => face.subscribeModelSignInRequired?.(listener),
      };
    }

    /**
     * Test seam for this package's own smoke test. The Loader only reads
     * `apply`/`inject`; these extra references let the test exercise the real
     * formatting rules and the real component tree without widening the
     * runtime contract.
     */
    exports.__internals = {
      formatBalance,
      currencySymbol,
      holdsCredit,
      centsOf,
      formatCents,
      availableSummary,
      lowBalanceThreshold,
      BalancePanel,
      AccountEntry,
      AccountLauncherShadow,
      AccountRail,
      RailIconBoundary,
      LowBalanceBanner,
    };

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
