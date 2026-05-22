/**
 * parser.js — HAR file parser
 * Extracts entries, timing data, headers, and metadata from a .har JSON object.
 *
 * Public API:
 *   HARParser.parseHAR(json)             → { entries, pages, meta, errors }
 *   HARParser.parse(raw)                 → same (alias)
 *   HARParser.parseText(jsonText)        → same (from raw JSON string)
 *   HARParser.isValidHAR(raw)            → boolean
 *   HARParser.normaliseHeaders(headers)  → plain object
 *   HARParser.detectType(mime, url)      → string
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
      raw != null &&
      typeof raw === 'object' &&
      raw.log != null &&
      Array.isArray(raw.log.entries)
    );
  }

  /**
   * Normalise a single HAR entry into a flat, easy-to-use record.
   *
   * Returned shape:
   *   { index, url, domain, path, method, status, statusText,
   *     mimeType, type, size, transferSize, bodySize,
   *     timings: { dns, tcp, tls, wait, receive, total },
   *     totalTime, startTime, startedDateTime, startOffset, pageRef,
   *     request, response,
   *     queryString, requestHeaders, requestBodySize, requestBody,
   *     responseHeaders, responseContent,
   *     _raw }
   *
   * @param {Object} entry  - Raw HAR entry object
   * @param {number} index  - Position in the entries array
   * @returns {Object}
   */
  function normaliseEntry(entry, index) {
    const req     = entry.request  || {};
    const res     = entry.response || {};
    const rawTime = entry.timings  || {};

    // ── Timing breakdown (ms; -1 in HAR means "not applicable" → clamp to 0) ──
    const dns     = Math.max(rawTime.dns     != null ? rawTime.dns     : -1, 0);
    const connect = Math.max(rawTime.connect != null ? rawTime.connect : -1, 0);
    const ssl     = Math.max(rawTime.ssl     != null ? rawTime.ssl     : -1, 0);
    const send    = Math.max(rawTime.send    != null ? rawTime.send    :  0, 0);
    const wait    = Math.max(rawTime.wait    != null ? rawTime.wait    :  0, 0);
    const receive = Math.max(rawTime.receive != null ? rawTime.receive :  0, 0);
    const blocked = Math.max(rawTime.blocked != null ? rawTime.blocked : -1, 0);

    // Total time: prefer entry.time (HAR spec), fall back to summing phases
    const totalTime = (typeof entry.time === 'number' && entry.time >= 0)
      ? entry.time
      : dns + connect + ssl + send + wait + receive + blocked;

    // ── URL breakdown ────────────────────────────────────────────────────────
    const url    = req.url || '';
    let   domain = '';
    let   path   = '';
    try {
      const u = new URL(url);
      domain  = u.hostname;
      path    = u.pathname + (u.search ? u.search : '');
    } catch (_) {
      domain = '';
      path   = url;
    }

    // ── Other request/response fields ────────────────────────────────────────
    const method   = (req.method || 'GET').toUpperCase();
    const status   = res.status  || 0;
    const mimeType = (res.content && res.content.mimeType) || '';
    const type     = detectType(mimeType, url);

    // ── Size ─────────────────────────────────────────────────────────────────
    const headSz      = typeof res.headersSize === 'number' ? res.headersSize : -1;
    const bodySz      = typeof res.bodySize    === 'number' ? res.bodySize    : -1;
    const transferSize = (headSz >= 0 && bodySz >= 0)
      ? headSz + bodySz
      : (res._transferSize != null ? res._transferSize : bodySz);
    const size = transferSize;  // canonical "size" field for waterfall

    // ── Timestamps ───────────────────────────────────────────────────────────
    const startedDateTime = entry.startedDateTime || null;
    const startTime       = startedDateTime;   // alias used by waterfall spec

    return {
      index,

      // URL parts
      url,
      domain,
      path,

      // Request
      method,
      queryString     : req.queryString || [],
      requestHeaders  : normaliseHeaders(req.headers),
      requestBodySize : req.bodySize != null ? req.bodySize : -1,
      requestBody     : req.postData  || null,
      request         : req,   // raw passthrough

      // Response
      status,
      statusText      : res.statusText || '',
      responseHeaders : normaliseHeaders(res.headers),
      mimeType,
      type,
      bodySize        : bodySz,
      transferSize,
      size,
      responseContent : res.content || null,
      response        : res,   // raw passthrough

      // Timings — expose both canonical names (tcp/tls) AND legacy (connect/ssl)
      // so that both old and new waterfall code work during any transition.
      timings: {
        dns,
        tcp    : connect,   // HAR spec field "connect" === TCP connect
        tls    : ssl,       // HAR spec field "ssl"     === TLS handshake
        wait,
        receive,
        // legacy aliases
        connect,
        ssl,
        send,
        blocked,
        // total for convenience
        total  : totalTime,
      },
      totalTime,

      // Timestamps
      startedDateTime,
      startTime,         // alias

      // startOffset: filled in by parse() once we know the page start
      startOffset: 0,
      pageRef    : null,

      // Raw passthrough for export/inspector
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
   * Derive a human-readable resource type from MIME type and URL extension.
   * @param {string} mimeType
   * @param {string} url
   * @returns {string}
   */
  function detectType(mimeType, url) {
    const m = (mimeType || '').toLowerCase();
    if (m.includes('html'))                                     return 'document';
    if (m.includes('javascript') || m.includes('ecmascript'))  return 'script';
    if (m.includes('css'))                                      return 'stylesheet';
    if (m.includes('image/') || m.includes('svg'))             return 'image';
    if (m.includes('font'))                                     return 'font';
    if (m.includes('json'))                                     return 'json';
    if (m.includes('xml'))                                      return 'xml';
    if (m.includes('wasm'))                                     return 'wasm';
    if (m.includes('video/') || m.includes('audio/'))          return 'media';
    if (m.includes('text/plain'))                               return 'text';

    // Fallback: guess from URL extension
    const ext = ((url || '').split('?')[0].split('.').pop() || '').toLowerCase();
    const extMap = {
      js: 'script', mjs: 'script', ts: 'script', jsx: 'script',
      css: 'stylesheet',
      html: 'document', htm: 'document',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
      webp: 'image', svg: 'image', ico: 'image', avif: 'image',
      woff: 'font', woff2: 'font', ttf: 'font', otf: 'font', eot: 'font',
      json: 'json', xml: 'xml', wasm: 'wasm',
      mp4: 'media', webm: 'media', mp3: 'media', ogg: 'media',
      txt: 'text', csv: 'text',
    };
    return extMap[ext] || 'other';
  }

  /**
   * Parse a raw HAR object (already JSON.parse'd) and return a structured result.
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

    const log  = raw.log;
    const meta = {
      version : log.version || '1.2',
      creator : log.creator || {},
      browser : log.browser || {},
      comment : log.comment || '',
    };

    const pages = (log.pages || []).map(p => ({
      id              : p.id    || '',
      title           : p.title || p.id || '',
      startedDateTime : p.startedDateTime || null,
      pageTimings     : p.pageTimings     || {},
    }));

    // Build pageRef → ISO start time map for relative-timing calculation
    const pageStartMap = {};
    pages.forEach(p => { if (p.id) pageStartMap[p.id] = p.startedDateTime; });

    const entries = log.entries.map((entry, i) => {
      try {
        const rec     = normaliseEntry(entry, i);
        const pageRef = entry.pageref || (pages[0] && pages[0].id) || null;
        const pgStart = pageRef && pageStartMap[pageRef]
          ? new Date(pageStartMap[pageRef]).getTime()
          : null;

        rec.pageRef    = pageRef;
        rec.startOffset = (pgStart != null && rec.startedDateTime)
          ? new Date(rec.startedDateTime).getTime() - pgStart
          : 0;

        return rec;
      } catch (e) {
        errors.push('Entry ' + i + ': ' + e.message);
        return null;
      }
    }).filter(Boolean);

    // If the HAR has no pages, derive startOffset from the earliest entry timestamp
    if (pages.length === 0 && entries.length > 0) {
      const firstTs = entries.reduce((min, e) => {
        const ts = e.startedDateTime ? new Date(e.startedDateTime).getTime() : Infinity;
        return ts < min ? ts : min;
      }, Infinity);

      entries.forEach(e => {
        e.startOffset = (e.startedDateTime && isFinite(firstTs))
          ? new Date(e.startedDateTime).getTime() - firstTs
          : 0;
      });
    }

    return { meta, entries, pages, errors };
  }

  /**
   * parseHAR — primary public entry point (per waterfall spec).
   * Accepts an already-parsed JSON object.
   *
   * @param {Object} json - Parsed HAR JSON
   * @returns {{ entries: Array, pages: Array, meta: Object, errors: Array }}
   */
  function parseHAR(json) {
    return parse(json);
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
      return {
        meta: {}, entries: [], pages: [],
        errors: ['JSON parse error: ' + e.message],
      };
    }
    return parse(raw);
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  return {
    parseHAR,           // primary spec-required entry point
    parse,              // alias (same as parseHAR)
    parseText,          // convenience wrapper for raw JSON string
    isValidHAR,
    normaliseHeaders,
    detectType,
  };

})();

// ES-module-friendly export (no-op in plain <script> usage)
if (typeof module !== 'undefined') module.exports = HARParser;
