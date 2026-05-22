# harview — Design Spec v1.0
## Features 1–5: Precise CSS + JS Implementation Guide

> All CSS variables reference the established design system in `css/style.css`.
> All JS patterns integrate with the existing `Inspector` IIFE in `inspector.js`.
> Devs: copy rules verbatim. Do not invent new variables.

---

## FEATURE 1 — CURSOR + ROW HOVER

### CSS

```css
/* ── Waterfall Row ──────────────────────────────────────────── */

/* Base row */
.wf-row {
  cursor: pointer;
  border-left: 2px solid transparent;          /* reserves space, no jump on hover */
  transition:
    background-color 150ms ease,
    border-left-color 150ms ease;
}

/* Hover state */
.wf-row:hover {
  background-color: var(--surf-hover);          /* #1f2023 */
  border-left-color: var(--accent-dim);         /* #b07d22 — muted amber, not full accent */
}

/* Selected / active row */
.wf-row.selected {
  background-color: var(--accent-faint);        /* rgba(232,168,56,0.06) */
  border-left-color: var(--accent);             /* #e8a838 — full amber on selected */
}

/* Selected + hover (keep border, slightly brighter bg) */
.wf-row.selected:hover {
  background-color: var(--accent-glow);         /* rgba(232,168,56,0.12) */
  border-left-color: var(--accent);
}

/* Focused row (keyboard navigation — Tab/ArrowUp/ArrowDown) */
.wf-row:focus-visible {
  outline: none;
  border-left-color: var(--accent);
  background-color: var(--surf-hover);
}
```

