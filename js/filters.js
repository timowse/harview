/**
 * filters.js — URL / status / type filtering + header redaction list
 */

'use strict';

const Filters = (() => {

  let _allEntries  = [];
  let _onChange    = null;
  let _redactList  = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token']);

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(onChange) {
    _onChange = onChange;
    bindEvents();
  }

  function bindEvents() {
    // Search / filter inputs
    const searchInput  = document.getElementById('filter-url');
    const statusSelect = document.getElementById('filter-status');
    const typeSelect   = document.getElementById('filter-type');
    const methodSelect = document.getElementById('filter-method');
    const clearBtn     = document.getElementById('filter-clear-btn');

    if (searchInput)  searchInput.addEventListener('input',  applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);
    if (typeSelect)   typeSelect.addEventListener('change',  applyFilters);
    if (methodSelect) methodSelect.addEventListener('change', applyFilters);
    if (clearBtn)     clearBtn.addEventListener('click',     clearFilters);

    // Redact list management
    const redactInput = document.getElementById('redact-input');
    const redactAdd   = document.getElementById('redact-add-btn');
    if (redactAdd && redactInput) {
      redactAdd.addEventListener('click', () => addRedact(redactInput.value));
      redactInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') addRedact(redactInput.value);
      });
    }
    renderRedactList();
  }

  // ── Populate dropdowns from actual data ────────────────────────────────────
  function populate(entries) {
    _allEntries = entries;

    // Type options
    const typeSelect = document.getElementById('filter-type');
    if (typeSelect) {
      const types = [...new Set(entries.map(e => e.type))].sort();
      typeSelect.innerHTML = '<option value="">All types</option>' +
        types.map(t => `<option value="${t}">${t}</option>`).join('');
    }

    // Method options
    const methodSelect = document.getElementById('filter-method');
    if (methodSelect) {
      const methods = [...new Set(entries.map(e => e.method))].sort();
      methodSelect.innerHTML = '<option value="">All methods</option>' +
        methods.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    applyFilters();
  }

  // ── Apply filters ──────────────────────────────────────────────────────────
  function applyFilters() {
    const urlQuery  = (getVal('filter-url') || '').toLowerCase().trim();
    const statusF   = getVal('filter-status') || '';
    const typeF     = getVal('filter-type')   || '';
    const methodF   = getVal('filter-method') || '';

    const filtered = _allEntries.filter(e => {
      if (urlQuery && !e.url.toLowerCase().includes(urlQuery)) return false;

      if (statusF) {
        if (statusF === '2xx' && Math.floor(e.status / 100) !== 2) return false;
        if (statusF === '3xx' && Math.floor(e.status / 100) !== 3) return false;
        if (statusF === '4xx' && Math.floor(e.status / 100) !== 4) return false;
        if (statusF === '5xx' && Math.floor(e.status / 100) !== 5) return false;
        if (statusF === 'err' && e.status !== 0) return false;
        if (!isNaN(Number(statusF)) && Number(statusF) > 0 && e.status !== Number(statusF)) return false;
      }

      if (typeF   && e.type   !== typeF)   return false;
      if (methodF && e.method !== methodF) return false;

      return true;
    });

    if (_onChange) _onChange(filtered);
  }

  function clearFilters() {
    setValue('filter-url', '');
    setValue('filter-status', '');
    setValue('filter-type', '');
    setValue('filter-method', '');
    applyFilters();
  }

  // ── Redact list ────────────────────────────────────────────────────────────
  function addRedact(name) {
    const n = (name || '').trim().toLowerCase();
    if (!n) return;
    _redactList.add(n);
    renderRedactList();
    const inp = document.getElementById('redact-input');
    if (inp) inp.value = '';
  }

  function removeRedact(name) {
    _redactList.delete(name);
    renderRedactList();
  }

  function renderRedactList() {
    const container = document.getElementById('redact-list');
    if (!container) return;
    container.innerHTML = '';
    [..._redactList].sort().forEach(name => {
      const tag = document.createElement('span');
      tag.className = 'redact-tag';
      tag.innerHTML = `${name} <button class="redact-remove" title="Remove">×</button>`;
      tag.querySelector('.redact-remove').addEventListener('click', () => removeRedact(name));
      container.appendChild(tag);
    });
  }

  function getRedactList() {
    return new Set(_redactList);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }
  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  return { init, populate, applyFilters, getRedactList };

})();
