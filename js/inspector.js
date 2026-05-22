/**
 * inspector.js — Request / Response detail panel
 *
 * Public API:
 *   Inspector.init(containerEl)
 *   Inspector.show(entry, redactSet)
 *   Inspector.clear()
 *
 * Dispatches 'entry:select' CustomEvents from waterfall.js.
 */

'use strict';

// ── Copy icon SVG (12x12) ────────────────────────────────────────────────────
const COPY_ICON_SVG = "<svg width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='currentColor' stroke-width='1.5'><rect x='4' y='4' width='7' height='7' rx='1'/><path d='M3 8H2a1 1 0 01-1-1V2a1 1 0 011-1h5a1 1 0 011 1v1'/></svg>";

const Inspector = (() => {

  // ── Sensitive header names ───────────────────────────────────────────────────
  const SENSITIVE = new Set([
    'authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token',
  ]);

  // ── Term tooltip dictionary ──────────────────────────────────────────────────
  const TERM_TOOLTIPS = {
    'user-agent':      'Browser and OS identification sent with every request',
    'authorization':   'Credential token (Bearer, Basic) — often sensitive',
    'cookie':          'Session identifiers stored in browser — often sensitive',
    'set-cookie':      'Server instruction to store a cookie in the browser',
    'content-type':    'Format of the body (e.g. application/json)',
    'cache-control':   'Caching directives for browsers and proxies',
    'accept':          'Media types the client is willing to receive',
    'referer':         'URL of the page that initiated this request',
    'x-api-key':       'API authentication key — sensitive',
    'origin':          'Scheme+host+port that initiated the request',
    'content-length':  'Size of the response body in bytes',
    'location':        'Redirect destination URL',
    'x-request-id':    'Unique identifier for this request (for tracing)',
    'x-forwarded-for': 'Original client IP when behind a proxy',
    'dns':             'Domain Name System lookup — resolves hostname to IP address',
    'tcp':             'Transmission Control Protocol — establishes the connection',
    'tls':             'Transport Layer Security — encrypts the connection (HTTPS)',
    'ttfb':            'Time to First Byte — server processing + network latency',
    'receive':         'Time to download the response body',
  };

  // ── Tooltip singleton ────────────────────────────────────────────────────────
  const _tooltip = (() => {
    let el = null;

    function _ensureEl() {
      if (el && document.body.contains(el)) return el;
      el = document.getElementById('term-tooltip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'term-tooltip';
        el.setAttribute('role', 'tooltip');
        el.innerHTML = '<span class="tt-term"></span><span class="tt-body"></span>';
        document.body.appendChild(el);
      }
      return el;
    }

    let _hideTimer = null;

    function show(termEl, termKey) {
      const text = TERM_TOOLTIPS[termKey.toLowerCase()];
      if (!text) return;

      const tip = _ensureEl();
      clearTimeout(_hideTimer);

      tip.querySelector('.tt-term').textContent = termKey.toUpperCase();
      tip.querySelector('.tt-body').textContent = text;

      // Position above element, clamped to viewport
      const rect = termEl.getBoundingClientRect();
      const tipW = 240;

      tip.style.visibility = 'hidden';
      tip.style.opacity    = '0';
      tip.classList.remove('visible');
      tip.style.left       = rect.left + 'px';
      tip.style.top        = '0px';
      document.body.appendChild(tip);

      const tipH = tip.offsetHeight;
      const vpW  = window.innerWidth;

      let left = rect.left;
      let top;

      // Clamp horizontal
      if (left + tipW > vpW - 8) left = vpW - tipW - 8;
      if (left < 8)               left = 8;

      // Prefer above; fall back to below
      if (rect.top - tipH - 8 < 0) {
        top = rect.bottom + 6;
      } else {
        top = rect.top - tipH - 6;
      }

      tip.style.left       = left + 'px';
      tip.style.top        = top  + 'px';
      tip.style.visibility = 'visible';
      tip.classList.add('visible');
    }

    function hide(delay) {
      if (delay === undefined) delay = 80;
      _hideTimer = setTimeout(() => {
        const tip = _ensureEl();
        tip.classList.remove('visible');
      }, delay);
    }

    return { show, hide };
  })();

  // ── Bind tooltip to a .term element ─────────────────────────────────────────
  function _bindTooltip(termEl, termKey) {
    termEl.dataset.term = termKey;
    termEl.addEventListener('mouseenter', () => _tooltip.show(termEl, termKey));
    termEl.addEventListener('mouseleave', () => _tooltip.hide());
  }

  // ── Click-to-copy helper ─────────────────────────────────────────────────────
  function _bindCopyBtn(btn, getValueFn) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();

      const value = typeof getValueFn === 'function' ? getValueFn() : getValueFn;

      try {
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
      setTimeout(() => btn.classList.remove('copied'), 600);

      // Inject floating toast at cursor position
      const toast = document.createElement('div');
      toast.className = 'copy-toast';
      toast.textContent = 'Copied!';
      toast.style.cssText =
        'position:fixed;z-index:9999;pointer-events:none;' +
        'left:' + (e.clientX + 12) + 'px;' +
        'top:'  + (e.clientY - 28) + 'px;';
      document.body.appendChild(toast);

      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 1500);
    });
  }

  // ── Module state ─────────────────────────────────────────────────────────────
  let _containerEl  = null;
  let _activeTab    = 'headers';
  let _currentEntry = null;

  // ── init ─────────────────────────────────────────────────────────────────────
  function init(containerEl) {
    _containerEl = containerEl;
    _showPlaceholder();

    document.addEventListener('entry:select', e => {
      const payload = e.detail;
      _currentEntry = (payload && payload.entry) ? payload.entry : payload;
      const redactSet = (payload && payload.redactSet) || new Set();
      if (_currentEntry) _buildPanel(_containerEl, _currentEntry, redactSet);
    });
  }

  // ── show (legacy / direct call) ──────────────────────────────────────────────
  function show(entry, redactSet) {
    _currentEntry = entry;
    const target  = _containerEl || document.getElementById('inspector-panel');
    if (!target) return;
    _buildPanel(target, entry, redactSet || new Set());
  }

  // ── clear ────────────────────────────────────────────────────────────────────
  function clear() {
    _currentEntry = null;
    const target = _containerEl || document.getElementById('inspector-panel');
    if (target) _showPlaceholder(target);
  }

  // ── Placeholder ──────────────────────────────────────────────────────────────
  function _showPlaceholder(el) {
    const target = el || _containerEl;
    if (!target) return;
    target.innerHTML = '';
    const p = _mk('p', 'inspector-placeholder');
    p.textContent = 'Select a request to inspect.';
    target.appendChild(p);
  }

  // ── Main panel builder ───────────────────────────────────────────────────────
  function _buildPanel(container, entry, redactSet) {
    container.innerHTML = '';

    // Wrap all content in .inspector-panel-content so CSS slide-in fires each time
    const content = _mk('div', 'inspector-panel-content');

    _activeTab = _activeTab || 'headers';

    // Summary strip
    content.appendChild(_buildSummary(entry));

    // Tab bar
    const tabs   = ['headers', 'timings', 'preview'];
    const panels = {};
    const tabBar = _mk('div', 'inspector-tabs');

    tabs.forEach(tab => {
      const btn = _mk('button', 'inspector-tab' + (tab === _activeTab ? ' active' : ''));
      btn.type        = 'button';
      btn.dataset.tab = tab;
      btn.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
      btn.addEventListener('click', () => {
        _activeTab = tab;
        tabBar.querySelectorAll('.inspector-tab')
          .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        Object.entries(panels).forEach(([k, p]) => p.classList.toggle('hidden', k !== tab));
      });
      tabBar.appendChild(btn);
    });
    content.appendChild(tabBar);

    // Build each tab panel
    const headersPanel = _buildHeadersPanel(entry, redactSet);
    headersPanel.className = 'tab-panel' + (_activeTab !== 'headers' ? ' hidden' : '');
    panels['headers'] = headersPanel;

    const timingsPanel = _buildTimingsPanel(entry);
    timingsPanel.className = 'tab-panel' + (_activeTab !== 'timings' ? ' hidden' : '');
    panels['timings'] = timingsPanel;

    const previewPanel = _buildPreviewPanel(entry);
    previewPanel.className = 'tab-panel' + (_activeTab !== 'preview' ? ' hidden' : '');
    panels['preview'] = previewPanel;

    content.appendChild(headersPanel);
    content.appendChild(timingsPanel);
    content.appendChild(previewPanel);

    container.appendChild(content);
  }

  // ── Summary strip ────────────────────────────────────────────────────────────
  function _buildSummary(e) {
    const div    = _mk('div', 'inspector-summary');
    const status = e.status || 0;
    let statusCls = 'ok';
    if (status >= 500)      statusCls = 'err';
    else if (status >= 400) statusCls = 'warn';
    else if (status >= 300) statusCls = 'redirect';

    div.innerHTML =
      '<div class="inspector-summary-row">' +
        '<span class="badge-method method-' + _esc(e.method.toLowerCase()) + '">' + _esc(e.method) + '</span>' +
        '<span class="badge-status status-' + statusCls + '">' + status + ' ' + _esc(e.statusText || '') + '</span>' +
        '<span class="badge-type">' + _esc(e.type || '') + '</span>' +
        '<span class="inspector-time">' + _fmtMs(e.totalTime) + '</span>' +
        '<span class="inspector-size">' + _fmtBytes(Math.max(e.transferSize || 0, 0)) + '</span>' +
      '</div>' +
      '<div class="inspector-url" title="' + _esc(e.url) + '">' + _esc(e.url) + '</div>';
    return div;
  }

  // ── HEADERS tab ──────────────────────────────────────────────────────────────
  function _buildHeadersPanel(entry, redactSet) {
    const panel = _mk('div');
    panel.appendChild(_buildHeadersSection('Request Headers',  entry.requestHeaders,  redactSet));
    panel.appendChild(_buildHeadersSection('Response Headers', entry.responseHeaders, redactSet));
    return panel;
  }

  function _buildHeadersSection(title, headers, redactSet) {
    const section = _mk('div', 'inspector-section');
    const h       = _mk('h4', 'inspector-section-title');

    let collapsed = false;
    h.textContent  = title;
    h.style.cursor = 'pointer';
    h.addEventListener('click', () => {
      collapsed = !collapsed;
      body.classList.toggle('hidden', collapsed);
      h.classList.toggle('collapsed', collapsed);
    });
    section.appendChild(h);

    const body    = _mk('div', 'headers-body');
    const entries = Object.entries(headers || {});

    if (!entries.length) {
      const em = _mk('p', 'inspector-empty');
      em.textContent = 'No headers.';
      body.appendChild(em);
    } else {
      const list = _mk('div', 'hdr-list');

      entries.forEach(([name, value]) => {
        const nameLower   = name.toLowerCase();
        const isSensitive = SENSITIVE.has(nameLower) || (redactSet && redactSet.has(nameLower));

        // Build header row div
        const row = _mk('div', 'header-row' + (isSensitive ? ' sensitive' : ''));

        // Key span — add .term class if in TERM_TOOLTIPS
        const keySpan = _mk('span', 'header-key' + (TERM_TOOLTIPS[nameLower] ? ' term' : ''));
        keySpan.textContent = name;
        if (TERM_TOOLTIPS[nameLower]) {
          _bindTooltip(keySpan, nameLower);
        }

        // Colon separator
        const colonSpan = _mk('span', 'header-colon');
        colonSpan.textContent = ':';

        // Value span
        let currentValue = value;
        const valSpan = _mk('span', 'header-value');
        valSpan.textContent = value;

        // Copy button
        const copyBtn = _mk('button', 'btn-copy');
        copyBtn.type = 'button';
        copyBtn.title = 'Copy value';
        copyBtn.setAttribute('aria-label', 'Copy');
        copyBtn.innerHTML = COPY_ICON_SVG;
        _bindCopyBtn(copyBtn, () => currentValue);

        row.appendChild(keySpan);
        row.appendChild(colonSpan);
        row.appendChild(valSpan);
        row.appendChild(copyBtn);

        // Redact button for sensitive headers
        if (isSensitive) {
          const redactBtn = _mk('button', 'btn-redact');
          redactBtn.type        = 'button';
          redactBtn.textContent = 'Redact';
          redactBtn.addEventListener('click', () => {
            currentValue          = '████████';
            valSpan.textContent   = currentValue;
            redactBtn.disabled    = true;
            redactBtn.textContent = 'Redacted';
            row.classList.add('header-redacted');
          });
          row.appendChild(redactBtn);
        }

        list.appendChild(row);
      });

      body.appendChild(list);
    }

    section.appendChild(body);
    return section;
  }

  // ── TIMINGS tab ──────────────────────────────────────────────────────────────
  function _buildTimingsPanel(entry) {
    const panel   = _mk('div', 'inspector-section');
    const h       = _mk('h4', 'inspector-section-title');
    h.textContent = 'Timing Breakdown';
    panel.appendChild(h);

    const timings = entry.timings || {};
    const total   = entry.totalTime || 1;

    const phases = [
      { key: 'dns',     label: 'DNS',        color: '#9b72cf',        term: 'dns'     },
      { key: 'tcp',     label: 'TCP',         color: '#5ba3dc',        term: 'tcp'     },
      { key: 'tls',     label: 'TLS',         color: '#c97dd4',        term: 'tls'     },
      { key: 'wait',    label: 'Wait (TTFB)', color: '#e8a838',        term: 'ttfb'    },
      { key: 'receive', label: 'Receive',     color: '#3dba7a',        term: 'receive' },
      { key: 'blocked', label: 'Blocked',     color: 'var(--text-3)',  term: null      },
      { key: 'send',    label: 'Send',        color: 'var(--accent)',  term: null      },
    ];

    // Support old naming from HAR parser (connect/ssl)
    if (timings.tcp === undefined && timings.connect !== undefined) {
      timings.tcp = timings.connect;
    }
    if (timings.tls === undefined && timings.ssl !== undefined) {
      timings.tls = timings.ssl;
    }

    const table = _mk('table', 'timing-table');

    let shownTotal = 0;

    phases.forEach(function(phase) {
      const ms = (timings[phase.key] !== undefined) ? timings[phase.key] : -1;
      if (ms < 0) return;

      shownTotal += ms;

      const barW = Math.round(Math.min(120, (ms / total) * 120));

      const tr = _mk('tr', 'timing-row');

      // Label cell — possibly with tooltip
      const tdLabel = _mk('td', 'timing-label-cell');
      const labelSpan = _mk('span', phase.term ? 'timing-label term' : 'timing-label');
      labelSpan.textContent = phase.label;
      if (phase.term && TERM_TOOLTIPS[phase.term]) {
        _bindTooltip(labelSpan, phase.term);
      }
      tdLabel.appendChild(labelSpan);

      // Mini-bar cell
      const tdBar = _mk('td', 'timing-bar-cell');
      const barEl = _mk('div', 'timing-mini-bar');
      barEl.style.cssText =
        'display:inline-block;height:8px;border-radius:2px;' +
        'width:' + barW + 'px;' +
        'background:' + phase.color + ';' +
        'vertical-align:middle;';
      tdBar.appendChild(barEl);

      // Value cell
      const tdVal = _mk('td', 'timing-value');
      tdVal.textContent = _fmtMs(ms);

      tr.appendChild(tdLabel);
      tr.appendChild(tdBar);
      tr.appendChild(tdVal);
      table.appendChild(tr);
    });

    // Total row
    const totalRow = _mk('tr', 'timing-total-row');
    const ttdLabel = _mk('td', 'timing-label-cell');
    ttdLabel.innerHTML = '<strong>Total</strong>';
    const ttdBar   = _mk('td', 'timing-bar-cell');
    const ttdVal   = _mk('td', 'timing-value');
    ttdVal.innerHTML = '<strong>' + _fmtMs(entry.totalTime) + '</strong>';
    totalRow.appendChild(ttdLabel);
    totalRow.appendChild(ttdBar);
    totalRow.appendChild(ttdVal);
    table.appendChild(totalRow);

    panel.appendChild(table);
    return panel;
  }

  // ── PREVIEW tab ──────────────────────────────────────────────────────────────
  function _buildPreviewPanel(entry) {
    const panel   = _mk('div', 'inspector-section');
    const h       = _mk('h4', 'inspector-section-title');
    h.textContent = 'Response Preview';
    panel.appendChild(h);

    const body = entry.responseContent || entry.responseBody;
    let text   = '';

    if (body && typeof body === 'object') {
      if (body.text) {
        text = body.text;
        const mime = (body.mimeType || '').toLowerCase();
        if (mime.includes('json')) {
          try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (_e) { /* keep raw */ }
        }
      } else if (body.encoding === 'base64') {
        text = '[base64 encoded \u2014 ' + _fmtBytes((body.text || '').length * 0.75) + ']';
      }
    } else if (typeof body === 'string') {
      text = body;
    }

    const pre = _mk('pre', 'body-preview');
    pre.textContent = text || '(empty)';
    panel.appendChild(pre);
    return panel;
  }

  // ── DOM / formatting helpers ─────────────────────────────────────────────────
  function _mk(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _fmtMs(ms) {
    if (ms == null || ms < 0) return 'n/a';
    return ms < 1000 ? Math.round(ms) + '\u202fms' : (ms / 1000).toFixed(2) + '\u202fs';
  }

  function _fmtBytes(b) {
    if (b <= 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + '\u202f' + u[i];
  }

  return { init, show, clear };

})();
