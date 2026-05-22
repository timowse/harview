/**
 * parser.js — HAR file parser
 * Extracts entries, timing data, headers, and metadata from a .har JSON object.
 */

'use strict';

const HARParser = (() => {

  /**
   * Validate that the object looks like a HAR file.
   * @param {Object} raw - Parsed JSON object
   * @returns {boolean}
   */
  function isValidHAR(raw) {
    return (
      raw &&
      typeof raw === 'object' &&
      raw.log &&
      Array.isArray(raw.log.entries)
    );
  }

  /**
   * Normalise a single HAR entry into a flat, easy-to-use record.
   *
   * @param {Object} entry  - Raw HAR entry object
   * @param {number} index  - Position in the entries array
   * @returns {Object} Normalised entry record
   */
  function normaliseEntry(entry, index) {
    const req  = entry.request  || {};
    const res  = entry.response || {};
    const timings = entry.timings || {};

    // ── Timing breakdown (all in ms, -1 means not applicable) ──────────────
    const dns      = Math.max(timings.dns      ?? -1, 0);
    const connect  = Math.max(timings.connect  ?? -1, 0);
    const ssl      = Math.max(timings.ssl      ?? -1, 0);
    const send     = Math.max(timings.send     ?? 0,  0);
    const wait     = Math.max(timings.wait     ?? 0,  0);
    const receive  = Math.max(timings.receive  ?? 0,  0);
    const blocked  = Math.max(timings.blocked  ?? -1, 0);

    // Total time: prefer entry.time (HAR spec), fall back to sum of positive phases
    const totalTime = (typeof entry.time === 'number' && entry.time >= 0)
      ? entry.time
      : (dns + connect + ssl + send + wait + receive + blocked);

    // ── URL & type helpers ──────────────────────────────────────────────────
    const url      = req.url || '';
    const method   = (req.method || 'GET').toUpperCase();
    const status   = res.status || 0;
    const mimeType = (res.content && res.content.mimeType) || '';
    const type     = detectType(mimeType, url);

    // ── Size ────────────────────────────────────────────────────────────────
    const transferSize = res.headersSize >= 0 && res.bodySize >= 0
      ? res.headersSize + res.bodySize
      : (res._transferSize ?? res.bodySize ?? -1);

    // ── Start time relative to page start ──────────────────────────────────
    const startedDateTime = entry.startedDateTime || null;

    return {
      index,
      startedDateTime,
      // request
      url,
      method,
      queryString : req.queryString || [],
      requestHeaders  : normaliseHeaders(req.headers),
      requestBodySize : req.bodySize ?? -1,
      requestBody     : req.postData || null,
      // response
      status,
      statusText  : res.statusText || '',
      responseHeaders : normaliseHeaders(res.headers),
      mimeType,
      type,
      bodySize    : res.bodySize ?? -1,
      transferSize,
      responseContent : res.content || null,
      // timing
      timings: { dns, connect, ssl, send, wait, receive, blocked },
      totalTime,
      // raw passthrough for export
      _raw: entry,
    };
  }

  /**
   * Convert a headers array [{name,value}] into a plain object for easy lookup.
   * Keys are lower-cased.
   * @param {Array} headers
   * @returns {Object}
   */
  function normaliseHeaders(headers) {
    if (!Array.isArray(headers)) return {};
    return headers.reduce((acc, h) => {
      if (h && h.name) acc[h.name.toLowerCase()] = h.value || '';
      return acc;
    }, {});
  }

  /**
   * Derive a human-readable resource type from MIME type and URL.
   * @param {string} mimeType
   * @param {string} url
   * @returns {string}
   */
  function detectType(mimeType, url) {
    const m = mimeType.toLowerCase();
    if (m.includes('html'))       return 'document';
    if (m.includes('javascript') || m.includes('ecmascript')) return 'script';
    if (m.includes('css'))        return 'stylesheet';
    if (m.includes('image/') || m.includes('svg')) return 'image';
    if (m.includes('font'))       return 'font';
    if (m.includes('json'))       return 'json';
    if (m.includes('xml'))        return 'xml';
    if (m.includes('wasm'))       return 'wasm';
    if (m.includes('video/') || m.includes('audio/')) return 'media';
    // Fallback: guess from URL extension
    const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
    const extMap = {
      js: 'script', mjs: 'script', ts: 'script',
      css: 'stylesheet',
      html: 'document', htm: 'document',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
      webp: 'image', svg: 'image', ico: 'image',
      woff: 'font', woff2: 'font', ttf: 'font', otf: 'font',
      json: 'json', xml: 'xml', wasm: 'wasm',
      mp4: 'media', webm: 'media', mp3: 'media',
    };
    return extMap[ext] || 'other';
  }

  /**
   * Parse a raw HAR object (already JSON.parsed) and return a structured result.
   *
   * @param {Object} raw
   * @returns {{ meta: Object, entries: Array, pages: Array, errors: Array }}
   */
  function parse(raw) {
    const errors = [];

    if (!isValidHAR(raw)) {
      errors.push('Invalid HAR: missing log.entries array.');
      return { meta: {}, entries: [], pages: [], errors };
    }

    const log   = raw.log;
    const meta  = {
      version : log.version || '1.2',
      creator : log.creator || {},
      browser : log.browser || {},
      comment : log.comment || '',
    };

    const pages = (log.pages || []).map(p => ({
      id          : p.id || '',
      title       : p.title || p.id || '',
      startedDateTime : p.startedDateTime || null,
      pageTimings : p.pageTimings || {},
    }));

    // Build a map from pageRef → page start time for relative timing
    const pageStartMap = {};
    pages.forEach(p => { if (p.id) pageStartMap[p.id] = p.startedDateTime; });

    const entries = log.entries.map((entry, i) => {
      try {
        const rec = normaliseEntry(entry, i);
        // Compute start offset relative to the page this entry belongs to
        const pageRef = entry.pageref || (pages[0] && pages[0].id) || null;
        const pageStart = pageRef && pageStartMap[pageRef]
          ? new Date(pageStartMap[pageRef]).getTime()
          : null;
        rec.pageRef = pageRef;
        rec.startOffset = (pageStart && rec.startedDateTime)
          ? new Date(rec.startedDateTime).getTime() - pageStart
          : i * 0; // 0 — will be computed in waterfall from sorted order if needed
        return rec;
      } catch (e) {
        errors.push(`Entry ${i}: ${e.message}`);
        return null;
      }
    }).filter(Boolean);

    // If we have no pages (some HARs omit them) compute startOffset from first entry
    if (pages.length === 0 && entries.length > 0) {
      const firstTs = entries
        .map(e => e.startedDateTime ? new Date(e.startedDateTime).getTime() : Infinity)
        .reduce((a, b) => Math.min(a, b), Infinity);
      entries.forEach(e => {
        e.startOffset = e.startedDateTime
          ? new Date(e.startedDateTime).getTime() - firstTs
          : 0;
      });
    }

    return { meta, entries, pages, errors };
  }

  /**
   * Parse a raw JSON string (from FileReader) and return the structured result.
   * @param {string} jsonText
   * @returns {{ meta, entries, pages, errors }}
   */
  function parseText(jsonText) {
    let raw;
    try {
      raw = JSON.parse(jsonText);
    } catch (e) {
      return { meta: {}, entries: [], pages: [], errors: [`JSON parse error: ${e.message}`] };
    }
    return parse(raw);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return { parse, parseText, isValidHAR, normaliseHeaders, detectType };

})();

// ES-module-friendly export (no-op in plain <script> usage)
if (typeof module !== 'undefined') module.exports = HARParser;
