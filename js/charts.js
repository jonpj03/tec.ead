/* =========================================================
   charts.js — gráficos em SVG puro (sem bibliotecas externas)
   Motivo da decisão: mantém a aplicação 100% offline, sem
   requisições de rede, o que é requisito de privacidade.
   Exposto globalmente como window.Charts
   ========================================================= */
(function (global) {
  'use strict';
  const esc = U.esc;
  const tipEl = document.getElementById('chartTip');

  /* ---------------- Tooltip compartilhado ---------------- */
  function bindTips(root) {
    root.querySelectorAll('[data-tip-html]').forEach(node => {
      node.addEventListener('mouseenter', () => {
        tipEl.innerHTML = node.getAttribute('data-tip-html');
        tipEl.hidden = false;
      });
      node.addEventListener('mousemove', e => {
        const pad = 14;
        const rect = tipEl.getBoundingClientRect();
        let x = e.clientX + pad, y = e.clientY + pad;
        if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - pad;
        if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;
        tipEl.style.left = x + 'px';
        tipEl.style.top = y + 'px';
      });
      node.addEventListener('mouseleave', () => { tipEl.hidden = true; });
    });
  }
  document.addEventListener('scroll', () => { tipEl.hidden = true; }, true);

  /* ---------------- Helpers ---------------- */
  const PALETTE = ['#4b5bd6', '#0f8b7e', '#b4632c', '#7a4fd0', '#2a6bb0', '#a3325f', '#3f7d3a', '#8a6d1e', '#c03a3a', '#6c7689'];
  const colorAt = i => PALETTE[i % PALETTE.length];

  function niceMax(value) {
    if (value <= 0) return 1;
    const exp = Math.floor(Math.log10(value));
    const base = Math.pow(10, exp);
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (const s of steps) if (value <= base * s) return base * s;
    return base * 10;
  }
  function svgWrap(w, h, inner, cls) {
    return `<svg class="chart ${cls || ''}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet"
              role="img" style="width:100%;height:auto;overflow:visible">${inner}</svg>`;
  }
  function emptyState(container, message) {
    container.innerHTML = `<div class="chart-empty">${esc(message || 'Sem dados para exibir')}</div>`;
  }

  /* ---------------- Barras verticais ---------------- */
  /**
   * @param {HTMLElement} container
   * @param {{data:{label:string,value:number,color?:string}[], height?:number, unit?:string, formatter?:Function}} options
   */
  function bars(container, options) {
    const data = (options.data || []).filter(Boolean);
    if (!data.length || data.every(d => !d.value)) return emptyState(container, options.emptyText);

    const W = 720, H = options.height || 240;
    const padL = 42, padR = 12, padT = 14, padB = 34;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const max = niceMax(Math.max.apply(null, data.map(d => d.value || 0)));
    const step = innerW / data.length;
    const barW = Math.max(6, Math.min(46, step * 0.62));
    const fmt = options.formatter || (v => U.num(v));

    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + innerH - (innerH * i / 4);
      g += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/>
            <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-3)"
              font-family="var(--font-num)">${esc(U.num(Math.round(max * i / 4)))}</text>`;
    }

    data.forEach((d, i) => {
      const value = d.value || 0;
      const h = max ? (value / max) * innerH : 0;
      const x = padL + step * i + (step - barW) / 2;
      const y = padT + innerH - h;
      const color = d.color || options.color || 'var(--accent)';
      g += `<g data-tip-html="<b>${esc(d.label)}</b><br>${esc(fmt(value))}" style="cursor:default">
              <rect x="${padL + step * i}" y="${padT}" width="${step}" height="${innerH}" fill="transparent"/>
              <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, value > 0 ? 2 : 0)}" rx="3" fill="${color}">
                <animate attributeName="height" from="0" to="${Math.max(h, value > 0 ? 2 : 0)}" dur="0.45s" fill="freeze"/>
                <animate attributeName="y" from="${padT + innerH}" to="${y}" dur="0.45s" fill="freeze"/>
              </rect>
            </g>`;
      const label = data.length > 14 && i % Math.ceil(data.length / 12) !== 0 ? '' : U.truncate(d.label, 12);
      if (label) {
        g += `<text x="${padL + step * i + step / 2}" y="${H - 12}" text-anchor="middle"
                font-size="10.5" fill="var(--text-3)">${esc(label)}</text>`;
      }
    });

    container.innerHTML = svgWrap(W, H, g);
    bindTips(container);
  }

  /* ---------------- Barras horizontais (ranking) ---------------- */
  function hbars(container, options) {
    const data = (options.data || []).filter(Boolean);
    if (!data.length) return emptyState(container, options.emptyText);
    const max = Math.max(1, Math.max.apply(null, data.map(d => d.value || 0)));
    const fmt = options.formatter || (v => U.num(v));

    container.innerHTML = `<div class="hbars">${data.map((d, i) => `
      <div class="hbar" title="${esc(d.label)}: ${esc(fmt(d.value))}">
        <span class="hbar__label truncate">${esc(d.label)}</span>
        <span class="hbar__track"><i style="width:${(d.value / max) * 100}%;background:${d.color || colorAt(i)}"></i></span>
        <span class="hbar__value num">${esc(fmt(d.value))}</span>
      </div>`).join('')}</div>`;
  }

  /* ---------------- Donut ---------------- */
  function donut(container, options) {
    const data = (options.data || []).filter(d => d && d.value > 0);
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (!total) return emptyState(container, options.emptyText);

    const size = 190, cx = size / 2, cy = size / 2, r = 72, thickness = 22;
    let angle = -Math.PI / 2;
    let arcs = '';

    data.forEach((d, i) => {
      const share = d.value / total;
      const sweep = share * Math.PI * 2;
      const end = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
      const color = d.color || colorAt(i);
      // Segmento completo (100%): desenha um anel para evitar arco degenerado
      if (share >= 0.999) {
        arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${thickness}"
                  data-tip-html="<b>${esc(d.label)}</b><br>${esc(U.num(d.value))} (100%)"/>`;
      } else {
        arcs += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${color}"
                  stroke-width="${thickness}" stroke-linecap="butt"
                  data-tip-html="<b>${esc(d.label)}</b><br>${esc(U.num(d.value))} (${esc(U.pct(d.value, total))})"
                  style="cursor:default"/>`;
      }
      angle = end;
    });

    const center = `
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="27" font-weight="600"
        fill="var(--text)" font-family="var(--font-num)">${esc(U.num(options.centerValue !== undefined ? options.centerValue : total))}</text>
      <text x="${cx}" y="${cy + 17}" text-anchor="middle" font-size="10.5" fill="var(--text-3)">${esc(options.centerLabel || 'total')}</text>`;

    const legend = `<ul class="legend">${data.map((d, i) => `
      <li><i style="background:${d.color || colorAt(i)}"></i>
        <span class="truncate">${esc(d.label)}</span>
        <b class="num">${esc(U.num(d.value))}</b>
        <span class="dim num">${esc(U.pct(d.value, total, 0))}</span>
      </li>`).join('')}</ul>`;

    container.innerHTML = `<div class="donut-wrap">
        <div class="donut-chart">${svgWrap(size, size, arcs + center)}</div>
        ${legend}
      </div>`;
    bindTips(container);
  }

  /* ---------------- Linha / área ---------------- */
  /**
   * @param {{labels:string[], series:{name:string,color?:string,values:number[],area?:boolean}[], height?:number}} options
   */
  function line(container, options) {
    const labels = options.labels || [];
    const series = (options.series || []).filter(s => s && s.values && s.values.length);
    if (!labels.length || !series.length) return emptyState(container, options.emptyText);

    const W = 720, H = options.height || 250;
    const padL = 42, padR = 14, padT = 16, padB = 32;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const allValues = series.flatMap(s => s.values.filter(v => typeof v === 'number'));
    const max = niceMax(Math.max(1, Math.max.apply(null, allValues)));
    const stepX = labels.length > 1 ? innerW / (labels.length - 1) : 0;
    const xAt = i => padL + (labels.length > 1 ? stepX * i : innerW / 2);
    const yAt = v => padT + innerH - (max ? (v / max) * innerH : 0);

    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + innerH - (innerH * i / 4);
      g += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/>
            <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-3)"
              font-family="var(--font-num)">${esc(U.num(Math.round(max * i / 4)))}</text>`;
    }

    series.forEach((s, si) => {
      const color = s.color || colorAt(si);
      const pts = s.values.map((v, i) => `${xAt(i)},${yAt(v || 0)}`).join(' ');
      if (s.area !== false) {
        g += `<polygon points="${padL},${padT + innerH} ${pts} ${xAt(s.values.length - 1)},${padT + innerH}"
                fill="${color}" opacity="0.10"/>`;
      }
      g += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2"
              stroke-linejoin="round" stroke-linecap="round"/>`;
      s.values.forEach((v, i) => {
        g += `<circle cx="${xAt(i)}" cy="${yAt(v || 0)}" r="${s.values.length > 40 ? 0 : 3.2}" fill="var(--surface)" stroke="${color}" stroke-width="2"/>`;
      });
    });

    // áreas de captura para tooltip (uma por ponto do eixo X)
    labels.forEach((lab, i) => {
      const rows = series.map((s, si) =>
        `<span style="color:${s.color || colorAt(si)}">●</span> ${esc(s.name)}: <b>${esc(U.num(s.values[i] || 0))}</b>`).join('<br>');
      const w = labels.length > 1 ? stepX : innerW;
      g += `<rect x="${xAt(i) - w / 2}" y="${padT}" width="${w}" height="${innerH}" fill="transparent"
              data-tip-html="<b>${esc(lab)}</b><br>${rows}" style="cursor:default"/>`;
    });

    const every = Math.max(1, Math.ceil(labels.length / 10));
    labels.forEach((lab, i) => {
      if (i % every !== 0 && i !== labels.length - 1) return;
      g += `<text x="${xAt(i)}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="var(--text-3)">${esc(lab)}</text>`;
    });

    const legend = series.length > 1
      ? `<ul class="legend legend--inline">${series.map((s, i) =>
          `<li><i style="background:${s.color || colorAt(i)}"></i><span>${esc(s.name)}</span></li>`).join('')}</ul>`
      : '';

    container.innerHTML = svgWrap(W, H, g) + legend;
    bindTips(container);
  }

  /* ---------------- Barras empilhadas por período ---------------- */
  function stacked(container, options) {
    const labels = options.labels || [];
    const series = options.series || [];
    if (!labels.length || !series.length) return emptyState(container, options.emptyText);

    const W = 720, H = options.height || 240;
    const padL = 42, padR = 12, padT = 14, padB = 32;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0));
    const max = niceMax(Math.max(1, Math.max.apply(null, totals)));
    const step = innerW / labels.length;
    const barW = Math.max(6, Math.min(38, step * 0.6));

    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + innerH - (innerH * i / 4);
      g += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/>
            <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-3)"
              font-family="var(--font-num)">${esc(U.num(Math.round(max * i / 4)))}</text>`;
    }

    labels.forEach((lab, i) => {
      let acc = 0;
      const x = padL + step * i + (step - barW) / 2;
      series.forEach((s, si) => {
        const v = s.values[i] || 0;
        if (!v) return;
        const h = (v / max) * innerH;
        acc += h;
        const y = padT + innerH - acc;
        g += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${s.color || colorAt(si)}"
                rx="${si === series.length - 1 ? 3 : 0}"/>`;
      });
      const rows = series.map((s, si) =>
        `<span style="color:${s.color || colorAt(si)}">●</span> ${esc(s.name)}: <b>${esc(U.num(s.values[i] || 0))}</b>`).join('<br>');
      g += `<rect x="${padL + step * i}" y="${padT}" width="${step}" height="${innerH}" fill="transparent"
              data-tip-html="<b>${esc(lab)}</b><br>${rows}" style="cursor:default"/>`;
      const every = Math.max(1, Math.ceil(labels.length / 12));
      if (i % every === 0) {
        g += `<text x="${padL + step * i + step / 2}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="var(--text-3)">${esc(lab)}</text>`;
      }
    });

    const legend = `<ul class="legend legend--inline">${series.map((s, i) =>
      `<li><i style="background:${s.color || colorAt(i)}"></i><span>${esc(s.name)}</span></li>`).join('')}</ul>`;

    container.innerHTML = svgWrap(W, H, g) + legend;
    bindTips(container);
  }

  /* ---------------- Sparkline ---------------- */
  function sparkline(values, options) {
    const opts = options || {};
    const vals = (values || []).map(v => +v || 0);
    if (!vals.length) return '';
    const W = opts.width || 90, H = opts.height || 24;
    const max = Math.max(1, Math.max.apply(null, vals));
    const stepX = vals.length > 1 ? W / (vals.length - 1) : 0;
    const pts = vals.map((v, i) => `${i * stepX},${H - (v / max) * (H - 3) - 1.5}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none" style="overflow:visible">
      <polyline points="${pts}" fill="none" stroke="${opts.color || 'var(--accent)'}" stroke-width="1.6"
        stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  global.Charts = { bars, hbars, donut, line, stacked, sparkline, colorAt, PALETTE };
})(window);
