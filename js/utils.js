/* =========================================================
   utils.js — funções utilitárias compartilhadas
   Exposto globalmente como window.U
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------- DOM ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.prototype.slice.call(root.querySelectorAll(sel));

  /** Cria elementos a partir de uma string HTML. */
  function html(str) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(str).trim();
    return tpl.content.firstElementChild;
  }

  /** Escapa texto para interpolação segura em HTML. */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Ícone do sprite. */
  function icon(name, cls) {
    return `<svg class="ico ${cls || ''}"><use href="#i-${name}"></use></svg>`;
  }

  /* ---------- Identificadores ---------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  /* ---------- Texto ---------- */
  /** Remove acentos e normaliza para comparação/busca. */
  function normalize(str) {
    return String(str == null ? '' : str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function truncate(str, max) {
    const s = String(str || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  /** Cor estável derivada de uma string (para avatares/labels sem cor definida). */
  function colorFor(str) {
    const palette = ['#4b5bd6', '#0f8b7e', '#b4632c', '#7a4fd0', '#2a6bb0', '#a3325f', '#3f7d3a', '#8a6d1e'];
    let hash = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  }

  /* ---------- Números ---------- */
  const nf = new Intl.NumberFormat('pt-BR');
  function num(value, decimals) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    if (typeof decimals === 'number') {
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals
      }).format(value);
    }
    return nf.format(value);
  }
  function pct(part, total, decimals) {
    if (!total) return '0%';
    return num((part / total) * 100, decimals === undefined ? 1 : decimals) + '%';
  }
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  function median(values) {
    const arr = values.filter(v => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b);
    if (!arr.length) return null;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }
  function average(values) {
    const arr = values.filter(v => typeof v === 'number' && !Number.isNaN(v));
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /* ---------- Datas ---------- */
  const MS_DAY = 86400000;

  /**
   * Converte um valor arbitrário em Date.
   * Suporta ISO 8601, "dd/mm/aaaa", "aaaa-mm-dd hh:mm", timestamps e serial do Excel.
   * @param {*} value
   * @param {'dmy'|'mdy'} [order] ordem preferida para datas com barra
   */
  function parseDate(value, order) {
    if (value instanceof Date) return isNaN(value) ? null : value;
    if (value === null || value === undefined) return null;

    if (typeof value === 'number' && isFinite(value)) {
      // Serial do Excel (dias desde 30/12/1899) vs timestamp em ms
      if (value > 20000 && value < 80000) return new Date(Math.round((value - 25569) * MS_DAY));
      if (value > 1e11) return new Date(value);
      if (value > 1e9) return new Date(value * 1000);
      return null;
    }

    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(/^["']|["']$/g, '');

    // ISO completo ou parcial
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      const hasTZ = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
      if (hasTZ) {
        const d = new Date(s);
        return isNaN(d) ? null : d;
      }
      if (+m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
      const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      return isNaN(d) ? null : d;
    }

    // dd/mm/aaaa ou mm/dd/aaaa (também aceita "-" e ".")
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(a\.?m\.?|p\.?m\.?|AM|PM)?/i);
    if (m) {
      let a = +m[1], b = +m[2];
      let year = +m[3];
      if (year < 100) year += year < 70 ? 2000 : 1900;
      let day, month;
      const useMDY = order === 'mdy' ? true : (order === 'dmy' ? false : a > 12);
      if (useMDY && a <= 12) { month = a; day = b; }
      else if (a > 12) { day = a; month = b; }
      else if (b > 12) { month = a; day = b; }
      else { day = a; month = b; } // padrão pt-BR: dia primeiro
      let hour = +(m[4] || 0);
      const ampm = (m[7] || '').toLowerCase().replace(/\./g, '');
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const d = new Date(year, month - 1, day, hour, +(m[5] || 0), +(m[6] || 0));
      return isNaN(d) ? null : d;
    }

    // Texto puramente numérico: serial do Excel ou timestamp — nunca "ano 45000"
    if (/^\d+(?:\.\d+)?$/.test(s)) return parseDate(Number(s));

    const fallback = new Date(s);
    return isNaN(fallback) ? null : fallback;
  }

  /**
   * Detecta se uma lista de textos de data usa dia-primeiro ou mês-primeiro.
   * @returns {'dmy'|'mdy'}
   */
  function detectDateOrder(values) {
    let firstOver12 = 0, secondOver12 = 0;
    for (const v of values) {
      const m = String(v || '').trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
      if (!m) continue;
      if (+m[1] > 12) firstOver12++;
      if (+m[2] > 12) secondOver12++;
    }
    if (secondOver12 > firstOver12) return 'mdy';
    return 'dmy';
  }

  function isValidDate(d) { return d instanceof Date && !isNaN(d); }

  function fmtDate(value) {
    const d = parseDate(value);
    if (!isValidDate(d)) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDateTime(value) {
    const d = parseDate(value);
    if (!isValidDate(d)) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  /** Valor para <input type="date">. */
  function toDateInput(value) {
    const d = parseDate(value);
    if (!isValidDate(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function daysBetween(a, b) {
    const d1 = startOfDay(parseDate(a)), d2 = startOfDay(parseDate(b));
    if (!isValidDate(d1) || !isValidDate(d2)) return null;
    return Math.round((d2 - d1) / MS_DAY);
  }
  function daysSince(value) {
    const d = parseDate(value);
    if (!isValidDate(d)) return null;
    return Math.max(0, Math.floor((startOfDay(new Date()) - startOfDay(d)) / MS_DAY));
  }
  /** "há 3 dias", "hoje", "ontem" */
  function relativeDays(value) {
    const n = daysSince(value);
    if (n === null) return '—';
    if (n === 0) return 'hoje';
    if (n === 1) return 'ontem';
    if (n < 30) return `há ${n} dias`;
    if (n < 60) return 'há 1 mês';
    if (n < 365) return `há ${Math.floor(n / 30)} meses`;
    return `há ${Math.floor(n / 365)} ano(s)`;
  }
  /** Chave de agrupamento temporal. */
  function periodKey(date, granularity) {
    const d = parseDate(date);
    if (!isValidDate(d)) return null;
    const p = n => String(n).padStart(2, '0');
    if (granularity === 'month') return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
    if (granularity === 'week') {
      const t = startOfDay(d);
      t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); // segunda-feira
      return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
    }
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function periodLabel(key, granularity) {
    if (!key) return '—';
    if (granularity === 'month') {
      const [y, m] = key.split('-');
      const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      return `${names[+m - 1]}/${String(y).slice(2)}`;
    }
    const [y, m, d] = key.split('-');
    return granularity === 'week' ? `${d}/${m}` : `${d}/${m}`;
  }
  function formatDuration(days) {
    if (days === null || days === undefined || Number.isNaN(days)) return '—';
    if (days < 1) return num(days * 24, 1) + ' h';
    return num(days, 1) + ' d';
  }

  /* ---------- Coleções ---------- */
  function groupBy(list, keyFn) {
    const map = new Map();
    for (const item of list) {
      const key = keyFn(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }
  function countBy(list, keyFn) {
    const map = new Map();
    for (const item of list) {
      const key = keyFn(item);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }
  function unique(list) { return Array.from(new Set(list.filter(v => v !== null && v !== undefined && v !== ''))); }

  function sortBy(list, keyFn, dir) {
    const factor = dir === 'desc' ? -1 : 1;
    return list.slice().sort((a, b) => {
      const va = keyFn(a), vb = keyFn(b);
      if (va === null || va === undefined || va === '') return 1;
      if (vb === null || vb === undefined || vb === '') return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * factor;
    });
  }

  /* ---------- Diversos ---------- */
  function debounce(fn, wait) {
    let timer;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(ctx, args), wait || 220);
    };
  }

  function downloadFile(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /** Gera CSV a partir de linhas de objetos (com BOM para abrir bem no Excel). */
  function toCSV(rows, columns, delimiter) {
    const sep = delimiter || ';';
    const cols = columns && columns.length ? columns : (rows[0] ? Object.keys(rows[0]) : []);
    // Sempre entre aspas: evita problemas com separadores, quebras de linha e acentos.
    const escapeCell = v => {
      if (v === null || v === undefined) return '""';
      return '"' + String(v).replace(/"/g, '""') + '"';
    };
    const lines = [cols.map(escapeCell).join(sep)];
    for (const row of rows) lines.push(cols.map(c => escapeCell(row[c])).join(sep));
    return '\uFEFF' + lines.join('\r\n');
  }

  function timestampSlug() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  global.U = {
    $, $$, html, esc, icon, uid, normalize, initials, truncate, colorFor,
    num, pct, clamp, median, average,
    parseDate, detectDateOrder, isValidDate, fmtDate, fmtDateTime, toDateInput,
    startOfDay, daysBetween, daysSince, relativeDays, periodKey, periodLabel, formatDuration,
    groupBy, countBy, unique, sortBy,
    debounce, downloadFile, toCSV, timestampSlug, plural, MS_DAY
  };
})(window);
