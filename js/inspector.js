/**
 * inspector.js — Request / Response detail panel
 *
 * New API:  Inspector.init(containerEl)
 *           Mounts the panel into containerEl and listens for
 *           'entry:select' CustomEvents on document.
 *
 * Legacy:   Inspector.show(entry, redactSet)  — called directly by main.js
 *           Inspector.clear()
 */

'use strict';

const Inspector = (() => {

  // Sensitive header names (always highlighted in the UI)
  const SENSITIVE = new Set([
    'authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token',
  ]);

  let _containerEl  = null;
  let _activeTab    = 'headers';
  let _currentEntry = null;

  // ── init ───────────────────────────────────────────────────────────────────
  function init(containerEl) {
    _containerEl = containerEl;
    _showPlaceholder();

    // Listen for entry selection events dispatched on document
    document.addEventListener('entry:select', e => {
      _currentEntry = e.detail && e.detail.entry;
      const redactSet = (e.detail && e.detail.redactSet) || new Set();
      if (_currentEntry) _buildPanel(_containerEl, _currentEntry, redactSet);
    });
  }

  // ── show (legacy / direct call) ────────────────────────────────────────────
  function show(entry, redactSet) {
    _currentEntry = entry;
    const target  = _containerEl || document.getElementById('inspector-panel');
    if (!target) return;
    _buildPanel(target, entry, redactSet || new Set());
  }

  // ── clear ──────────────────────────────────────────────────────────────────
  function clear() {
    _currentEntry = null;
    const target = _containerEl || document.getElementById('inspector-panel');
    if (target) _showPlaceholder(target);
  }

  // ── Internal helpers ───────────────────────────────────────────────────────
  function _showPlaceholder(el) {
    const target = el || _containerEl;
    if (!target) return;
    target.innerHTML = '';
    const p = _mk('p', 'inspector-placeholder');
    p.textContent = 'Select a request to inspect.';
    target.appendChild(p);
  }

  // ── Main panel builder ─────────────────────────────────────────────────────
  function _buildPanel(container, entry, redactSet) {
    container.innerHTML = '';
    _activeTab = _activeTab || 'headers';

    // Summary strip
    container.appendChild(_buildSummary(entry));

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
    container.appendChild(tabBar);

    // Build each tab panel
    const headersPanel = _buildHeadersPanel(entry, redactSet);
    headersPanel.classList.add('inspector-tab-panel');
    if (_activeTab !== 'headers') headersPanel.classList.add('hidden');
    panels['headers'] = headersPanel;

    const timingsPanel = _buildTimingsPanel(entry);
    timingsPanel.classList.add('inspector-tab-panel');
    if (_activeTab !== 'timings') timingsPanel.classList.add('hidden');
    panels['timings'] = timingsPanel;

    const previewPanel = _buildPreviewPanel(entry);
    previewPanel.classList.add('inspector-tab-panel');
    if (_activeTab !== 'preview') previewPanel.classList.add('hidden');
    panels['preview'] = previewPanel;

    container.appendChild(headersPanel);
    container.appendChild(timingsPanel);
    container.appendChild(previewPanel);
  }

  // ── Summary strip ──────────────────────────────────────────────────────────
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

  // ── HEADERS tab ────────────────────────────────────────────────────────────
  function _buildHeadersPanel(entry, redactSet) {
    const panel = _mk('div');
    panel.appendChild(_buildHeadersSection('Request Headers',  entry.requestHeaders,  redactSet));
    panel.appendChild(_buildHeadersSection('Response Headers', entry.responseHeaders, redactSet));
    return panel;
  }

  function _buildHeadersSection(title, headers, redactSet) {
    const section = _mk('div', 'inspector-section');
    const h       = _mk('h4', 'inspector-section-title');

    // Collapsible toggle
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
      const table = _mk('table', 'headers-table');

      entries.forEach(([name, value]) => {
        const nameLower   = name.toLowerCase();
        const isSensitive = SENSITIVE.has(nameLower) || (redactSet && redactSet.has(nameLower));

        const tr    = _mk('tr', 'header-row' + (isSensitive ? ' header-sensitive' : ''));
        const tdName = _mk('td', 'header-name');
        const tdVal  = _mk('td', 'header-value');

        tdName.textContent = name;

        if (isSensitive) {
          // Highlight header name in red
          tdName.style.color = '#c94040';

          // Value span (also red) + Redact button
          const valueSpan = _mk('span', 'header-value-text');
          valueSpan.textContent = value;
          valueSpan.style.color = '#c94040';

          const redactBtn = _mk('button', 'btn-redact');
          redactBtn.type        = 'button';
          redactBtn.textContent = 'Redact';
          redactBtn.addEventListener('click', () => {
            valueSpan.textContent = '[REDACTED]';
            redactBtn.disabled    = true;
            redactBtn.textContent = 'Redacted';
            tr.classList.add('header-redacted');
          });

          tdVal.appendChild(valueSpan);
          tdVal.appendChild(redactBtn);
        } else {
          tdVal.textContent = value;
        }

        tr.appendChild(tdName);
        tr.appendChild(tdVal);
        table.appendChild(tr);
      });

      body.appendChild(table);
    }

    section.appendChild(body);
    return section;
  }

  // ── TIMINGS tab ────────────────────────────────────────────────────────────
  function _buildTimingsPanel(entry) {
    const panel   = _mk('div', 'inspector-section');
    const h       = _mk('h4', 'inspector-section-title');
    h.textContent = 'Timing Breakdown';
    panel.appendChild(h);

    const timings = entry.timings || {};
    const total   = entry.totalTime || 1;

    const phases = [
      { key: 'dns',     label: 'DNS',          color: 'var(--t-dns)'  },
      { key: 'connect', label: 'TCP Connect',   color: 'var(--t-conn)' },
      { key: 'ssl',     label: 'TLS / SSL',     color: '#c97dd4'       },
      { key: 'wait',    label: 'Wait (TTFB)',    color: 'var(--t-wait)' },
      { key: 'receive', label: 'Receive',        color: 'var(--t-recv)' },
      { key: 'blocked', label: 'Blocked',        color: 'var(--text-3)' },
      { key: 'send',    label: 'Send',           color: 'var(--accent)' },
    ];

    const table = _mk('table', 'timing-table');

    phases.forEach(function(phase) {
      const ms = (timings[phase.key] !== undefined) ? timings[phase.key] : -1;
      if (ms < 0) return;
      const pct = Math.min(100, (ms / total) * 100).toFixed(1);

      const tr = _mk('tr', 'timing-row');

      const tdLabel = _mk('td', 'timing-label');
      tdLabel.textContent = phase.label;

      const tdBar = _mk('td', 'timing-bar-cell');
      const track = _mk('div', 'timing-bar-track');
      const fill  = _mk('div', 'timing-bar-fill');
      fill.style.width      = pct + '%';
      fill.style.background = phase.color;
      track.appendChild(fill);
      tdBar.appendChild(track);

      const tdVal = _mk('td', 'timing-value');
      tdVal.textContent = _fmtMs(ms);

      tr.appendChild(tdLabel);
      tr.appendChild(tdBar);
      tr.appendChild(tdVal);
      table.appendChild(tr);
    });

    // Total row
    const totalRow = _mk('tr', 'timing-total-row');
    const ttdLabel = _mk('td', 'timing-label');
    ttdLabel.innerHTML = '<strong>Total</strong>';
    const ttdEmpty = _mk('td');
    const ttdVal   = _mk('td', 'timing-value');
    ttdVal.innerHTML = '<strong>' + _fmtMs(entry.totalTime) + '</strong>';
    totalRow.appendChild(ttdLabel);
    totalRow.appendChild(ttdEmpty);
    totalRow.appendChild(ttdVal);
    table.appendChild(totalRow);

    panel.appendChild(table);
    return panel;
  }

  // ── PREVIEW tab ────────────────────────────────────────────────────────────
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

  // ── DOM / formatting helpers ───────────────────────────────────────────────
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
    return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s';
  }

  function _fmtBytes(b) {
    if (b <= 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  }

  return { init, show, clear };

})();
