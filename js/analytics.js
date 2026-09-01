/* =========================================================
   analytics.js — interpretação do CSV do Trello e métricas
   Regra central: nada é inventado. Cada métrica declara o
   campo de que depende e é marcada como indisponível quando
   esse campo não existe no arquivo.
   Exposto globalmente como window.Analytics
   ========================================================= */
(function (global) {
  'use strict';
  const norm = U.normalize;

  /* ---------------------------------------------------------
     1) Papéis de coluna e sinônimos (inglês e português)
     --------------------------------------------------------- */
  const FIELDS = [
    { key: 'id', label: 'Identificador do card', synonyms: ['card id', 'cardid', 'id', 'id do cartao', 'id do card', 'short link', 'shortlink'] },
    { key: 'name', label: 'Nome do card', required: true, synonyms: ['card name', 'nome do cartao', 'nome do card', 'titulo', 'title', 'name', 'assunto', 'cartao'] },
    { key: 'list', label: 'Lista', required: true, synonyms: ['list name', 'list', 'lista', 'nome da lista', 'coluna', 'status'] },
    { key: 'members', label: 'Membros / responsáveis', synonyms: ['members', 'member', 'membros', 'responsavel', 'responsaveis', 'assignee', 'assigned to', 'produtor', 'atribuido a'] },
    { key: 'labels', label: 'Etiquetas', synonyms: ['labels', 'label', 'etiquetas', 'etiqueta', 'tags', 'tag'] },
    { key: 'created', label: 'Data de criação', synonyms: ['card created date', 'created date', 'date created', 'created', 'data de criacao', 'criado em', 'data criacao', 'criacao'] },
    { key: 'due', label: 'Data de entrega (prazo)', synonyms: ['due date', 'due', 'data de entrega', 'vencimento', 'prazo', 'data limite', 'entrega'] },
    { key: 'dueComplete', label: 'Prazo marcado como concluído', synonyms: ['due complete', 'duecomplete', 'vencimento concluido', 'prazo concluido', 'concluido'] },
    { key: 'start', label: 'Data de início', synonyms: ['start date', 'start', 'data de inicio', 'inicio'] },
    { key: 'lastActivity', label: 'Última atividade', synonyms: ['last activity date', 'last activity', 'ultima atividade', 'date last activity', 'atualizado em', 'modificado em'] },
    { key: 'completed', label: 'Data de conclusão', synonyms: ['completed date', 'date completed', 'data de conclusao', 'concluido em', 'date closed', 'closed date', 'finalizado em', 'data conclusao'] },
    { key: 'archived', label: 'Arquivado', synonyms: ['archived', 'arquivado', 'closed', 'fechado'] },
    { key: 'board', label: 'Quadro', synonyms: ['board name', 'board', 'quadro', 'nome do quadro'] },
    { key: 'description', label: 'Descrição', synonyms: ['card description', 'description', 'descricao', 'desc'] },
    { key: 'url', label: 'Link do card', synonyms: ['card url', 'url', 'link', 'endereco'] },
    { key: 'checklistTotal', label: 'Itens de checklist', synonyms: ['checklist item count', 'checklist items', 'itens de checklist', 'total checklist'] },
    { key: 'checklistDone', label: 'Itens de checklist concluídos', synonyms: ['checklist items completed', 'checklist completed', 'itens de checklist concluidos'] },
    { key: 'comments', label: 'Comentários', synonyms: ['comment count', 'comments', 'comentarios'] },
    { key: 'attachments', label: 'Anexos', synonyms: ['attachment count', 'attachments', 'anexos'] },
    { key: 'votes', label: 'Votos', synonyms: ['vote count', 'votes', 'votos'] }
  ];

  /**
   * Associa cada papel a uma coluna do arquivo.
   * Ordem: correspondência exata → início do texto → contém.
   */
  function detectMapping(headers) {
    const used = new Set();
    const mapping = {};
    const normalized = headers.map(h => ({ raw: h, n: norm(h) }));

    const tryMatch = (field, predicate) => {
      for (const header of normalized) {
        if (used.has(header.raw)) continue;
        if (field.synonyms.some(s => predicate(header.n, norm(s)))) {
          mapping[field.key] = header.raw;
          used.add(header.raw);
          return true;
        }
      }
      return false;
    };

    // 1ª passada: igualdade exata (mais confiável)
    FIELDS.forEach(f => { if (!mapping[f.key]) tryMatch(f, (h, s) => h === s); });
    // 2ª passada: cabeçalho começa com o sinônimo
    FIELDS.forEach(f => { if (!mapping[f.key]) tryMatch(f, (h, s) => s.length > 3 && h.startsWith(s)); });
    // 3ª passada: cabeçalho contém o sinônimo
    FIELDS.forEach(f => { if (!mapping[f.key]) tryMatch(f, (h, s) => s.length > 4 && h.includes(s)); });

    return mapping;
  }

  /* ---------------------------------------------------------
     2) Conversões auxiliares
     --------------------------------------------------------- */
  const TRUE_VALUES = ['true', 'sim', 'yes', '1', 'x', 'verdadeiro', 'concluido', 'concluído'];
  function toBool(value) {
    if (value === true) return true;
    if (value === null || value === undefined || value === '') return false;
    return TRUE_VALUES.includes(norm(value));
  }
  function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const cleaned = String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? null : n;
  }
  function splitList(value) {
    if (!value) return [];
    return String(value)
      .split(/[,;|]/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  /** O ID do Trello (ObjectId de 24 hex) carrega o timestamp de criação. */
  function dateFromTrelloId(id) {
    const s = String(id || '').trim();
    if (!/^[0-9a-f]{24}$/i.test(s)) return null;
    const seconds = parseInt(s.slice(0, 8), 16);
    if (!seconds || seconds < 1200000000) return null; // antes de 2008: descarta
    const d = new Date(seconds * 1000);
    return isNaN(d) ? null : d;
  }

  function keywordList(text) {
    return String(text || '').split(',').map(s => norm(s)).filter(Boolean);
  }

  /* ---------------------------------------------------------
     3) Construção dos cards normalizados
     --------------------------------------------------------- */
  /**
   * @param {object[]} rows linhas do CSV
   * @param {object} mapping papel → cabeçalho
   * @param {object} config configurações do analisador
   */
  function buildCards(rows, mapping, config) {
    const doneWords = keywordList(config.doneKeywords);
    const doingWords = keywordList(config.doingKeywords);

    // Ordem de datas (dd/mm vs mm/dd) detectada por coluna
    const dateOrders = {};
    ['created', 'due', 'start', 'lastActivity', 'completed'].forEach(key => {
      const col = mapping[key];
      if (!col) return;
      dateOrders[key] = U.detectDateOrder(rows.slice(0, 300).map(r => r[col]));
    });
    const readDate = (row, key) => {
      const col = mapping[key];
      if (!col) return null;
      return U.parseDate(row[col], dateOrders[key]);
    };

    let idDerivedCreated = 0;

    const cards = rows.map((row, index) => {
      const get = key => (mapping[key] ? row[mapping[key]] : '');

      const id = String(get('id') || '').trim();
      let created = readDate(row, 'created');
      if (!created) {
        const fromId = dateFromTrelloId(id);
        if (fromId) { created = fromId; idDerivedCreated++; }
      }

      const listName = String(get('list') || '').trim();
      const listNorm = norm(listName);
      const archived = mapping.archived ? toBool(get('archived')) : false;
      const dueComplete = mapping.dueComplete ? toBool(get('dueComplete')) : false;
      const completedExplicit = readDate(row, 'completed');

      const matchedDone = doneWords.some(w => w && listNorm.includes(w));
      const matchedDoing = doingWords.some(w => w && listNorm.includes(w));

      let status;
      if (completedExplicit || dueComplete || matchedDone || (archived && config.treatArchivedAsDone)) status = 'done';
      else if (matchedDoing) status = 'doing';
      else status = 'pending';

      const lastActivity = readDate(row, 'lastActivity');
      let completed = completedExplicit;
      let completedEstimated = false;
      if (!completed && status === 'done' && lastActivity) {
        completed = lastActivity;         // aproximação declarada
        completedEstimated = true;
      }

      const due = readDate(row, 'due');
      const members = splitList(get('members'));
      const labels = splitList(get('labels'));

      const now = new Date();
      const leadTime = (created && completed) ? Math.max(0, (completed - created) / U.MS_DAY) : null;
      const age = (created && status !== 'done') ? Math.max(0, (now - created) / U.MS_DAY) : null;
      const idle = lastActivity ? Math.max(0, (now - lastActivity) / U.MS_DAY) : null;

      return {
        index,
        rowNumber: row.__row || index + 2,
        raw: row,
        id: id || `linha-${index + 2}`,
        name: String(get('name') || '').trim() || '(sem nome)',
        list: listName,
        board: String(get('board') || '').trim(),
        description: String(get('description') || '').trim(),
        url: String(get('url') || '').trim(),
        members,
        labels,
        created, due, start: readDate(row, 'start'), lastActivity, completed,
        completedEstimated,
        dueComplete, archived,
        checklistTotal: toNumber(get('checklistTotal')),
        checklistDone: toNumber(get('checklistDone')),
        comments: toNumber(get('comments')),
        attachments: toNumber(get('attachments')),
        status,
        isOverdue: !!(due && status !== 'done' && due < new Date()),
        leadTime, age, idle
      };
    });

    return { cards, idDerivedCreated, dateOrders };
  }

  /* ---------------------------------------------------------
     4) Capacidades — o que pode ou não ser calculado
     --------------------------------------------------------- */
  function buildCapabilities(cards, mapping, idDerivedCreated) {
    const has = key => !!mapping[key];
    const withCreated = cards.filter(c => c.created).length;
    const doneCards = cards.filter(c => c.status === 'done');
    const withLead = doneCards.filter(c => c.leadTime !== null).length;

    return {
      created: {
        ok: withCreated > 0,
        source: has('created') ? 'coluna de data de criação' : (idDerivedCreated ? 'identificador do card' : null),
        coverage: cards.length ? withCreated / cards.length : 0,
        reason: 'O arquivo não possui coluna de data de criação nem identificadores do Trello que permitam derivá-la.'
      },
      completed: {
        ok: doneCards.some(c => c.completed),
        estimated: doneCards.some(c => c.completedEstimated) && !has('completed'),
        coverage: doneCards.length ? doneCards.filter(c => c.completed).length / doneCards.length : 0,
        reason: 'Não há coluna de data de conclusão nem de última atividade para estimar quando os cards foram concluídos.'
      },
      members: {
        ok: has('members'),
        reason: 'O arquivo não possui coluna de membros/responsáveis, então não é possível analisar produção por pessoa.'
      },
      labels: { ok: has('labels'), reason: 'O arquivo não possui coluna de etiquetas.' },
      due: { ok: has('due'), reason: 'O arquivo não possui coluna de data de entrega, então não é possível identificar atrasos.' },
      list: { ok: has('list'), reason: 'O arquivo não possui coluna de lista, base para classificar os cards em concluído, em produção e pendente.' },
      leadTime: {
        ok: withLead > 0,
        count: withLead,
        reason: 'Lead time exige data de criação e data de conclusão no mesmo card. O arquivo não fornece ambas.'
      },
      activity: { ok: has('lastActivity'), reason: 'O arquivo não possui coluna de última atividade.' }
    };
  }

  /* ---------------------------------------------------------
     5) Séries temporais
     --------------------------------------------------------- */
  function buildRange(days, cards) {
    const end = U.startOfDay(new Date());
    let start;
    if (days === 'all') {
      const dates = cards.map(c => c.created || c.completed).filter(Boolean);
      start = dates.length ? U.startOfDay(new Date(Math.min.apply(null, dates))) : new Date(end);
    } else {
      start = new Date(end);
      start.setDate(start.getDate() - (Number(days) - 1));
    }
    return { start, end };
  }

  function pickGranularity(range, forced) {
    if (forced && forced !== 'auto') return forced;
    const span = Math.max(1, Math.round((range.end - range.start) / U.MS_DAY));
    if (span <= 45) return 'day';
    if (span <= 200) return 'week';
    return 'month';
  }

  function periodSeries(range, granularity) {
    const keys = [];
    const cursor = new Date(range.start);
    if (granularity === 'week') cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    if (granularity === 'month') cursor.setDate(1);
    let guard = 0;
    while (cursor <= range.end && guard++ < 800) {
      keys.push(U.periodKey(cursor, granularity));
      if (granularity === 'day') cursor.setDate(cursor.getDate() + 1);
      else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }

  /* ---------------------------------------------------------
     6) Análise principal
     --------------------------------------------------------- */
  /**
   * @param {object[]} cards
   * @param {object} config { agingAttention, agingCritical, period, granularity }
   */
  function analyze(cards, mapping, config, capabilities) {
    const now = new Date();
    const total = cards.length;
    const done = cards.filter(c => c.status === 'done');
    const doing = cards.filter(c => c.status === 'doing');
    const pending = cards.filter(c => c.status === 'pending');
    const open = cards.filter(c => c.status !== 'done');
    const overdue = cards.filter(c => c.isOverdue);
    const unassigned = cards.filter(c => !c.members.length);

    const range = buildRange(config.period, cards);
    const granularity = pickGranularity(range, config.granularity);
    const keys = periodSeries(range, granularity);

    const inRange = d => d && d >= range.start && d <= new Date(range.end.getTime() + U.MS_DAY - 1);
    const completedInRange = done.filter(c => inRange(c.completed));
    const createdInRange = cards.filter(c => inRange(c.created));

    /* --- séries --- */
    const completedByKey = U.countBy(done.filter(c => c.completed), c => U.periodKey(c.completed, granularity));
    const createdByKey = U.countBy(cards.filter(c => c.created), c => U.periodKey(c.created, granularity));
    const series = {
      granularity,
      labels: keys.map(k => U.periodLabel(k, granularity)),
      completed: keys.map(k => completedByKey.get(k) || 0),
      created: keys.map(k => createdByKey.get(k) || 0)
    };

    // Backlog acumulado: criados até a data − concluídos até a data
    series.backlog = (function () {
      if (!capabilities.created.ok) return null;
      const out = [];
      keys.forEach(k => {
        const limit = endOfPeriod(k, granularity);
        const createdUntil = cards.filter(c => c.created && c.created <= limit).length;
        const doneUntil = done.filter(c => c.completed && c.completed <= limit).length;
        out.push(Math.max(0, createdUntil - doneUntil));
      });
      return out;
    })();

    /* --- comparação de períodos --- */
    const spanDays = Math.max(1, Math.round((range.end - range.start) / U.MS_DAY) + 1);
    const prevEnd = new Date(range.start.getTime() - U.MS_DAY);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (spanDays - 1));
    const inPrev = d => d && d >= prevStart && d <= new Date(prevEnd.getTime() + U.MS_DAY - 1);

    const previous = {
      start: prevStart, end: prevEnd,
      completed: done.filter(c => inPrev(c.completed)).length,
      created: cards.filter(c => inPrev(c.created)).length,
      leadTime: U.average(done.filter(c => inPrev(c.completed) && c.leadTime !== null).map(c => c.leadTime))
    };

    /* --- lead time --- */
    const leadValues = done.filter(c => c.leadTime !== null).map(c => c.leadTime);
    const leadRange = completedInRange.filter(c => c.leadTime !== null).map(c => c.leadTime);
    const leadTime = {
      count: leadValues.length,
      avg: U.average(leadValues),
      median: U.median(leadValues),
      min: leadValues.length ? Math.min.apply(null, leadValues) : null,
      max: leadValues.length ? Math.max.apply(null, leadValues) : null,
      avgInRange: U.average(leadRange)
    };

    /* --- aging / backlog --- */
    const ageValues = open.filter(c => c.age !== null).map(c => c.age);
    const buckets = {
      normal: open.filter(c => c.age !== null && c.age < config.agingAttention),
      attention: open.filter(c => c.age !== null && c.age >= config.agingAttention && c.age < config.agingCritical),
      critical: open.filter(c => c.age !== null && c.age >= config.agingCritical),
      unknown: open.filter(c => c.age === null)
    };
    const idleCards = open.filter(c => c.idle !== null && c.idle >= config.agingCritical);

    /* --- por membro --- */
    const memberMap = new Map();
    if (capabilities.members.ok) {
      cards.forEach(card => {
        const people = card.members.length ? card.members : ['(sem responsável)'];
        people.forEach(person => {
          if (!memberMap.has(person)) {
            memberMap.set(person, { name: person, total: 0, done: 0, doing: 0, pending: 0, overdue: 0, leadTimes: [], doneInRange: 0 });
          }
          const m = memberMap.get(person);
          m.total++;
          if (card.status === 'done') m.done++;
          else if (card.status === 'doing') m.doing++;
          else m.pending++;
          if (card.isOverdue) m.overdue++;
          if (card.leadTime !== null && card.status === 'done') m.leadTimes.push(card.leadTime);
          if (card.status === 'done' && inRange(card.completed)) m.doneInRange++;
        });
      });
    }
    const members = Array.from(memberMap.values()).map(m => ({
      name: m.name,
      total: m.total, done: m.done, doing: m.doing, pending: m.pending, overdue: m.overdue,
      doneInRange: m.doneInRange,
      avgLeadTime: U.average(m.leadTimes),
      completionRate: m.total ? m.done / m.total : 0
    })).sort((a, b) => b.total - a.total);

    /* --- concentração da produção --- */
    const doneByMember = members.filter(m => m.name !== '(sem responsável)').slice().sort((a, b) => b.done - a.done);
    const totalDoneAssigned = doneByMember.reduce((sum, m) => sum + m.done, 0);
    const top3 = doneByMember.slice(0, 3);
    const concentration = totalDoneAssigned
      ? top3.reduce((sum, m) => sum + m.done, 0) / totalDoneAssigned
      : null;

    /* --- listas e etiquetas --- */
    const byList = Array.from(U.countBy(cards, c => c.list || '(sem lista)'), ([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    const labelCounts = new Map();
    cards.forEach(c => c.labels.forEach(l => labelCounts.set(l, (labelCounts.get(l) || 0) + 1)));
    const byLabel = Array.from(labelCounts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    /* --- throughput --- */
    const activePeriods = series.completed.filter(v => v > 0).length;
    const throughput = {
      perPeriod: series.completed.length ? U.average(series.completed) : null,
      granularity,
      activePeriods,
      inRange: completedInRange.length,
      perDay: spanDays ? completedInRange.length / spanDays : null
    };

    return {
      generatedAt: now,
      totals: {
        total, done: done.length, doing: doing.length, pending: pending.length,
        open: open.length, overdue: overdue.length, unassigned: unassigned.length,
        archived: cards.filter(c => c.archived).length,
        members: capabilities.members.ok ? new Set(cards.flatMap(c => c.members)).size : null,
        lists: new Set(cards.map(c => c.list).filter(Boolean)).size,
        completionRate: total ? done.length / total : 0,
        completedInRange: completedInRange.length,
        createdInRange: createdInRange.length
      },
      range, granularity, spanDays,
      series, previous, leadTime, throughput,
      backlog: {
        total: open.length,
        buckets,
        avgAge: U.average(ageValues),
        maxAge: ageValues.length ? Math.max.apply(null, ageValues) : null,
        idleCards,
        oldest: open.filter(c => c.created).sort((a, b) => a.created - b.created).slice(0, 10)
      },
      members, concentration, top3, byList, byLabel,
      cards
    };
  }

  function endOfPeriod(key, granularity) {
    const parts = key.split('-').map(Number);
    if (granularity === 'month') return new Date(parts[0], parts[1], 0, 23, 59, 59);
    const d = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
    if (granularity === 'week') d.setDate(d.getDate() + 6);
    return d;
  }

  /* ---------------------------------------------------------
     7) Resumo em linguagem natural (a partir dos dados)
     --------------------------------------------------------- */
  function buildSummary(result, caps, config) {
    const t = result.totals;
    const lines = [];
    const periodLabel = config.period === 'all'
      ? 'em todo o período do arquivo'
      : `nos últimos ${config.period} dias`;

    const cardsLabel = `<b>${U.num(t.total)}</b> ${U.plural(t.total, 'card', 'cards')}`;
    lines.push(t.lists > 0
      ? `O arquivo contém ${cardsLabel} ${U.plural(t.total, 'distribuído', 'distribuídos')} em <b>${U.num(t.lists)}</b> ${U.plural(t.lists, 'lista', 'listas')}.`
      : `O arquivo contém ${cardsLabel}. A coluna de lista não foi identificada, então a distribuição por etapa não pôde ser calculada.`);

    if (caps.completed.ok) {
      lines.push(`<b>${U.num(t.completedInRange)}</b> ${U.plural(t.completedInRange, 'card foi concluído', 'cards foram concluídos')} ${periodLabel}.`);
    }
    lines.push(`A equipe tem <b>${U.num(t.doing)}</b> ${U.plural(t.doing, 'card em produção', 'cards em produção')} e <b>${U.num(t.pending)}</b> ${U.plural(t.pending, 'card pendente', 'cards pendentes')}.`);

    if (caps.members.ok) {
      lines.push(`<b>${U.num(t.members)}</b> ${U.plural(t.members, 'pessoa aparece', 'pessoas aparecem')} como responsável nos cards.`);
      if (t.unassigned) lines.push(`Existem <b>${U.num(t.unassigned)}</b> ${U.plural(t.unassigned, 'card sem responsável', 'cards sem responsável')}.`);
      if (result.concentration !== null && result.top3.length >= 2) {
        lines.push(`${result.top3.length} ${U.plural(result.top3.length, 'pessoa concentra', 'pessoas concentram')} <b>${U.pct(result.concentration, 1, 1)}</b> dos cards concluídos.`);
      }
    }
    if (caps.due.ok && t.overdue) {
      lines.push(`<b>${U.num(t.overdue)}</b> ${U.plural(t.overdue, 'card está', 'cards estão')} com o prazo vencido.`);
    }
    const critical = result.backlog.buckets.critical.length;
    if (caps.created.ok && critical) {
      lines.push(`<b>${U.num(critical)}</b> ${U.plural(critical, 'card está aberto', 'cards estão abertos')} há mais de ${config.agingCritical} dias.`);
    }
    if (result.leadTime.avg !== null) {
      lines.push(`O tempo médio entre criação e conclusão é de <b>${U.formatDuration(result.leadTime.avg)}</b> (mediana de ${U.formatDuration(result.leadTime.median)}).`);
    }
    return lines;
  }

  /* ---------------------------------------------------------
     8) Insights automáticos
     --------------------------------------------------------- */
  function buildInsights(result, caps, config) {
    const insights = [];
    const t = result.totals;

    // Evolução da produção
    if (caps.completed.ok && result.previous.completed > 0) {
      const change = ((t.completedInRange - result.previous.completed) / result.previous.completed) * 100;
      if (change >= 10) {
        insights.push({ type: 'ok', title: 'Produção em alta', icon: 'up',
          text: `Foram concluídos ${U.num(t.completedInRange)} cards no período, contra ${U.num(result.previous.completed)} no período anterior de mesmo tamanho (${U.num(change, 1)}% a mais).` });
      } else if (change <= -10) {
        insights.push({ type: 'warn', title: 'Produção em queda', icon: 'down',
          text: `Foram concluídos ${U.num(t.completedInRange)} cards no período, contra ${U.num(result.previous.completed)} no período anterior (${U.num(Math.abs(change), 1)}% a menos).` });
      } else {
        insights.push({ type: 'info', title: 'Produção estável', icon: 'activity',
          text: `A conclusão de cards variou pouco em relação ao período anterior (${U.num(t.completedInRange)} contra ${U.num(result.previous.completed)}).` });
      }
    }

    // Entrada versus saída
    if (caps.created.ok && caps.completed.ok && t.createdInRange > 0) {
      const ratio = t.completedInRange / t.createdInRange;
      if (ratio < 0.8) {
        insights.push({ type: 'risk', title: 'Backlog crescendo', icon: 'alert',
          text: `Entraram ${U.num(t.createdInRange)} cards no período e apenas ${U.num(t.completedInRange)} foram concluídos. Nesse ritmo, a fila continua aumentando.` });
      } else if (ratio > 1.15) {
        insights.push({ type: 'ok', title: 'Fila diminuindo', icon: 'check',
          text: `A equipe concluiu ${U.num(t.completedInRange)} cards contra ${U.num(t.createdInRange)} novos no período — o backlog está sendo reduzido.` });
      }
    }

    // Concentração
    if (caps.members.ok && result.concentration !== null && result.top3.length >= 3) {
      if (result.concentration >= 0.6) {
        insights.push({ type: 'warn', title: 'Produção concentrada', icon: 'users',
          text: `${result.top3.map(m => m.name).join(', ')} respondem por ${U.pct(result.concentration, 1, 1)} dos cards concluídos. Vale avaliar risco de dependência e sobrecarga.` });
      }
      const overloaded = result.members.filter(m => m.name !== '(sem responsável)')
        .sort((a, b) => (b.doing + b.pending) - (a.doing + a.pending))[0];
      if (overloaded && result.members.length > 2) {
        const avgOpen = U.average(result.members.map(m => m.doing + m.pending));
        if (avgOpen && (overloaded.doing + overloaded.pending) > avgOpen * 1.8) {
          insights.push({ type: 'warn', title: 'Possível sobrecarga', icon: 'users',
            text: `${overloaded.name} acumula ${U.num(overloaded.doing + overloaded.pending)} cards abertos, bem acima da média da equipe (${U.num(avgOpen, 1)}).` });
        }
      }
    }

    // Cards antigos
    const critical = result.backlog.buckets.critical.length;
    if (caps.created.ok && critical > 0) {
      insights.push({ type: 'risk', title: 'Cards parados há muito tempo', icon: 'clock',
        text: `${U.num(critical)} ${U.plural(critical, 'card está aberto', 'cards estão abertos')} há mais de ${config.agingCritical} dias. O mais antigo está há ${U.formatDuration(result.backlog.maxAge)}.` });
    }

    // Sem responsável
    if (caps.members.ok && t.unassigned > 0) {
      const share = t.unassigned / t.total;
      insights.push({ type: share > 0.15 ? 'warn' : 'info', title: 'Cards sem responsável', icon: 'info',
        text: `${U.num(t.unassigned)} ${U.plural(t.unassigned, 'card não tem', 'cards não têm')} ninguém atribuído (${U.pct(t.unassigned, t.total)} do total). Isso reduz a rastreabilidade da produção.` });
    }

    // Atrasos
    if (caps.due.ok && t.overdue > 0) {
      insights.push({ type: t.overdue > t.open * 0.2 ? 'risk' : 'warn', title: 'Cards com prazo vencido', icon: 'alert',
        text: `${U.num(t.overdue)} ${U.plural(t.overdue, 'card passou', 'cards passaram')} da data de entrega e ainda não ${U.plural(t.overdue, 'foi concluído', 'foram concluídos')}.` });
    }

    // Cards sem movimentação
    if (caps.activity.ok && result.backlog.idleCards.length) {
      insights.push({ type: 'warn', title: 'Cards sem movimentação', icon: 'refresh',
        text: `${U.num(result.backlog.idleCards.length)} ${U.plural(result.backlog.idleCards.length, 'card aberto não registra', 'cards abertos não registram')} atividade há mais de ${config.agingCritical} dias.` });
    }

    // Taxa de conclusão
    if (t.total) {
      const rate = t.completionRate;
      if (rate >= 0.7) {
        insights.push({ type: 'ok', title: 'Boa taxa de conclusão', icon: 'check',
          text: `${U.pct(t.done, t.total)} dos cards do arquivo já estão concluídos.` });
      } else if (rate < 0.3) {
        insights.push({ type: 'info', title: 'Maior parte ainda aberta', icon: 'info',
          text: `Apenas ${U.pct(t.done, t.total)} dos cards estão concluídos — o arquivo representa principalmente trabalho em aberto.` });
      }
    }

    return insights;
  }

  global.Analytics = {
    FIELDS, detectMapping, buildCards, buildCapabilities, analyze, buildSummary, buildInsights,
    dateFromTrelloId
  };
})(window);
