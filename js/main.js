/**
 * main.js — Application entry point.
 * Wires up all modules: drag-and-drop, file loading, filters, waterfall, inspector, exporter.
 */

'use strict';

const App = (() => {

  // ── Module state ──────────────────────────────────────────────────────────────
  let currentHarData = null;  // full parsed result {entries, pages, meta, errors}
  let currentFilename = '';   // original filename for export
  let currentFiltered = [];   // currently visible entries after filtering

  // ── Bootstrap ─────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  function init() {

    // 1. Init filters into #filter-bar (chip/new-API mode)
    const filterBarEl = document.getElementById('filter-bar');
    if (filterBarEl) Filters.init(filterBarEl);

    // 2. Init inspector into #inspector-panel
    const inspectorEl = document.getElementById('inspector-panel');
    if (inspectorEl) Inspector.init(inspectorEl);

    // 3. Drop zone setup
    //    #drop-overlay is the full-screen backdrop (drag events)
    //    #drop-zone    is the inner clickable area  (click events)
    const dropOverlay  = document.getElementById('drop-overlay');
    const dropZone     = document.getElementById('drop-zone');
    const fileInput    = document.getElementById('file-input');
    const filePickerBtn = document.getElementById('file-picker-btn');

    if (dropOverlay) {
      // Drag highlight on the inner visual area
      ['dragenter', 'dragover'].forEach(ev =>
        dropOverlay.addEventListener(ev, e => {
          e.preventDefault();
          if (dropZone) dropZone.classList.add('drag-over');
        })
      );
      ['dragleave', 'dragend', 'drop'].forEach(ev =>
        dropOverlay.addEventListener(ev, e => {
          e.preventDefault();
          if (dropZone) dropZone.classList.remove('drag-over');
        })
      );
      dropOverlay.addEventListener('drop', e => {
        const file = e.dataTransfer && e.dataTransfer.files[0];
        if (file) loadFile(file);
      });
    }

    // Click on the inner drop zone → open file picker
    if (dropZone) {
      dropZone.addEventListener('click', () => fileInput && fileInput.click());
      dropZone.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput && fileInput.click(); }
      });
    }

    // "Browse file" button inside the drop zone
    if (filePickerBtn) {
      filePickerBtn.addEventListener('click', e => {
        e.stopPropagation(); // don't bubble to dropZone's click handler
        fileInput && fileInput.click();
      });
    }

    // 4. File input change
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
      });
    }

    // 5. Listen for filters:changed event dispatched by Filters module
    document.addEventListener('filters:changed', e => {
      if (!currentHarData) return; // ignore events fired before a file is loaded
      currentFiltered = (e.detail && e.detail.filtered) || [];
      Waterfall.render(currentFiltered, null);
      updateCountsUI(currentFiltered);
    });

    // 6. Export button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (currentHarData) {
          Exporter.exportSanitizedHAR(currentHarData, currentFilename);
        }
      });
    }

    // "Open File" / "Load new" in the top bar
    const loadNewBtn = document.getElementById('load-new-btn');
    if (loadNewBtn) loadNewBtn.addEventListener('click', resetApp);

    // Logo as reset trigger
    const logoReset = document.getElementById('logo-reset');
    if (logoReset) logoReset.addEventListener('click', resetApp);

    // Error banner dismiss
    const errorClose = document.getElementById('error-close');
    if (errorClose) {
      errorClose.addEventListener('click', () => {
        const banner = document.getElementById('error-banner');
        if (banner) banner.classList.add('hidden');
      });
    }
  }

  // ── File loading ──────────────────────────────────────────────────────────────
  function loadFile(file) {
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.har') && file.type !== 'application/json') {
      showError('Please drop a valid .har file.');
      return;
    }

    showLoading(true);

    const reader = new FileReader();

    reader.onload = e => {
      try {
        const result = HARParser.parseText(e.target.result);

        if (result.errors && result.errors.length && result.entries.length === 0) {
          showLoading(false);
          showError('Failed to parse HAR file: ' + result.errors.join(' | '));
          return;
        }

        currentHarData = result;
        currentFilename = file.name;
        currentFiltered  = result.entries.slice();

        if (result.errors && result.errors.length) {
          showError('Parsed with warnings: ' + result.errors.join(' | '), /*isWarning=*/true);
        }

        showLoading(false);
        transitionToApp();

        // Update filename display in the topbar pill
        setElText('file-pill-name', file.name);

        // Populate filter chips with real method/type data
        Filters.populate(result.entries);

        // Render the waterfall
        Waterfall.render(currentFiltered, null);

        // Update all stats UI
        updateStatsUI(result, currentFiltered);

      } catch (err) {
        showLoading(false);
        showError('Unexpected error: ' + err.message);
      }
    };

    reader.onerror = () => {
      showLoading(false);
      showError('Could not read file.');
    };

    reader.readAsText(file);
  }

  // ── View transitions ──────────────────────────────────────────────────────────
  function transitionToApp() {
    const dropOverlay = document.getElementById('drop-overlay');
    const appShell    = document.getElementById('app-shell');
    const topbar      = document.getElementById('topbar');
    const statusbar   = document.getElementById('statusbar');
    if (dropOverlay) dropOverlay.classList.add('hidden');
    if (appShell)    appShell.classList.remove('hidden');
    if (topbar)      topbar.classList.remove('hidden');
    if (statusbar)   statusbar.classList.remove('hidden');
  }

  function resetApp() {
    currentHarData  = null;
    currentFilename = '';
    currentFiltered = [];

    const dropOverlay = document.getElementById('drop-overlay');
    const appShell    = document.getElementById('app-shell');
    const topbar      = document.getElementById('topbar');
    const statusbar   = document.getElementById('statusbar');
    if (dropOverlay) dropOverlay.classList.remove('hidden');
    if (appShell)    appShell.classList.add('hidden');
    if (topbar)      topbar.classList.add('hidden');
    if (statusbar)   statusbar.classList.add('hidden');

    Waterfall.clear();
    Inspector.clear();

    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';

    // Reset filename pill
    setElText('file-pill-name', '—');
  }

  // ── Stats UI helpers ──────────────────────────────────────────────────────────
  /**
   * Called once on first load — updates all static stat elements.
   * @param {Object} harResult   - Full parsed HAR {entries, meta, pages, errors}
   * @param {Array}  filtered    - Filtered entries to display
   */
  function updateStatsUI(harResult, filtered) {
    const total  = harResult.entries.length;
    const counts = computeStats(filtered);

    // ── Topbar meta pills ──
    setElText('meta-requests', filtered.length);
    setElText('meta-duration', fmtMs(counts.duration));
    setElText('meta-size',     fmtBytes(counts.transfer));
    setElText('meta-errors',   counts.errors > 0 ? counts.errors : '—');

    // ── Sidebar summary grid ──
    setElText('stat-requests', filtered.length);
    setElText('stat-duration', fmtMs(counts.duration));
    setElText('stat-size',     fmtBytes(counts.transfer));
    setElText('stat-slowest',  fmtMs(counts.slowest));

    // ── Sidebar status chip counts ──
    setElText('count-2xx', filtered.filter(e => e.status >= 200 && e.status < 300).length);
    setElText('count-3xx', filtered.filter(e => e.status >= 300 && e.status < 400).length);
    setElText('count-4xx', filtered.filter(e => e.status >= 400 && e.status < 500).length);
    setElText('count-5xx', filtered.filter(e => e.status >= 500).length);

    // ── Filter bar request counts ──
    setElText('count-filtered', filtered.length);
    setElText('count-total',    total);

    // ── Statusbar ──
    setElText('sb-filtered', filtered.length);
    setElText('sb-total',    total);
    setElText('sb-size',     fmtBytes(counts.transfer));
    setElText('sb-duration', fmtMs(counts.duration));

    // ── Sidebar mini timeline ──
    buildMiniTimeline(filtered);
  }

  /**
   * Called on every filter change — updates counts and stats for the current filtered set.
   * @param {Array} filtered
   */
  function updateCountsUI(filtered) {
    if (!currentHarData) return;
    const total  = currentHarData.entries.length;
    const counts = computeStats(filtered);

    // Topbar
    setElText('meta-requests', filtered.length);
    setElText('meta-duration', fmtMs(counts.duration));
    setElText('meta-size',     fmtBytes(counts.transfer));
    setElText('meta-errors',   counts.errors > 0 ? counts.errors : '—');

    // Sidebar summary
    setElText('stat-requests', filtered.length);
    setElText('stat-duration', fmtMs(counts.duration));
    setElText('stat-size',     fmtBytes(counts.transfer));
    setElText('stat-slowest',  fmtMs(counts.slowest));

    // Sidebar status chips
    setElText('count-2xx', filtered.filter(e => e.status >= 200 && e.status < 300).length);
    setElText('count-3xx', filtered.filter(e => e.status >= 300 && e.status < 400).length);
    setElText('count-4xx', filtered.filter(e => e.status >= 400 && e.status < 500).length);
    setElText('count-5xx', filtered.filter(e => e.status >= 500).length);

    // Filter bar
    setElText('count-filtered', filtered.length);
    setElText('count-total',    total);

    // Statusbar
    setElText('sb-filtered', filtered.length);
    setElText('sb-total',    total);
    setElText('sb-size',     fmtBytes(counts.transfer));
    setElText('sb-duration', fmtMs(counts.duration));

    // Sidebar timeline
    buildMiniTimeline(filtered);
  }

  /**
   * Compute aggregate stats for an entries array.
   */
  function computeStats(entries) {
    if (!entries || entries.length === 0) {
      return { duration: 0, transfer: 0, errors: 0, slowest: 0 };
    }
    const transfer = entries.reduce((s, e) => s + Math.max(e.transferSize || 0, 0), 0);
    const minStart = Math.min(...entries.map(e => e.startOffset || 0));
    const maxEnd   = Math.max(...entries.map(e => (e.startOffset || 0) + (e.totalTime || 0)));
    const duration = Math.max(0, maxEnd - minStart);
    const errors   = entries.filter(e => e.status >= 400 || e.status === 0).length;
    const slowest  = Math.max(...entries.map(e => e.totalTime || 0));
    return { duration, transfer, errors, slowest };
  }

  // ── Mini timeline ─────────────────────────────────────────────────────────────
  function buildMiniTimeline(entries) {
    const container = document.getElementById('timeline-mini');
    if (!container) return;
    container.innerHTML = '';
    if (!entries.length) return;

    const maxTime = Math.max(...entries.map(e => e.totalTime || 0));
    if (maxTime === 0) return;

    entries.slice(0, 120).forEach(e => {
      const bar = document.createElement('div');
      bar.className   = 'timeline-bar';
      const pct = Math.max(2, ((e.totalTime || 0) / maxTime) * 100);
      bar.style.width = pct + '%';
      if (e.status >= 500)      bar.style.background = 'var(--err)';
      else if (e.status >= 400) bar.style.background = 'var(--warn)';
      else if (e.status >= 300) bar.style.background = 'var(--redirect)';
      else                       bar.style.background = 'var(--ok)';
      container.appendChild(bar);
    });
  }

  // ── Error / loading helpers ───────────────────────────────────────────────────
  function showError(msg, isWarning) {
    const banner = document.getElementById('error-banner');
    const text   = document.getElementById('error-text');
    if (!banner) { console.error('[harview]', msg); return; }
    banner.classList.remove('hidden', 'warning', 'error');
    banner.classList.add(isWarning ? 'warning' : 'error');
    if (text) text.textContent = msg;
  }

  function showLoading(show) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.classList.toggle('hidden', !show);
  }

  // ── DOM helper ────────────────────────────────────────────────────────────────
  function setElText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  // ── Formatters ────────────────────────────────────────────────────────────────
  function fmtBytes(bytes) {
    if (!bytes || bytes <= 0) return '0\u202fB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + '\u202f' + units[i];
  }

  function fmtMs(ms) {
    if (ms == null || ms < 0) return '—';
    if (ms === 0) return '0\u202fms';
    if (ms < 1000) return Math.round(ms) + '\u202fms';
    return (ms / 1000).toFixed(2) + '\u202fs';
  }

  // ── Public surface (minimal — mostly used for debugging) ──────────────────────
  return {
    getHarData:   () => currentHarData,
    getFiltered:  () => currentFiltered,
    getFilename:  () => currentFilename,
  };

})();
