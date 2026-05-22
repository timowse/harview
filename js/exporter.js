/**
 * exporter.js — Export a sanitized (redacted) HAR file.
 *
 * Public API:
 *   Exporter.exportSanitizedHAR(harData, filename)
 *     - harData  : parsed HAR result {meta, entries, pages, errors}
 *     - filename : original file name (used to derive the download name)
 *
 * Sensitive headers scrubbed (values replaced with '[REDACTED]'):
 *   Authorization, Cookie, Set-Cookie, X-Api-Key, X-Auth-Token
 */

'use strict';

const Exporter = (() => {

  const SENSITIVE_HEADERS = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
  ]);

  /**
   * Deep-clone harData, scrub sensitive headers, trigger browser download.
   *
   * @param {Object} harData  - Parsed HAR result {meta, entries, pages, errors}
   * @param {string} filename - Original filename (e.g. "session.har")
   */
  function exportSanitizedHAR(harData, filename) {
    if (!harData || !harData.entries) {
      console.warn('Exporter: no HAR data available.');
      return;
    }

    // Derive a clean download filename
    const base = (filename || 'export')
      .replace(/\.har$/i, '')
      .replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const downloadName = base + '-sanitized.har';

    // Rebuild a valid HAR structure from normalised entries
    const sanitizedLog = {
      version : (harData.meta && harData.meta.version) || '1.2',
      creator : (harData.meta && harData.meta.creator) || { name: 'harview', version: '1.0' },
      browser : (harData.meta && harData.meta.browser) || {},
      pages   : (harData.pages || []).map(p => ({
        startedDateTime : p.startedDateTime || new Date().toISOString(),
        id              : p.id,
        title           : p.title,
        pageTimings     : p.pageTimings || {},
      })),
      entries : harData.entries.map(e => sanitizeEntry(e)),
    };

    const json = JSON.stringify({ log: sanitizedLog }, null, 2);
    triggerDownload(json, downloadName);
  }

  /**
   * Deep-clone a single entry (_raw) and redact sensitive headers.
   * Falls back to building a minimal entry when _raw is missing.
   *
   * @param {Object} entry - Normalised entry from HARParser
   * @returns {Object}     - HAR-spec entry ready for serialization
   */
  function sanitizeEntry(entry) {
    let clone;

    if (entry._raw) {
      // Deep clone via JSON round-trip (HAR entries are fully serializable)
      clone = JSON.parse(JSON.stringify(entry._raw));
    } else {
      // Build a minimal entry from the normalised record
      clone = {
        startedDateTime : entry.startedDateTime || new Date().toISOString(),
        time            : entry.totalTime || 0,
        request  : {
          method      : entry.method || 'GET',
          url         : entry.url || '',
          httpVersion : 'HTTP/1.1',
          headers     : objectToHeaderArray(entry.requestHeaders),
          queryString : entry.queryString || [],
          cookies     : [],
          headersSize : -1,
          bodySize    : entry.requestBodySize || -1,
        },
        response : {
          status      : entry.status || 0,
          statusText  : entry.statusText || '',
          httpVersion : 'HTTP/1.1',
          headers     : objectToHeaderArray(entry.responseHeaders),
          cookies     : [],
          content     : entry.responseContent || { size: 0, mimeType: '' },
          redirectURL : '',
          headersSize : -1,
          bodySize    : entry.bodySize || -1,
        },
        cache   : {},
        timings : entry.timings || {},
      };
    }

    // Redact sensitive headers in both request and response
    redactHeaderArray(clone.request  && clone.request.headers);
    redactHeaderArray(clone.response && clone.response.headers);

    // Scrub sensitive keys from postData body
    if (clone.request && clone.request.postData) {
      clone.request.postData = sanitizePostData(clone.request.postData);
    }

    return clone;
  }

  /**
   * Scrub 'password' and 'token' keys from postData.
   * Handles JSON bodies (recursive key scrub) and URL-encoded bodies (regex replace).
   *
   * @param {Object} postData - HAR postData object {mimeType, text, params, ...}
   * @returns {Object}        - Mutated clone with sensitive values redacted
   */
  function sanitizePostData(postData) {
    if (!postData || !postData.text) return postData;

    const mime = (postData.mimeType || '').toLowerCase();

    // ── JSON body ─────────────────────────────────────────────────────────────
    if (mime.includes('json') || (postData.text.trimStart()[0] === '{')) {
      try {
        const body = JSON.parse(postData.text);
        scrubObjectKeys(body);
        postData.text = JSON.stringify(body);
        return postData;
      } catch (_) {
        // fall through to URL-encoded handling
      }
    }

    // ── URL-encoded body (application/x-www-form-urlencoded) ─────────────────
    // Replace  password=<value>  and  token=<value>  (case-insensitive)
    postData.text = postData.text.replace(
      /((?:^|&)(password|token)=)[^&]*/gi,
      '$1[REDACTED]'
    );

    // ── HAR params array ─────────────────────────────────────────────────────
    if (Array.isArray(postData.params)) {
      postData.params.forEach(p => {
        if (p && p.name && /^(password|token)$/i.test(p.name)) {
          p.value = '[REDACTED]';
        }
      });
    }

    return postData;
  }

  /**
   * Recursively replace 'password' and 'token' key values with '[REDACTED]'.
   * Mutates the object in-place.
   *
   * @param {*} obj
   */
  function scrubObjectKeys(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(scrubObjectKeys); return; }
    Object.keys(obj).forEach(key => {
      if (/^(password|token)$/i.test(key)) {
        obj[key] = '[REDACTED]';
      } else {
        scrubObjectKeys(obj[key]);
      }
    });
  }

  /**
   * Replace values of sensitive headers in a [{name,value}] array.
   * Mutates the array in-place.
   *
   * @param {Array|undefined} headers
   */
  function redactHeaderArray(headers) {
    if (!Array.isArray(headers)) return;
    headers.forEach(h => {
      if (h && h.name && SENSITIVE_HEADERS.has(h.name.toLowerCase())) {
        h.value = '[REDACTED]';
      }
    });
  }

  /**
   * Convert a {key: value} headers object back to [{name, value}] array.
   *
   * @param {Object} obj
   * @returns {Array}
   */
  function objectToHeaderArray(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).map(([name, value]) => ({ name, value }));
  }

  /**
   * Trigger a browser file download of a text blob.
   *
   * @param {string} content  - JSON string
   * @param {string} filename - Suggested filename
   */
  function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Clean up after the browser has had a tick to initiate the download
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  // ── Public ─────────────────────────────────────────────────────────────────
  return { exportSanitizedHAR };

})();

// ES-module-friendly (no-op in plain <script> usage)
if (typeof module !== 'undefined') module.exports = Exporter;
