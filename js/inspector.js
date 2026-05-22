/**
 * inspector.js — Request/Response detail panel
 * Shows headers, timing breakdown, body preview for a selected HAR entry.
 */

'use strict';

const Inspector = (() => {

  // ── Show entry details ─────────────────────────────────────────────────────
  function show(entry, redactSet) {
    const panel = document.getElementById('inspector-panel');
    if (!panel) return;
    panel.innerHTML = '';
    panel.classList.remove('hidden');

    panel.appendChild(buildSummary(entry));
    panel.appendChild(buildTimingBreakdown(entry));
    panel.appendChild(buildHeadersSection('Request Headers', entry.requestHeaders, redactSet));
    panel.appendChild(buildHeadersSection('Response Headers', entry.responseHeaders, redactSet));
    if (entry.requestBody) panel.appendChild(buildBodySection('Request Body', entry.requestBody));
    if (entry.responseContent) panel.appendChild(buildBodySection('Response Body', entry.responseContent));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  function buildSummary(e) {
    const div = el('div', 'inspector-section inspector-summary');
    div.innerHTML = `
      <h3 class="inspector-title">
        <span class="badge method-badge method-${e.method.toLowerCase()}">${e.method}</span>
        <span class="status-badge status-${Math.floor(e.status/100)}xx">${e.status} ${e.statusText}</span>
        <span class="type-badge">${e.type}</span>
      </h3>
      <div class="url-full" title="${escHtml(e.url)}">${escHtml(e.url)}</div>
      <div class="inspector-meta">
        <span><strong>Total:</strong> ${fmtMs(e.totalTime)}</span>
        <span><strong>Size:</strong> ${fmtBytes(Math.max(e.transferSize, 0))}</span>
        <span><strong>Started:</strong> ${e.startedDateTime || 'unknown'}</span>
      </div>
    `;
    return div;
  }

  // ── Timing breakdown ────────────────────────────────────────────────────────
  function buildTimingBreakdown(e) {
    const section = el('div', 'inspector-section');
    section.appendChild(sectionTitle('Timing Breakdown'));

    const phases = [
      { key: 'blocked', label: 'Blocked'   },
      { key: 'dns',     label: 'DNS'       },
      { key: 'connect', label: 'Connect'   },
      { key: 'ssl',     label: 'TLS/SSL'   },
      { key: 'send',    label: 'Send'      },
      { key: 'wait',    label: 'Wait (TTFB)' },
      { key: 'receive', label: 'Receive'   },
    ];

    const total = e.totalTime || 1;
    const table = el('table', 'timing-table');
    phases.forEach(({ key, label }) => {
      const ms = e.timings[key] ?? -1;
      if (ms < 0) return;
      const pct = Math.min(100, (ms / total) * 100).toFixed(1);
      const tr  = el('tr');
      tr.innerHTML = `
        <td class="timing-label">${label}</td>
        <td class="timing-bar-cell">
          <div class="timing-bar-inner phase-${key}" style="width:${pct}%"></div>
        </td>
        <td class="timing-value">${fmtMs(ms)}</td>
      `;
      table.appendChild(tr);
    });

    const totalRow = el('tr', 'timing-total-row');
    totalRow.innerHTML = `<td>Total</td><td></td><td class="timing-value">${fmtMs(e.totalTime)}</td>`;
    table.appendChild(totalRow);

    section.appendChild(table);
    return section;
  }

  // ── Headers table ──────────────────────────────────────────────────────────
  function buildHeadersSection(title, headers, redactSet) {
    const section = el('div', 'inspector-section');
    const titleEl = sectionTitle(title);

    // Collapse toggle
    let collapsed = false;
    titleEl.style.cursor = 'pointer';
    titleEl.addEventListener('click', () => {
      collapsed = !collapsed;
      body.classList.toggle('hidden', collapsed);
      titleEl.classList.toggle('collapsed', collapsed);
    });
    section.appendChild(titleEl);

    const body = el('div', 'headers-body');
    const entries = Object.entries(headers || {});

    if (entries.length === 0) {
      body.innerHTML = '<p class="empty-msg">No headers.</p>';
    } else {
      const table = el('table', 'headers-table');
      entries.forEach(([name, value]) => {
        const isRedacted = redactSet && redactSet.has(name.toLowerCase());
        const tr = el('tr', isRedacted ? 'header-redacted' : '');
        tr.innerHTML = `
          <td class="header-name">${escHtml(name)}</td>
          <td class="header-value">${isRedacted ? '<em>[redacted]</em>' : escHtml(value)}</td>
        `;
        table.appendChild(tr);
      });
      body.appendChild(table);
    }

    section.appendChild(body);
    return section;
  }

  // ── Body preview ───────────────────────────────────────────────────────────
  function buildBodySection(title, bodyData) {
    const section = el('div', 'inspector-section');
    section.appendChild(sectionTitle(title));

    const pre = el('pre', 'body-preview');
    let text = '';

    if (typeof bodyData === 'object') {
      if (bodyData.text) {
        text = bodyData.text;
        const mime = (bodyData.mimeType || '').toLowerCase();
        if (mime.includes('json')) {
          try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {}
        }
      } else if (bodyData.encoding === 'base64') {
        text = '[base64 encoded — ' + fmtBytes((bodyData.text || '').length * 0.75) + ']';
      }
    } else if (typeof bodyData === 'string') {
      text = bodyData;
    }

    pre.textContent = text || '(empty)';
    section.appendChild(pre);
    return section;
  }

  // ── Clear panel ────────────────────────────────────────────────────────────
  function clear() {
    const panel = document.getElementById('inspector-panel');
    if (panel) {
      panel.innerHTML = '<p class="inspector-placeholder">Select a request to inspect.</p>';
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function el(tag, cls = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function sectionTitle(text) {
    const h = el('h4', 'inspector-section-title');
    h.textContent = text;
    return h;
  }
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fmtMs(ms) {
    if (ms < 0) return 'n/a';
    return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s';
  }
  function fmtBytes(b) {
    if (b <= 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  }

  return { show, clear };

})();
