/**
 * filters.js — URL / status / type / method filtering
 * Supports both new API (init(containerEl) → renders chip UI)
 * and legacy API (init(callbackFn) → binds existing DOM selects).
 */

'use strict';

const Filters = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let _state = {
    urlQuery:    '',
    statusGroup: 'all',
    typeGroup:   'all',
    methodGroup: 'all',
  };

  let _allEntries     = [];
  let _legacyCb       = null;   // callback passed via legacy init(fn)
  let _containerEl    = null;   // DOM element passed via new init(el)
  let _redactList     = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token']);

  // ── init ───────────────────────────────────────────────────────────────────
  // New spec:  init(containerEl)  → renders chip-based filter bar into the element
  // Legacy:    init(callbackFn)   → binds existing <select>/<input> elements in the DOM
  function init(containerOrCb) {
    if (typeof containerOrCb === 'function') {
      _legacyCb = containerOrCb;
      _bindLegacyDOM();
    } else {
      _containerEl = containerOrCb;
      _renderFilterBar();
    }
  }

  // ── Render chip-based filter bar ───────────────────────────────────────────
  function _renderFilterBar() {
    if (!_containerEl) return;
    _containerEl.innerHTML = '';

    // URL search input
    const searchWrap = _mk('div', 'filter-bar-search');
    searchWrap.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
      '<circle cx="7" cy="7" r="4.5"/>' +
      '<path d="M10.5 10.5l2.5 2.5" stroke-linecap="round"/>' +
      '</svg>';
    const searchInput = _mk('input');
    searchInput.type        = 'search';
    searchInput.placeholder = 'Filter by URL\u2026';
    searchInput.value       = _state.urlQuery;
    searchInput.addEventListener('input', e => {
      _state.urlQuery = e.target.value;
      _fireChange();
    });
    searchWrap.appendChild(searchInput);
    _containerEl.appendChild(searchWrap);

    // Status group: All | 2xx | 3xx | 4xx | 5xx
    _containerEl.appendChild(_buildChipGroup([
      { val: 'all', label: 'All' },
      { val: '2xx', label: '2xx' },
      { val: '3xx', label: '3xx' },
      { val: '4xx', label: '4xx' },
      { val: '5xx', label: '5xx' },
    ], 'statusGroup'));

    // Type group: All | XHR | JS | CSS | Img | Font | Doc | Other
    _containerEl.appendChild(_buildChipGroup([
      { val: 'all',   label: 'All'   },
      { val: 'xhr',   label: 'XHR'   },
      { val: 'js',    label: 'JS'    },
      { val: 'css',   label: 'CSS'   },
      { val: 'img',   label: 'Img'   },
      { val: 'font',  label: 'Font'  },
      { val: 'doc',   label: 'Doc'   },
      { val: 'other', label: 'Other' },
    ], 'typeGroup'));

    // Method group (populated dynamically in populate())
    const methodWrap = _mk('div', 'filter-seg');
    methodWrap.dataset.group = 'methodGroup';
    _appendChip(methodWrap, 'all', 'All', 'methodGroup', true);
    _containerEl.appendChild(methodWrap);

    // Clear button
    const clearBtn = _mk('button', 'btn btn-ghost btn-sm');
    clearBtn.type        = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', _clearAll);
    _containerEl.appendChild(clearBtn);
  }

  function _buildChipGroup(options, stateKey) {
    const wrap = _mk('div', 'filter-seg');
    wrap.dataset.group = stateKey;
    options.forEach(opt => {
      _appendChip(wrap, opt.val, opt.label, stateKey, opt.val === _state[stateKey]);
    });
    return wrap;
  }

  function _appendChip(wrap, val, label, stateKey, active) {
    const btn = _mk('button', 'seg-btn' + (active ? ' active' : ''));
    btn.type        = 'button';
    btn.textContent = label;
    btn.dataset.val = val;
    btn.addEventListener('click', () => {
      _state[stateKey] = val;
      wrap.querySelectorAll('.seg-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.val === val));
      _fireChange();
    });
    wrap.appendChild(btn);
    return btn;
  }

  function _clearAll() {
    _state.urlQuery    = '';
    _state.statusGroup = 'all';
    _state.typeGroup   = 'all';
    _state.methodGroup = 'all';
    if (_containerEl) {
      const si = _containerEl.querySelector('input[type=search]');
      if (si) si.value = '';
      _containerEl.querySelectorAll('.filter-seg').forEach(seg => {
        seg.querySelectorAll('.seg-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.val === 'all'));
      });
    }
    _fireChange();
  }

  // ── Legacy: bind existing <select>/<input> elements ────────────────────────
  function _bindLegacyDOM() {
    const si = document.getElementById('filter-url');
    const ss = document.getElementById('filter-status');
    const ts = document.getElementById('filter-type');
    const ms = document.getElementById('filter-method');
    const cb = document.getElementById('filter-clear-btn');

    if (si) si.addEventListener('input',  _legacyFire);
    if (ss) ss.addEventListener('change', _legacyFire);
    if (ts) ts.addEventListener('change', _legacyFire);
    if (ms) ms.addEventListener('change', _legacyFire);
    if (cb) cb.addEventListener('click',  () => { _resetLegacyDOM(); _legacyFire(); });

    const ri = document.getElementById('redact-input');
    const ra = document.getElementById('redact-add-btn');
    if (ra && ri) {
      ra.addEventListener('click', () => addRedact(ri.value));
      ri.addEventListener('keydown', e => { if (e.key === 'Enter') addRedact(ri.value); });
    }
    _renderRedactList();
  }

  function _legacyFire() {
    const filtered = applyFilters(_allEntries);
    if (_legacyCb) _legacyCb(filtered);
  }

  function _resetLegacyDOM() {
    _setDomVal('filter-url',    '');
    _setDomVal('filter-status', '');
    _setDomVal('filter-type',   '');
    _setDomVal('filter-method', '');
  }

  // ── populate ───────────────────────────────────────────────────────────────
  function populate(entries) {
    _allEntries = entries;

    if (_containerEl) {
      // Refresh method chips with real data
      const methodWrap = _containerEl.querySelector('[data-group="methodGroup"]');
      if (methodWrap) {
        methodWrap.innerHTML = '';
        const methods = [...new Set(entries.map(e => e.method))].sort();
        _appendChip(methodWrap, 'all', 'All', 'methodGroup', _state.methodGroup === 'all');
        methods.forEach(m => {
          _appendChip(methodWrap, m, m, 'methodGroup', _state.methodGroup === m);
        });
      }
    } else {
      // Legacy: repopulate <select> options
      const ts = document.getElementById('filter-type');
      if (ts) {
        const types = [...new Set(entries.map(e => e.type))].sort();
        ts.innerHTML = '<option value="">All types</option>' +
          types.map(t => `<option value="${t}">${t}</option>`).join('');
      }
      const ms = document.getElementById('filter-method');
      if (ms) {
        const methods = [...new Set(entries.map(e => e.method))].sort();
        ms.innerHTML = '<option value="">All methods</option>' +
          methods.map(m => `<option value="${m}">${m}</option>`).join('');
      }
    }

    return applyFilters(entries);
  }

  // ── applyFilters ───────────────────────────────────────────────────────────
  // Returns filtered array AND dispatches 'filters:changed' on document.
  function applyFilters(entries) {
    const toFilter = entries || _allEntries;

    let urlQ, statusF, typeF, methodF;

    if (_containerEl) {
      urlQ    = _state.urlQuery.toLowerCase().trim();
      statusF = _state.statusGroup;
      typeF   = _state.typeGroup;
      methodF = _state.methodGroup;
    } else {
      urlQ    = (_getDomVal('filter-url')    || '').toLowerCase().trim();
      statusF = _getDomVal('filter-status') || 'all';
      typeF   = _getDomVal('filter-type')   || 'all';
      methodF = _getDomVal('filter-method') || 'all';
    }

    const filtered = toFilter.filter(e => {
      // URL search
      if (urlQ && !e.url.toLowerCase().includes(urlQ)) return false;

      // Status group
      if (statusF && statusF !== 'all') {
        const cls = Math.floor(e.status / 100);
        if (statusF === '2xx' && cls !== 2) return false;
        if (statusF === '3xx' && cls !== 3) return false;
        if (statusF === '4xx' && cls !== 4) return false;
        if (statusF === '5xx' && cls !== 5) return false;
        if (statusF === 'err' && e.status !== 0) return false;
      }

      // Type group
      if (typeF && typeF !== 'all' && e.type !== typeF) return false;

      // Method group
      if (methodF && methodF !== 'all' && e.method !== methodF) return false;

      return true;
    });

    // Dispatch event (new spec)
    document.dispatchEvent(new CustomEvent('filters:changed', { detail: { filtered } }));
    return filtered;
  }

  function _fireChange() {
    const filtered = applyFilters(_allEntries);
    if (_legacyCb) _legacyCb(filtered);
  }

  // ── Redact list ────────────────────────────────────────────────────────────
  function addRedact(name) {
    const n = (name || '').trim().toLowerCase();
    if (!n) return;
    _redactList.add(n);
    _renderRedactList();
    const inp = document.getElementById('redact-input');
    if (inp) inp.value = '';
  }

  function removeRedact(name) {
    _redactList.delete(name);
    _renderRedactList();
  }

  function _renderRedactList() {
    const container = document.getElementById('redact-list');
    if (!container) return;
    container.innerHTML = '';
    [..._redactList].sort().forEach(name => {
      const tag = _mk('span', 'redact-tag');
      tag.innerHTML = name + ' <button class="redact-remove" title="Remove">\u00d7</button>';
      tag.querySelector('.redact-remove').addEventListener('click', () => removeRedact(name));
      container.appendChild(tag);
    });
  }

  function getRedactList() { return new Set(_redactList); }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function _mk(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function _getDomVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }
  function _setDomVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  return { init, populate, applyFilters, addRedact, getRedactList };

})();