### Notes
- `border-left: 2px solid transparent` on the base MUST exist to prevent layout shift on hover.
- `var(--surf-hover)` (#1f2023) is already in the root — use it, don't hardcode.
- Selected rows should also receive `tabindex="0"` in the JS so keyboard nav works.

---

## FEATURE 2 — INSPECTOR PANEL REDESIGN

### 2a — Tab Bar

```css
/* ── Inspector Tab Bar ──────────────────────────────────────── */

.inspector-tabs {
  display: flex;
  align-items: stretch;
  background: var(--surf-1);                    /* one step below panel bg */
  border-bottom: 1px solid var(--border);
  padding: 0 12px;
  gap: 0;
  flex-shrink: 0;
}

/* Each tab button — kill ALL browser defaults */
.inspector-tab {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;         /* indicator slot */
  border-radius: 0;
  padding: 9px 14px 7px;                        /* 7px bottom = 9px - 2px border */
  margin-bottom: -1px;                          /* sit on top of tab bar border */
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
  cursor: pointer;
  white-space: nowrap;
  transition:
    color 150ms ease,
    border-bottom-color 150ms ease;
  outline: none;
  user-select: none;
}

/* Hover (inactive) */
.inspector-tab:hover {
  color: var(--text-2);
}

/* Active tab */
.inspector-tab.active {
  color: var(--text-1);
  border-bottom-color: var(--accent);           /* amber underline indicator */
}

/* Active hover — keep amber, brighten text slightly */
.inspector-tab.active:hover {
  color: var(--text-1);
}

/* Focus-visible for accessibility */
.inspector-tab:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}
```

### 2b — Tab Panel Wrapper

```css
.inspector-tab-panel {
  padding: 12px;
  overflow-y: auto;
  flex: 1;
}
```

### 2c — Header List

HTML structure for each header row:

```html
<div class="hdr-row" data-sensitive="false">
  <span class="hdr-key">content-type</span>
  <span class="hdr-sep">:</span>
  <span class="hdr-val">
    <span class="hdr-val-text">application/json</span>
    <button class="copy-btn" aria-label="Copy value" title="">
      <!-- SVG defined in Feature 3 -->
    </button>
  </span>
</div>
```

```css
/* ── Header List ────────────────────────────────────────────── */

.hdr-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Section label above request/response blocks */
.hdr-section-label {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 10px 0 5px;
  border-bottom: 1px solid var(--border-faint);
  margin-bottom: 4px;
}

.hdr-row {
  display: grid;
  grid-template-columns: 180px 10px 1fr;        /* key | colon | value */
  align-items: baseline;
  padding: 3px 0;
  border-bottom: 1px solid var(--border-faint);
  min-height: 24px;
  position: relative;
}

.hdr-row:last-child {
  border-bottom: none;
}

/* Key: amber-dim, monospace */
.hdr-key {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-dim);                     /* #b07d22 — amber dimmed */
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* tooltip trigger */
  cursor: default;
  position: relative;
}

/* Mark keys that have term tooltips */
.hdr-key[data-tooltip] {
  cursor: help;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--accent-dim);
  text-underline-offset: 2px;
}

/* Colon separator */
.hdr-sep {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  padding: 0 2px;
  user-select: none;
}

/* Value wrapper — flex to hold text + copy btn */
.hdr-val {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.hdr-val-text {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);                         /* #8b8d96 */
  word-break: break-all;
  flex: 1;
}
```

### 2d — Sensitive Header Row

HTML: add `data-sensitive="true"` to `.hdr-row`.

```css
/* ── Sensitive Header Rows ──────────────────────────────────── */

.hdr-row[data-sensitive="true"] {
  background-color: rgba(201, 64, 64, 0.04);    /* faint red wash */
  border-left: 2px solid var(--err);            /* red left stripe */
  padding-left: 6px;
  margin-left: -8px;                            /* compensate for padding-left on panel */
}

.hdr-row[data-sensitive="true"] .hdr-key {
  color: var(--err);                            /* red key for sensitive */
}

.hdr-row[data-sensitive="true"] .hdr-val-text {
  color: var(--text-2);                         /* value unchanged */
}

/* Redact button */
.redact-btn {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 1px solid var(--err);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  color: var(--err);
  cursor: pointer;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    background-color 120ms ease,
    color 120ms ease;
  outline: none;
  align-self: center;
}

.redact-btn:hover {
  background-color: var(--err-dim);             /* rgba(201,64,64,0.15) */
  color: #e05555;
}

.redact-btn:focus-visible {
  outline: 1px solid var(--err);
  outline-offset: 2px;
}

/* Redacted state — value replaced with ████ */
.hdr-row[data-redacted="true"] .hdr-val-text {
  color: var(--text-3);
  letter-spacing: 1px;
}
```

HTML for sensitive row with Redact button:

```html
<div class="hdr-row" data-sensitive="true" data-redacted="false">
  <span class="hdr-key" data-tooltip="authorization">authorization</span>
  <span class="hdr-sep">:</span>
  <span class="hdr-val">
    <span class="hdr-val-text">Bearer eyJhbGci...</span>
    <button class="redact-btn" aria-label="Redact value">Redact</button>
    <button class="copy-btn" aria-label="Copy value"><!-- SVG --></button>
  </span>
</div>
```

---

## FEATURE 3 — CLICK-TO-COPY

### Copy Icon SVG (12x12)

Inline this SVG in every `.copy-btn`. It uses `currentColor` so CSS color controls it.

```html
<button class="copy-btn" aria-label="Copy value">
  <svg class="copy-icon" width="12" height="12" viewBox="0 0 12 12"
       fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- Back rect -->
    <rect x="3.5" y="3.5" width="6" height="7" rx="1"
          stroke="currentColor" stroke-width="1" fill="none"/>
    <!-- Front rect -->
    <rect x="1.5" y="1.5" width="6" height="7" rx="1"
          stroke="currentColor" stroke-width="1"
          fill="var(--surf-2)" />
  </svg>
</button>
```

### CSS

```css
/* ── Copy Button ────────────────────────────────────────────── */

.copy-btn {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  padding: 2px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-3);                         /* dim by default */
  opacity: 0;                                   /* hidden until row hover */
  pointer-events: none;
  transition:
    opacity 120ms ease,
    color 150ms ease;
  outline: none;
  position: relative;
}

/* Show copy btn when parent row is hovered */
.hdr-row:hover .copy-btn,
.wf-row:hover .copy-btn {
  opacity: 1;
  pointer-events: auto;
}

/* Hover state on the button itself */
.copy-btn:hover {
  color: var(--text-2);
}

/* Copied state — flash green */
.copy-btn.copied {
  color: var(--ok);                             /* #3dba7a */
}

.copy-icon {
  display: block;
  pointer-events: none;
}

/* ── Copied Tooltip ─────────────────────────────────────────── */

/* Injected by JS: <span class="copy-toast">Copied!</span> */
.copy-toast {
  position: absolute;
  bottom: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--surf-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--ok);
  padding: 2px 7px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 200;
  /* Fade-out animation */
  animation: copy-toast-fade 1.5s ease forwards;
}

@keyframes copy-toast-fade {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
  60%  { opacity: 1; transform: translateX(-50%) translateY(-2px); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
}
```

### JS Pattern

Add this utility function to `inspector.js` (inside the IIFE, before the `return`):

```js
// ── Click-to-Copy ────────────────────────────────────────────
function _bindCopyBtn(btn, getValueFn) {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();                        // don't select the row

    let value;
    try {
      value = typeof getValueFn === 'function' ? getValueFn() : getValueFn;
      await navigator.clipboard.writeText(value);
    } catch (_) {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    // Green flash on icon
    btn.classList.add('copied');

    // Inject toast
    const toast = document.createElement('span');
    toast.className = 'copy-toast';
    toast.textContent = 'Copied!';
    // Remove previous toast if any (rapid double-click)
    btn.querySelector('.copy-toast')?.remove();
    btn.appendChild(toast);

    // Clean up after animation completes (1.5s)
    setTimeout(() => {
      btn.classList.remove('copied');
      toast.remove();
    }, 1500);
  });
}
```

Usage when building a header row:

```js
const copyBtn = _mk('button', 'copy-btn');
copyBtn.setAttribute('aria-label', 'Copy value');
copyBtn.innerHTML = COPY_ICON_SVG;              // define as a const string at top of file
_bindCopyBtn(copyBtn, () => headerValue);
```

---

## FEATURE 4 — HOVER TOOLTIPS (Term Explanations)

### Tooltip Component CSS

```css
/* ── Term Tooltip ───────────────────────────────────────────── */

/* Singleton tooltip element — create once, reuse for all terms */
#term-tooltip {
  position: fixed;                              /* fixed so it escapes overflow:hidden */
  z-index: 9999;
  pointer-events: none;
  max-width: 240px;
  background: var(--surf-3);                    /* #242529 */
  border: 1px solid var(--border);
  border-top: 1px solid var(--accent);          /* amber top stripe */
  border-radius: var(--radius-sm);
  padding: 7px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-2);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.5),
    0 1px 3px rgba(0, 0, 0, 0.4);
  /* Appear animation */
  opacity: 0;
  transition: opacity 100ms ease;
  will-change: opacity, transform;
}

#term-tooltip.visible {
  opacity: 1;
}

/* Term name in tooltip header */
#term-tooltip .tt-term {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--accent-dim);                     /* #b07d22 */
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

/* Tooltip body text */
#term-tooltip .tt-body {
  display: block;
  color: var(--text-2);
}
```

### Tooltip Term Dictionary

Paste this const into `inspector.js` near the top of the IIFE, right after `const SENSITIVE`:

```js
const TERM_TOOLTIPS = {
  // HTTP Headers
  'user-agent':      'Browser and OS identification string sent with every request',
  'authorization':   'Credential token (Bearer, Basic) — often sensitive',
  'cookie':          'Session identifiers stored in browser — often sensitive',
  'set-cookie':      'Server instruction to store a cookie in the browser',
  'content-type':    'Format of the request/response body (e.g. application/json)',
  'cache-control':   'Caching directives for browsers and proxy servers',
  'accept':          'Media types the client is willing to receive',
  'referer':         'URL of the page that initiated this request',
  'x-api-key':       'API authentication key — sensitive',
  'origin':          'The origin (scheme+host+port) that initiated the request',
  // Timing labels
  'dns':             'Domain Name System lookup — resolves hostname to IP address',
  'tcp':             'Transmission Control Protocol — establishes the connection',
  'tls':             'Transport Layer Security — encrypts the connection (HTTPS)',
  'ttfb':            'Time to First Byte — server processing + network latency',
  // General terms
  'mime':            'Multipurpose Internet Mail Extensions — describes content format',
  'har':             'HTTP Archive format — records browser network activity',
  'blocked':         'Time request was queued before connecting',
  'receive':         'Time to download the response body',
};
```

### Tooltip JS Module

Add this block inside the IIFE, after `TERM_TOOLTIPS`:

```js
// ── Tooltip singleton setup ───────────────────────────────────
const _tooltip = (() => {
  let el = document.getElementById('term-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'term-tooltip';
    el.setAttribute('role', 'tooltip');
    el.innerHTML = '<span class="tt-term"></span><span class="tt-body"></span>';
    document.body.appendChild(el);
  }
  let _hideTimer = null;

  function show(termEl, termKey) {
    const text = TERM_TOOLTIPS[termKey.toLowerCase()];
    if (!text) return;

    clearTimeout(_hideTimer);
    el.querySelector('.tt-term').textContent = termKey.toUpperCase();
    el.querySelector('.tt-body').textContent = text;

    // Position: above the element, clamped to viewport
    const rect   = termEl.getBoundingClientRect();
    const tipW   = 240;
    let   left   = rect.left;
    let   top    = rect.top - 8;                // will be adjusted after measuring

    el.style.visibility = 'hidden';
    el.style.opacity    = '0';
    el.classList.remove('visible');
    el.style.left       = left + 'px';
    el.style.top        = '0px';
    document.body.appendChild(el);             // re-append to reset stacking

    const tipH   = el.offsetHeight;
    const vpW    = window.innerWidth;
    const vpH    = window.innerHeight;

    // Clamp horizontal
    if (left + tipW > vpW - 8) left = vpW - tipW - 8;
    if (left < 8)               left = 8;

    // Prefer above; fall back to below
    if (rect.top - tipH - 8 < 0) {
      top = rect.bottom + 6;
    } else {
      top = rect.top - tipH - 6;
    }

    el.style.left       = left + 'px';
    el.style.top        = top  + 'px';
    el.style.visibility = 'visible';
    el.classList.add('visible');
  }

  function hide(delay = 80) {
    _hideTimer = setTimeout(() => {
      el.classList.remove('visible');
    }, delay);
  }

  return { show, hide };
})();

// ── Bind tooltip to an element ────────────────────────────────
// Call this after creating any element that should show a tooltip.
// termKey must match a key in TERM_TOOLTIPS.
function _bindTooltip(el, termKey) {
  el.dataset.tooltip = termKey;
  el.addEventListener('mouseenter', () => _tooltip.show(el, termKey));
  el.addEventListener('mouseleave', () => _tooltip.hide());
  el.addEventListener('focus',      () => _tooltip.show(el, termKey));
  el.addEventListener('blur',       () => _tooltip.hide(0));
}
```

### Usage in `_buildHeadersPanel`

When creating a header key element, check `TERM_TOOLTIPS`:

```js
const keyEl = _mk('span', 'hdr-key');
keyEl.textContent = name.toLowerCase();
const tooltipKey = name.toLowerCase();
if (TERM_TOOLTIPS[tooltipKey]) {
  _bindTooltip(keyEl, tooltipKey);
}
```

When creating timing label elements in `_buildTimingsPanel`:

```js
const labelEl = _mk('span', 'timing-label');
labelEl.textContent = label;
const tlKey = label.toLowerCase();
if (TERM_TOOLTIPS[tlKey]) {
  _bindTooltip(labelEl, tlKey);
}
```

---

## FEATURE 5 — ANIMATIONS

All animations are pure CSS. No JS needed except where noted.

### 5a — Row Selection Fade (150ms)

Already covered in Feature 1. The transition properties on `.wf-row` handle this:

```css
.wf-row {
  transition:
    background-color 150ms ease,
    border-left-color 150ms ease;
}
```

No changes needed here — just ensure `background-color` is always transitioned, not set via `!important`.

### 5b — Inspector Panel Slide-In (200ms)

Apply this class to the inspector panel container when an entry is selected.
Remove it (and re-add after a microtask) to re-trigger on each new selection.

```css
/* ── Inspector slide-in ─────────────────────────────────────── */

@keyframes inspector-slide-in {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.inspector-panel {
  /* existing layout rules stay; add: */
  animation: none;                              /* off by default */
}

.inspector-panel.animating {
  animation: inspector-slide-in 200ms ease-out both;
}
```

JS trigger in `_buildPanel`:

```js
function _buildPanel(container, entry, redactSet) {
  container.innerHTML = '';
  // Re-trigger animation
  container.classList.remove('animating');
  void container.offsetWidth;                  // force reflow
  container.classList.add('animating');
  // ... rest of builder
}
```

### 5c — Tab Content Fade (150ms)

```css
/* ── Tab panel fade ─────────────────────────────────────────── */

@keyframes tab-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.inspector-tab-panel {
  animation: tab-fade-in 150ms ease both;
}

/* When hidden class is toggled off (panel becomes visible), animation re-runs
   because the element is re-inserted into the render tree.
   No extra JS needed beyond the existing classList.toggle('hidden') pattern. */
```

JS: the existing tab-switch code in `inspector.js` already calls `classList.toggle('hidden', ...)`.
The animation fires automatically when `hidden` is removed because the browser re-computes the style.
No changes to JS needed.

### 5d — Copy Success: Icon Color + Toast Fade

```css
/* Icon color transition — smooth green flash */
.copy-btn {
  /* already declared above; ensure color is in transition list */
  transition:
    opacity 120ms ease,
    color 150ms ease;
}

/* .copied class applied by JS */
.copy-btn.copied .copy-icon {
  color: var(--ok);                             /* transitions via parent */
}

/* Toast fade — defined in Feature 3 */
/* @keyframes copy-toast-fade already declared there */
```

### 5e — Drop Zone Glow Pulse

The drop zone shows a pulsing amber glow when a file is dragged over it.

```css
/* ── Drop Zone ──────────────────────────────────────────────── */

@keyframes drop-glow-pulse {
  0%   { box-shadow: 0 0 0 0 var(--accent-glow); border-color: var(--accent-dim); }
  50%  { box-shadow: 0 0 0 6px var(--accent-glow); border-color: var(--accent); }
  100% { box-shadow: 0 0 0 0 var(--accent-glow); border-color: var(--accent-dim); }
}

.drop-zone {
  /* existing layout rules */
  border: 1px dashed var(--border);
  transition: border-color 200ms ease, background-color 200ms ease;
}

.drop-zone.drag-over {
  border-color: var(--accent-dim);
  background-color: var(--accent-faint);
  animation: drop-glow-pulse 1.2s ease-in-out infinite;
}
```

JS (in main.js drop zone handlers):

```js
dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()  => { dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop',      (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  // ... existing file handling
});
```

### 5f — File Load: Waterfall Row Stagger-In

Apply inline `--row-index` CSS custom property to each row. The animation
delays cascade based on index.

```css
/* ── Waterfall row stagger ──────────────────────────────────── */

@keyframes row-stagger-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.wf-row {
  /* existing rules plus: */
  animation: row-stagger-in 180ms ease-out both;
  animation-delay: calc(var(--row-index, 0) * 20ms);
}

/* Cap the delay at ~50 rows to avoid long waits on huge HARs */
/* (handled in JS — see below) */
```

JS: when rendering rows in `waterfall.js` (or wherever `.wf-row` elements are created):

```js
rows.forEach((entry, i) => {
  const row = document.createElement('div');
  row.className = 'wf-row';
  // Cap at 50 to prevent 1s+ delays on large HARs
  row.style.setProperty('--row-index', Math.min(i, 50));
  // ... rest of row construction
});
```

### 5g — Chip Active State (120ms)

Filter/method chips use the existing `.chip` class pattern.

```css
/* ── Chips ──────────────────────────────────────────────────── */

.chip {
  /* existing layout + font rules; add: */
  transition:
    background-color 120ms ease,
    color 120ms ease,
    border-color 120ms ease;
}

.chip.active {
  background-color: var(--accent-faint);        /* rgba(232,168,56,0.06) */
  border-color: var(--accent-dim);              /* #b07d22 */
  color: var(--accent);                         /* #e8a838 */
}

.chip:hover:not(.active) {
  background-color: var(--surf-hover);
  border-color: var(--text-3);
  color: var(--text-1);
}
```

---

## COPY_ICON_SVG Constant

Place this at the top of `inspector.js`, right after `'use strict';`:

```js
const COPY_ICON_SVG = `<svg class="copy-icon" width="12" height="12" viewBox="0 0 12 12"
  fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="3.5" y="3.5" width="6" height="7" rx="1"
        stroke="currentColor" stroke-width="1" fill="none"/>
  <rect x="1.5" y="1.5" width="6" height="7" rx="1"
        stroke="currentColor" stroke-width="1" fill="var(--surf-2)"/>
</svg>`;
```

---

## CSS FILE PLACEMENT GUIDE

Add the new rules to `css/style.css` in this order after the existing sections:

```
/* ── Waterfall Row Interaction ── */     (Feature 1)
/* ── Inspector Tabs ──────────── */     (Feature 2a)
/* ── Header List ─────────────── */     (Feature 2b-c)
/* ── Sensitive Headers ────────── */    (Feature 2d)
/* ── Copy Button ──────────────── */    (Feature 3)
/* ── Term Tooltip ─────────────── */    (Feature 4)
/* ── Animations ───────────────── */    (Feature 5, all keyframes + triggers)
```

---

## IMPLEMENTATION CHECKLIST

Feature 1:
  [ ] Add `border-left: 2px solid transparent` to existing `.wf-row` base rule
  [ ] Add `.wf-row:hover`, `.wf-row.selected`, `.wf-row.selected:hover` rules
  [ ] Confirm `--surf-hover` is already in `:root` (it is — #1f2023)

Feature 2:
  [ ] Remove any `appearance: button` or inherited UA styles from `.inspector-tab`
  [ ] Confirm `margin-bottom: -1px` on tab buttons aligns with tab bar border
  [ ] Add `data-sensitive` attr in JS when building header rows
  [ ] Wire Redact button: on click, set `data-redacted="true"`, replace value text with `"████████"`, change btn text to "Reveal"

Feature 3:
  [ ] Define `COPY_ICON_SVG` const at top of inspector.js
  [ ] Define `_bindCopyBtn(btn, getValueFn)` helper inside IIFE
  [ ] Call `_bindCopyBtn` wherever copy buttons are appended

Feature 4:
  [ ] Define `TERM_TOOLTIPS` const inside IIFE
  [ ] Create singleton `#term-tooltip` element in `_tooltip` setup block
  [ ] Call `_bindTooltip(el, key)` for header keys and timing labels that match dict keys
  [ ] Ensure `#term-tooltip` is appended to `document.body` (not inside a scrolling container)

Feature 5:
  [ ] Add `inspector-panel` class + `animating` class logic to `_buildPanel`
  [ ] Set `--row-index` CSS custom property on each `.wf-row` (capped at 50)
  [ ] Add `.drag-over` class in drop zone event handlers
  [ ] Confirm `.hidden` toggle on tab panels allows CSS animation to re-fire
