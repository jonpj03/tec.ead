/* =========================================================
   csv-parser.js — leitura de CSV 100% no navegador
   Sem bibliotecas: implementação própria (RFC 4180 tolerante).
   Exposto globalmente como window.CSV
   ========================================================= */
(function (global) {
  'use strict';

  const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'];

  /** Remove BOM e normaliza quebras de linha. */
  function clean(text) {
    let out = String(text || '');
    if (out.charCodeAt(0) === 0xFEFF) out = out.slice(1);
    return out.replace(/\r\n?/g, '\n');
  }

  /**
   * Detecta o separador contando ocorrências fora de aspas nas primeiras linhas.
   */
  function detectDelimiter(text) {
    const sample = text.split('\n').slice(0, 25).join('\n');
    let best = ',', bestScore = -1;
    for (const delim of CANDIDATE_DELIMITERS) {
      const counts = [];
      let inQuotes = false, count = 0;
      for (let i = 0; i < sample.length; i++) {
        const ch = sample[i];
        if (ch === '"') {
          if (inQuotes && sample[i + 1] === '"') { i++; continue; }
          inQuotes = !inQuotes;
        } else if (!inQuotes && ch === delim) count++;
        else if (!inQuotes && ch === '\n') { counts.push(count); count = 0; }
      }
      counts.push(count);
      const valid = counts.filter(c => c > 0);
      if (!valid.length) continue;
      // consistência: mesma quantidade de separadores por linha
      const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
      const variance = valid.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / valid.length;
      const score = avg * 10 - variance * 3;
      if (score > bestScore) { bestScore = score; best = delim; }
    }
    return best;
  }

  /** Divide o texto em matriz de células respeitando aspas. */
  function parseMatrix(text, delimiter) {
    const rows = [];
    let row = [], field = '', inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
        continue;
      }
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === delimiter) { row.push(field); field = ''; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += ch;
    }
    row.push(field);
    rows.push(row);

    // remove linhas totalmente vazias
    return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
  }

  function uniqueHeaders(list) {
    const seen = new Map();
    return list.map((raw, index) => {
      let name = String(raw || '').trim().replace(/^\uFEFF/, '');
      if (!name) name = `Coluna ${index + 1}`;
      const count = seen.get(name) || 0;
      seen.set(name, count + 1);
      return count ? `${name} (${count + 1})` : name;
    });
  }

  /**
   * Analisa um texto CSV.
   * @param {string} text
   * @param {{delimiter?:string}} [options]
   * @returns {{headers:string[], rows:object[], matrix:string[][], delimiter:string, warnings:string[]}}
   */
  function parse(text, options) {
    const opts = options || {};
    const cleaned = clean(text);
    const warnings = [];
    if (!cleaned.trim()) throw new Error('O arquivo está vazio.');

    const delimiter = opts.delimiter || detectDelimiter(cleaned);
    const matrix = parseMatrix(cleaned, delimiter);
    if (!matrix.length) throw new Error('Não foi possível identificar linhas no arquivo.');

    const headers = uniqueHeaders(matrix[0]);
    if (headers.length < 2) {
      warnings.push('Apenas uma coluna foi identificada. Verifique se o separador do arquivo está correto.');
    }

    const rows = [];
    for (let i = 1; i < matrix.length; i++) {
      const cells = matrix[i];
      if (cells.length !== headers.length) {
        warnings.push(`Linha ${i + 1}: ${cells.length} valores para ${headers.length} colunas — os campos ausentes ficaram vazios.`);
      }
      const obj = {};
      headers.forEach((h, idx) => {
        const value = cells[idx];
        obj[h] = value === undefined || value === null ? '' : String(value).trim();
      });
      obj.__row = i + 1;
      rows.push(obj);
    }

    return {
      headers,
      rows,
      matrix,
      delimiter,
      warnings: warnings.slice(0, 8),
      warningCount: warnings.length
    };
  }

  /**
   * Lê um File como texto, testando UTF-8 e caindo para Windows-1252
   * quando o resultado apresenta caracteres de substituição (acentuação quebrada).
   */
  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Nenhum arquivo selecionado.'));
      if (file.size > 25 * 1024 * 1024) {
        return reject(new Error('Arquivo muito grande (limite de 25 MB para processamento no navegador).'));
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.onload = () => {
        const buffer = reader.result;
        let text = new TextDecoder('utf-8').decode(buffer);
        if (/\uFFFD/.test(text)) {
          try {
            const alt = new TextDecoder('windows-1252').decode(buffer);
            if (!/\uFFFD/.test(alt)) text = alt;
          } catch (e) { /* mantém UTF-8 */ }
        }
        resolve(text);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  global.CSV = { parse, readFile, detectDelimiter };
})(window);
