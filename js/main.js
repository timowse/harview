/**
 * main.js — Application entry point
 * Handles drag & drop, file picker, orchestrates all modules.
 */

'use strict';

const App = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let state = {
    harData    : null,   // raw parsed HAR result {meta,entries,pages,errors}
    filtered   : [],     // currently filtered entries
    selected   : null,   // selected entry for inspector
  };

  // ── DOM refs (populated on DOMContentLoaded) ───────────────────────────────
  let els = {};

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    els = {
      dropZone      : document.getElementById('drop-zone'),
      fileInput     : document.getElementById('file-input'),
      filePicker    : document.getElementById('file-picker-btn'),
      appShell      : document.getElementById('app-shell'),
      landingView   : document.getElementById('landing-view'),
      toolbar       : document.getElementById('toolbar'),
      stats         : document.getElementById('stats-bar'),
      errorBanner   : document.getElementById('error-banner'),
      errorText     : document.getElementById('error-text'),
      errorClose    : document.getElementById('error-close'),
      loadNewBtn    : document.getElementById('load-new-btn'),
      exportBtn     : document.getElementById('export-btn'),
      fileName      : document.getElementById('file-name'),
    };

    bindDropZone();
    bindFilePicker();
    bindToolbarActions();
    Filters.init(onFilterChange);
  }

  // ── Drop zone ──────────────────────────────────────────────────────────────
  function bindDropZone() {
    const dz = els.dropZone;
    if (!dz) return;

    ['dragenter', 'dragover'].forEach(evt =>
      dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('drag-over'); })
    );
    ['dragleave', 'dragend', 'drop'].forEach(evt =>
      dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove('drag-over'); })
    );

    dz.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    });

    // Also allow click on the drop zone itself
    dz.addEventListener('click', () => els.fileInput && els.fileInput.click());
  }

  // ── File picker ────────────────────────────────────────────────────────────
  function bindFilePicker() {
    const btn = els.filePicker;
    const inp = els.fileInput;
    if (btn && inp) {
      btn.addEventListener('click', e => { e.stopPropagation(); inp.click(); });
      inp.addEventListener('change', () => {
        if (inp.files[0]) loadFile(inp.files[0]);
      });
    }
  }

  // ── Toolbar actions ────────────────────────────────────────────────────────
  function bindToolbarActions() {
    if (els.loadNewBtn) {
      els.loadNewBtn.addEventListener('click', resetToLanding);
    }
    if (els.exportBtn) {
      els.exportBtn.addEventListener('click', () => {
        if (state.harData) {
          const redactList = Filters.getRedactList();
          Exporter.exportSanitized(state.harData, redactList);
        }
      });
    }
    if (els.errorClose) {
      els.errorClose.addEventListener('click', () => {
        els.errorBanner && els.errorBanner.classList.add('hidden');
      });
    }
  }

  // ── File loading ───────────────────────────────────────────────────────────
  function loadFile(file) {
    if (!file.name.toLowerCase().endsWith('.har') && file.type !== 'application/json') {
      showError('Please drop a valid .har file.');
      return;
    }

    showLoading(true);

    const reader = new FileReader();

    reader.onload = e => {
      try {
        const result = HARParser.parseText(e.target.result);

        if (result.errors.length && result.entries.length === 0) {
          showLoading(false);
          showError('Failed to parse HAR file: ' + result.errors.join(' | '));
          return;
        }

        state.harData = result;
        state.filtered = [...result.entries];
        state.selected = null;

        if (result.errors.length) {
          showError('Parsed with warnings: ' + result.errors.join(' | '), true);
        }

        // Update file name display
        if (els.fileName) els.fileName.textContent = file.name;

        showLoading(false);
        transitionToApp();

        Filters.populate(result.entries);
        renderAll();

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

  // ── Render cycle ───────────────────────────────────────────────────────────
  function renderAll() {
    updateStats();
    Waterfall.render(state.filtered, onEntrySelect);
    Inspector.clear();
  }

  function onFilterChange(filtered) {
    state.filtered = filtered;
    renderAll();
    if (state.selected && !filtered.find(e => e.index === state.selected.index)) {
      state.selected = null;
      Inspector.clear();
    }
  }

  function onEntrySelect(entry) {
    state.selected = entry;
    Inspector.show(entry, Filters.getRedactList());
  }

  // ── Stats bar ──────────────────────────────────────────────────────────────
  function updateStats() {
    if (!els.stats) return;
    const entries = state.filtered;
    const total   = entries.length;
    const totalSize = entries.reduce((s, e) => s + Math.max(e.transferSize, 0), 0);
    const totalTime = entries.length
      ? (() => {
          const minStart = Math.min(...entries.map(e => e.startOffset));
          const maxEnd   = Math.max(...entries.map(e => e.startOffset + e.totalTime));
          return maxEnd - minStart;
        })()
      : 0;

    els.stats.innerHTML = `
      <span class="stat"><strong>${total}</strong> requests</span>
      <span class="stat"><strong>${formatBytes(totalSize)}</strong> transferred</span>
      <span class="stat"><strong>${formatMs(totalTime)}</strong> total</span>
      <span class="stat">(${state.harData.entries.length} total in HAR)</span>
    `;
  }

  // ── View transitions ───────────────────────────────────────────────────────
  function transitionToApp() {
    els.landingView && els.landingView.classList.add('hidden');
    els.appShell    && els.appShell.classList.remove('hidden');
  }

  function resetToLanding() {
    state = { harData: null, filtered: [], selected: null };
    els.landingView && els.landingView.classList.remove('hidden');
    els.appShell    && els.appShell.classList.add('hidden');
    Waterfall.clear();
    Inspector.clear();
    if (els.fileInput) els.fileInput.value = '';
  }

  // ── Error display ──────────────────────────────────────────────────────────
  function showError(msg, isWarning = false) {
    if (!els.errorBanner) { console.error(msg); return; }
    els.errorBanner.classList.remove('hidden', 'warning', 'error');
    els.errorBanner.classList.add(isWarning ? 'warning' : 'error');
    if (els.errorText) els.errorText.textContent = msg;
  }

  function showLoading(show) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.classList.toggle('hidden', !show);
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  function formatBytes(bytes) {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + units[i];
  }

  function formatMs(ms) {
    if (ms < 1000) return Math.round(ms) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  return { getState: () => state, formatBytes, formatMs };

})();
