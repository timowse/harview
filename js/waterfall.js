/**
 * waterfall.js — Vanilla-JS table-based network waterfall chart.
 *
 * Public API:
 *   Waterfall.renderWaterfall(entries, container)
 *   Waterfall.getFilteredEntries()   → Array of currently visible entries
 *   Waterfall.render(entries, onSelect)  (backward-compat wrapper for main.js)
 *   Waterfall.clear()
 *
 * Row click dispatches: document.dispatchEvent(new CustomEvent('entry:select', { detail: entry }))
 */

'use strict';

const Waterfall = (() => {

  // ── Design-spec colors ───────────────────────────────────────────────────────
  const PHASE_COLORS = {
    dns:     '#9b72cf',
    tcp:     '#5ba3dc',
    tls:     '#c97dd4',
    wait:    '#e8a838',
    receive: '#3dba7a',
  };

  const STATUS_COLORS = {
    2: '#3dba7a',
    3: '#5ba3dc',
    4: '#e07b4f',
    5: '#c94040',
  };

  const METHOD_STYLES = {
    GET:     { bg: 'rgba(61,186,122,0.15)',   color: '#3dba7a' },
    POST:    { bg: 'rgba(232,168,56,0.12)',   color: '#e8a838' },
    PUT:     { bg: 'rgba(91,163,220,0.15)',   color: '#5ba3dc' },
    DELETE:  { bg: 'rgba(201,64,64,0.15)',    color: '#c94040' },
    PATCH:   { bg: 'rgba(201,125,212,0.15)',  color: '#c97dd4' },
    HEAD:    { bg: 'rgba(78,80,89,0.25)',     color: '#8b8d96' },
    OPTIONS: { bg: 'rgba(78,80,89,0.25)',     color: '#8b8d96' },
  };

  // ── Module state ─────────────────────────────────────────────────────────────
  let _currentEntries = [];
  let _onSelect       = null;  // optional callback for backward-compat

  // ── Main render function ─────────────────────────────────────────────────────
  /**
   * Render the waterfall table into `container`.
   * @param {Array}           entries   - Parsed HAR entry objects
   * @param {HTMLElement|string} container - DOM element or element id
   */
  function renderWaterfall(entries, container) {
    _currentEntries = Array.isArray(entries) ? entries : [];

    if (typeof container === 'string') {
      container = document.getElementById(container);
    }
    if (!container) return;

    container.innerHTML = '';

    if (_currentEntries.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'wf-empty';
      msg.textContent = 'No requests match the current filters.';
      container.appendChild(msg);
      return;
    }

    // ── Timeline bounds ───────────────────────────────────────────────────────
    const minStart     = Math.min(..._currentEntries.map(e => e.startOffset || 0));
    const maxEnd       = Math.max(..._currentEntries.map(e => (e.startOffset || 0) + (e.totalTime || 0)));
    const totalDuration = Math.max(maxEnd - minStart, 1);

    // ── Table ─────────────────────────────────────────────────────────────────
    const wrap  = document.createElement('div');
    wrap.className = 'wf-wrap';

    const table = document.createElement('table');
    table.className = 'wf-table';
    table.setAttribute('role', 'grid');

    table.appendChild(_buildHead());

    const tbody = document.createElement('tbody');
    _currentEntries.forEach((entry, idx) => {
      tbody.appendChild(_buildRow(entry, idx, minStart, totalDuration));
    });
    table.appendChild(tbody);

    wrap.appendChild(table);
    wrap.appendChild(_buildLegend());
    container.appendChild(wrap);
  }

  // ── Table header ─────────────────────────────────────────────────────────────
  function _buildHead() {
    const thead = document.createElement('thead');
    const tr    = document.createElement('tr');

    const cols = [
      { label: 'Status',    cls: 'wf-col-status'    },
      { label: 'Method',    cls: 'wf-col-method'    },
      { label: 'Domain',    cls: 'wf-col-domain'    },
      { label: 'Path',      cls: 'wf-col-path'      },
      { label: 'Type',      cls: 'wf-col-type'      },
      { label: 'Size',      cls: 'wf-col-size'      },
      { label: 'Time',      cls: 'wf-col-time'      },
      { label: 'Waterfall', cls: 'wf-col-waterfall' },
    ];

    cols.forEach(col => {
      const th = document.createElement('th');
      th.className = col.cls;
      th.textContent = col.label;
      tr.appendChild(th);
    });

    thead.appendChild(tr);
    return thead;
  }

  // ── Single table row ─────────────────────────────────────────────────────────
  function _buildRow(entry, idx, minStart, totalDuration) {
    const tr = document.createElement('tr');
    tr.className = 'wf-row' + (idx % 2 === 0 ? ' wf-row-even' : ' wf-row-odd');
    tr.title = entry.url || '';
    tr.setAttribute('role', 'row');
    tr.setAttribute('tabindex', '0');

    // Click: deselect others, select this row, dispatch event
    const _handleSelect = () => {
      const tbody = tr.parentNode;
      if (tbody) {
        tbody.querySelectorAll('.wf-row-selected')
             .forEach(r => r.classList.remove('wf-row-selected'));
      }
      tr.classList.add('wf-row-selected');
      document.dispatchEvent(new CustomEvent('entry:select', { detail: entry }));
      if (_onSelect) _onSelect(entry);
    };

    tr.addEventListener('click', _handleSelect);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') _handleSelect(); });

    // ── Status badge ──────────────────────────────────────────────────────────
    const statusClass = Math.floor((entry.status || 0) / 100);
    const statusColor = STATUS_COLORS[statusClass] || '#8b8d96';

    const tdStatus = document.createElement('td');
    tdStatus.className = 'wf-col-status';
    const badge = document.createElement('span');
    badge.className = 'wf-badge wf-badge-status';
    badge.textContent = entry.status || '—';
    badge.style.borderColor = statusColor;
    badge.style.color        = statusColor;
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    // ── Method tag ────────────────────────────────────────────────────────────
    const method   = (entry.method || 'GET').toUpperCase();
    const mStyle   = METHOD_STYLES[method] || { bg: 'rgba(78,80,89,0.25)', color: '#8b8d96' };

    const tdMethod = document.createElement('td');
    tdMethod.className = 'wf-col-method';
    const methodTag = document.createElement('span');
    methodTag.className = 'wf-badge wf-badge-method';
    methodTag.textContent = method;
    methodTag.style.background = mStyle.bg;
    methodTag.style.color      = mStyle.color;
    tdMethod.appendChild(methodTag);
    tr.appendChild(tdMethod);

    // ── Domain ────────────────────────────────────────────────────────────────
    const tdDomain = document.createElement('td');
    tdDomain.className = 'wf-col-domain';
    tdDomain.textContent = entry.domain || _getDomain(entry.url);
    tr.appendChild(tdDomain);

    // ── Path ──────────────────────────────────────────────────────────────────
    const tdPath = document.createElement('td');
    tdPath.className = 'wf-col-path';
    tdPath.textContent = entry.path || _getPath(entry.url);
    tr.appendChild(tdPath);

    // ── Type chip ─────────────────────────────────────────────────────────────
    const tdType = document.createElement('td');
    tdType.className = 'wf-col-type';
    const typeChip = document.createElement('span');
    typeChip.className = 'wf-chip wf-type-' + (entry.type || 'other');
    typeChip.textContent = entry.type || 'other';
    tdType.appendChild(typeChip);
    tr.appendChild(tdType);

    // ── Size ──────────────────────────────────────────────────────────────────
    const tdSize = document.createElement('td');
    tdSize.className = 'wf-col-size';
    const rawSize = entry.size != null ? entry.size : entry.transferSize;
    tdSize.textContent = _fmtBytes(rawSize);
    tr.appendChild(tdSize);

    // ── Time ──────────────────────────────────────────────────────────────────
    const tdTime = document.createElement('td');
    tdTime.className = 'wf-col-time';
    tdTime.textContent = _fmtMs(entry.totalTime || 0);
    tr.appendChild(tdTime);

    // ── Waterfall bar ─────────────────────────────────────────────────────────
    const tdWf = document.createElement('td');
    tdWf.className = 'wf-col-waterfall';
    tdWf.appendChild(_buildBar(entry, minStart, totalDuration));
    tr.appendChild(tdWf);

    return tr;
  }

  // ── Waterfall bar ────────────────────────────────────────────────────────────
  /**
   * Builds a bar track containing coloured timing-phase segments.
   * The bar is positioned absolutely within a 100%-wide track that
   * spans the entire timeline.
   *
   * Bar left  = (entry.startOffset - minStart) / totalDuration × 100%
   * Bar width = entry.totalTime / totalDuration × 100%
   * Segment widths are proportional to totalTime (the bar width).
   */
  function _buildBar(entry, minStart, totalDuration) {
    const track = document.createElement('div');
    track.className = 'wf-bar-track';

    const startOffset   = (entry.startOffset || 0) - minStart;
    const totalTime     = entry.totalTime || 0;
    const leftPct       = (startOffset   / totalDuration) * 100;
    const widthPct      = Math.max((totalTime / totalDuration) * 100, 0.08);

    const bar = document.createElement('div');
    bar.className = 'wf-bar';
    bar.style.left  = leftPct.toFixed(4)  + '%';
    bar.style.width = widthPct.toFixed(4) + '%';

    // Support both old (connect/ssl) and new (tcp/tls) naming from parser
    const t = entry.timings || {};
    const dns     = Math.max(t.dns     || 0, 0);
    const tcp     = Math.max(t.tcp     || t.connect || 0, 0);
    const tls     = Math.max(t.tls     || t.ssl     || 0, 0);
    const wait    = Math.max(t.wait    || 0, 0);
    const receive = Math.max(t.receive || 0, 0);

    // Skip blocked/send — they appear as an implicit gap before dns
    const phases = [
      { name: 'dns',     val: dns,     color: PHASE_COLORS.dns     },
      { name: 'tcp',     val: tcp,     color: PHASE_COLORS.tcp     },
      { name: 'tls',     val: tls,     color: PHASE_COLORS.tls     },
      { name: 'wait',    val: wait,    color: PHASE_COLORS.wait    },
      { name: 'receive', val: receive, color: PHASE_COLORS.receive },
    ];

    let cum = 0;
    let rendered = 0;

    phases.forEach(phase => {
      if (phase.val > 0 && totalTime > 0) {
        const seg = document.createElement('div');
        seg.className     = 'wf-seg wf-seg-' + phase.name;
        seg.style.cssText =
          'position:absolute;top:0;bottom:0;' +
          'left:'  + ((cum          / totalTime) * 100).toFixed(4) + '%;' +
          'width:' + ((phase.val    / totalTime) * 100).toFixed(4) + '%;' +
          'background:' + phase.color + ';';
        seg.title = phase.name.toUpperCase() + ': ' + _fmtMs(phase.val);
        bar.appendChild(seg);
        rendered++;
      }
      cum += phase.val;
    });

    // Fallback: no timing data → solid grey bar
    if (rendered === 0) {
      const seg = document.createElement('div');
      seg.className = 'wf-seg wf-seg-unknown';
      seg.style.cssText = 'position:absolute;top:0;bottom:0;left:0;width:100%;background:#4e5059;';
      seg.title = _fmtMs(totalTime);
      bar.appendChild(seg);
    }

    track.appendChild(bar);
    return track;
  }

  // ── Legend ───────────────────────────────────────────────────────────────────
  function _buildLegend() {
    const wrap = document.createElement('div');
    wrap.className = 'wf-legend';

    const phases = [
      { label: 'DNS',      color: PHASE_COLORS.dns     },
      { label: 'TCP',      color: PHASE_COLORS.tcp     },
      { label: 'TLS',      color: PHASE_COLORS.tls     },
      { label: 'Wait/TTFB',color: PHASE_COLORS.wait    },
      { label: 'Receive',  color: PHASE_COLORS.receive },
    ];

    phases.forEach(p => {
      const item = document.createElement('span');
      item.className = 'wf-legend-item';

      const dot = document.createElement('span');
      dot.className        = 'wf-legend-dot';
      dot.style.background = p.color;

      item.appendChild(dot);
      item.appendChild(document.createTextNode(p.label));
      wrap.appendChild(item);
    });

    return wrap;
  }

  // ── Public helpers ───────────────────────────────────────────────────────────
  /**
   * Returns a shallow copy of the currently rendered entries (for export etc.).
   * @returns {Array}
   */
  function getFilteredEntries() {
    return _currentEntries.slice();
  }

  // ── Backward-compat wrapper (called by main.js as Waterfall.render()) ────────
  function render(entries, onSelect) {
    _onSelect = onSelect || null;
    const container = document.getElementById('waterfall-container');
    renderWaterfall(entries, container);
  }

  function clear() {
    _currentEntries = [];
    _onSelect       = null;
    const container = document.getElementById('waterfall-container');
    if (container) container.innerHTML = '';
  }

  // ── Private utilities ────────────────────────────────────────────────────────
  function _getDomain(url) {
    try { return new URL(url).hostname; } catch (_) { return ''; }
  }

  function _getPath(url) {
    try {
      const u = new URL(url);
      return u.pathname + (u.search ? u.search : '');
    } catch (_) {
      return url || '';
    }
  }

  function _fmtBytes(bytes) {
    if (bytes == null || bytes < 0) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + '\u202f' + units[i];
  }

  function _fmtMs(ms) {
    if (ms == null || ms < 0) return '—';
    if (ms < 1000) return Math.round(ms) + '\u202fms';
    return (ms / 1000).toFixed(2) + '\u202fs';
  }

  // ── Exports ──────────────────────────────────────────────────────────────────
  return {
    renderWaterfall,
    getFilteredEntries,
    // backward-compat
    render,
    clear,
  };

})();

// ES-module-friendly export (no-op in plain <script> usage)
if (typeof module !== 'undefined') module.exports = Waterfall;
