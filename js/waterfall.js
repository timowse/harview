/**
 * waterfall.js — Grafana-style network waterfall chart using D3.js
 */

'use strict';

const Waterfall = (() => {

  const ROW_H    = 28;
  const MIN_W    = 800;
  const LABEL_W  = 320;
  const TIME_COL = 80;
  const PAD      = { top: 40, right: 20, bottom: 20, left: 0 };

  // Timing-phase colours (CSS custom properties as fallback)
  const PHASE_COLORS = {
    blocked  : '#aaaaaa',
    dns      : '#9b59b6',
    connect  : '#e67e22',
    ssl      : '#f1c40f',
    send     : '#3498db',
    wait     : '#2ecc71',
    receive  : '#1abc9c',
  };

  const STATUS_COLORS = {
    2 : '#2ecc71',
    3 : '#f39c12',
    4 : '#e74c3c',
    5 : '#c0392b',
    0 : '#95a5a6',
  };

  let _onSelect = null;
  let _svg = null;

  // ── Render ──────────────────────────────────────────────────────────────────
  function render(entries, onSelect) {
    _onSelect = onSelect;
    const container = document.getElementById('waterfall-container');
    if (!container) return;
    container.innerHTML = '';

    if (!entries || entries.length === 0) {
      container.innerHTML = '<p class="empty-msg">No requests match the current filters.</p>';
      return;
    }

    const containerW = Math.max(container.clientWidth || MIN_W, MIN_W);
    const chartW     = containerW - LABEL_W - TIME_COL - PAD.left - PAD.right;
    const totalH     = PAD.top + entries.length * ROW_H + PAD.bottom;

    // Time scale
    const minStart = Math.min(...entries.map(e => e.startOffset));
    const maxEnd   = Math.max(...entries.map(e => e.startOffset + e.totalTime));
    const xScale   = d3.scaleLinear()
      .domain([0, maxEnd - minStart])
      .range([0, chartW]);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', totalH)
      .attr('viewBox', `0 0 ${containerW} ${totalH}`)
      .attr('class', 'waterfall-svg');

    _svg = svg;

    // ── Time axis ────────────────────────────────────────────────────────────
    const axisG = svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(${LABEL_W + PAD.left},${PAD.top - 4})`);

    const xAxis = d3.axisTop(xScale)
      .ticks(8)
      .tickFormat(d => d >= 1000 ? (d / 1000).toFixed(1) + 's' : d + 'ms');

    axisG.call(xAxis);

    // Axis tick lines extending down through all rows
    axisG.selectAll('.tick line')
      .attr('y2', totalH - PAD.top)
      .attr('class', 'tick-grid');

    // ── Rows ─────────────────────────────────────────────────────────────────
    const rowG = svg.append('g').attr('class', 'rows');

    const rows = rowG.selectAll('.row')
      .data(entries)
      .enter()
      .append('g')
      .attr('class', (d, i) => `row ${i % 2 === 0 ? 'row-even' : 'row-odd'}`)
      .attr('transform', (d, i) => `translate(0,${PAD.top + i * ROW_H})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        rowG.selectAll('.row').classed('row-selected', false);
        d3.select(event.currentTarget).classed('row-selected', true);
        if (_onSelect) _onSelect(d);
      });

    // Row background
    rows.append('rect')
      .attr('class', 'row-bg')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', containerW)
      .attr('height', ROW_H - 1);

    // Status dot
    rows.append('circle')
      .attr('cx', 10)
      .attr('cy', ROW_H / 2)
      .attr('r', 5)
      .attr('fill', d => STATUS_COLORS[Math.floor(d.status / 100)] || STATUS_COLORS[0]);

    // Method badge
    rows.append('text')
      .attr('x', 22)
      .attr('y', ROW_H / 2 + 4)
      .attr('class', 'method-label')
      .text(d => d.method);

    // URL label (truncated)
    rows.append('text')
      .attr('x', 65)
      .attr('y', ROW_H / 2 + 4)
      .attr('class', 'url-label')
      .text(d => truncateUrl(d.url, 38));

    // Time total (right-aligned in TIME_COL)
    rows.append('text')
      .attr('x', LABEL_W - 8)
      .attr('y', ROW_H / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('class', 'time-label')
      .text(d => fmtMs(d.totalTime));

    // ── Timing bars ──────────────────────────────────────────────────────────
    const barG = rows.append('g')
      .attr('class', 'timing-bars')
      .attr('transform', `translate(${LABEL_W + PAD.left},0)`);

    const phases = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];

    // One group per phase
    phases.forEach(phase => {
      barG.append('rect')
        .attr('class', `phase phase-${phase}`)
        .attr('y', 4)
        .attr('height', ROW_H - 8)
        .attr('fill', PHASE_COLORS[phase])
        .attr('x', d => {
          const offset = d.startOffset - minStart + phaseOffset(d.timings, phase);
          return Math.max(0, xScale(offset));
        })
        .attr('width', d => {
          const val = d.timings[phase];
          return val > 0 ? Math.max(1, xScale(val)) : 0;
        });
    });

    // ── Legend ───────────────────────────────────────────────────────────────
    renderLegend(svg, containerW, totalH);
  }

  function renderLegend(svg, containerW, totalH) {
    const phases = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];
    const lg = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${LABEL_W},${totalH - PAD.bottom + 2})`);

    let ox = 0;
    phases.forEach(phase => {
      lg.append('rect').attr('x', ox).attr('y', 0).attr('width', 12).attr('height', 12)
        .attr('fill', PHASE_COLORS[phase]);
      lg.append('text').attr('x', ox + 16).attr('y', 10).attr('class', 'legend-label')
        .text(phase);
      ox += phase.length * 7 + 30;
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function phaseOffset(timings, phase) {
    const order = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait'];
    let sum = 0;
    for (const p of order) {
      if (p === phase) break;
      sum += Math.max(timings[p] || 0, 0);
    }
    return sum;
  }

  function truncateUrl(url, maxLen) {
    try {
      const u = new URL(url);
      const short = u.pathname + (u.search ? '?' + u.search.slice(1, 20) + '…' : '');
      return short.length > maxLen ? '…' + short.slice(-maxLen) : short;
    } catch {
      return url.length > maxLen ? '…' + url.slice(-maxLen) : url;
    }
  }

  function fmtMs(ms) {
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(2) + 's';
  }

  function clear() {
    const container = document.getElementById('waterfall-container');
    if (container) container.innerHTML = '';
    _svg = null;
  }

  return { render, clear };

})();
