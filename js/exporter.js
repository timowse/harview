/**
 * exporter.js — Export a sanitized / redacted HAR file
 */

'use strict';

const Exporter = (() => {

  /**
   * Deep-clone the original HAR, redact specified headers, then trigger download.
   *
   * @param {Object} harData   - Parsed HAR result {meta, entries, pages, errors}
   * @param {Set}    redactSet - Set of lowercase header names to redact
   */
  function exportSanitized(harData, redactSet) {
    if (!harData || !harData.entries) {
      console.warn('Exporter: no HAR data available.');
      return;
    }

    // Rebuild a valid HAR structure from our normalised entries + originals
    const sanitizedLog = {
      version : harData.meta.version || '1.2',
      creator : harData.meta.creator || { name: 'harview', version: '1.0' },
      browser : harData.meta.browser || {},
      pages   : harData.pages.map(p => ({
        startedDateTime : p.startedDateTime || new Date().toISOString(),
        id      : p.id,
        title   : p.title,
        pageTimings : p.pageTimings || {},
      })),
      entries : harData.entries.map(e => sanitizeEntry(e, redactSet)),
    };

    const output = JSON.stringify({ log: sanitizedLog }, null, 2);
    triggerDownload(output, buildFileName());
  }

  /**
   * Sanitize a single entry — redact headers in both request and response.
   * We work from the _raw entry to preserve all original fields.
   */
  function sanitizeEntry(entry, redactSet) {
    const raw = entry._raw;
    if (!raw) return {};

    // Deep clone via JSON round-trip (HAR entries are serializable)
    const clone = JSON.parse(JSON.stringify(raw));

    if (redactSet && redactSet.size > 0) {
      redactHeaders(clone.request  && clone.request.headers);
      redactHeaders(clone.response && clone.response.headers);
    }

    return clone;
  }

  function redactHeaders(headers) {
    if (!Array.isArray(headers)) return;
    headers.forEach(h => {
      if (h && h.name && _redactSet.has(h.name.toLowerCase())) {
        h.value = '[REDACTED]';
      }
    });
  }

  // Closure trick: keep redactSet accessible inside forEach without passing it
  let _redactSet = new Set();
  const _origExport = exportSanitized;

  function exportSanitizedWrapper(harData, redactSet) {
    _redactSet = redactSet || new Set();
    _origExport(harData, redactSet);
  }

  // Fix: inline redactHeaders to use the passed set directly
  function sanitizeEntryFixed(entry, redactSet) {
    const raw = entry._raw;
    if (!raw) return {};
    const clone = JSON.parse(JSON.stringify(raw));
    if (redactSet && redactSet.size > 0) {
      applyRedact(clone.request  && clone.request.headers,  redactSet);
      applyRedact(clone.response && clone.response.headers, redactSet);
    }
    return clone;
  }

  function applyRedact(headers, redactSet) {
    if (!Array.isArray(headers)) return;
    headers.forEach(h => {
      if (h && h.name && redactSet.has(h.name.toLowerCase())) {
        h.value = '[REDACTED]';
      }
    });
  }

  /**
   * Trigger a browser download of a text blob.
   */
  function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function buildFileName() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `harview-export-${ts}.har`;
  }

  // ── Public ─────────────────────────────────────────────────────────────────
  // Use the fixed version that properly threads redactSet through
  function exportSanitized(harData, redactSet) {
    if (!harData || !harData.entries) {
      console.warn('Exporter: no HAR data available.');
      return;
    }

    const sanitizedLog = {
      version : harData.meta.version || '1.2',
      creator : harData.meta.creator || { name: 'harview', version: '1.0' },
      browser : harData.meta.browser || {},
      pages   : (harData.pages || []).map(p => ({
        startedDateTime : p.startedDateTime || new Date().toISOString(),
        id      : p.id,
        title   : p.title,
        pageTimings : p.pageTimings || {},
      })),
      entries : harData.entries.map(e => sanitizeEntryFixed(e, redactSet)),
    };

    const output = JSON.stringify({ log: sanitizedLog }, null, 2);
    triggerDownload(output, buildFileName());
  }

  return { exportSanitized };

})();
