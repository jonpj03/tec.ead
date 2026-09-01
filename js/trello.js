/* =========================================================
   trello.js — tela do Analisador de CSV do Trello
   O arquivo é lido e processado apenas na memória do navegador.
   Exposto globalmente como window.Trello
   ========================================================= */
(function (global) {
  'use strict';
  const { $, $$, esc, icon, html } = U;

  /* Estado da sessão de análise (não é persistido) */
  const state = {
    fileName: '',
    fileSize: 0,
    parsed: null,     // { headers, rows, delimiter, warnings }
    mapping: null,
    cards: null,
    caps: null,
    result: null,
    idDerivedCreated: 0,
    tab: 'overview',
    config: null,
    table: { search: '', sort: null, dir: 'asc', page: 1, hidden: new Set() }
  };

  function currentConfig() {
    const t = Store.settings().trello;
    return {
      agingAttention: Number(t.agingAttention) || 7,
      agingCritical: Number(t.agingCritical) || 14,
      period: state.config ? state.config.period : (t.defaultPeriod || 30),
      granularity: state.config ? state.config.granularity : 'auto',
      doneKeywords: t.doneKeywords,
      doingKeywords: t.doingKeywords,
      treatArchivedAsDone: !!t.treatArchivedAsDone
    };
  }

  /* ---------------------------------------------------------
     Tela inicial (upload)
     --------------------------------------------------------- */
  function render(view) {
    if (!state.result) return renderUpload(view);
    renderAnalysis(view);
  }

  function renderUpload(view) {
    view.innerHTML = `
      <div class="grid" style="grid-template-columns:minmax(0,1fr);gap:16px;max-width:860px;margin:0 auto">
        <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Enviar arquivo CSV">
          <div class="dropzone__icon">${icon('upload')}</div>
          <h2>Arraste o CSV exportado do Trello</h2>
          <p>O arquivo é lido pelo próprio navegador. Nada é enviado para servidores.</p>
          <p class="dropzone__or">ou</p>
          <button class="btn btn--primary" id="pickFile">${icon('file', 'ico--sm')} Selecionar arquivo</button>
          <input type="file" id="fileInput" accept=".csv,text/csv,text/plain" hidden>
        </div>

        <div class="panel">
          <div class="panel__head"><h2>Como exportar do Trello</h2></div>
          <div class="panel__body">
            <ol class="small muted" style="display:flex;flex-direction:column;gap:7px;list-style:decimal;padding-left:18px">
              <li>Abra o quadro no Trello e acesse o menu do quadro.</li>
              <li>Escolha <strong>Imprimir, exportar e compartilhar</strong> e depois <strong>Exportar como CSV</strong>.</li>
              <li>Envie o arquivo aqui. As colunas são identificadas automaticamente e você pode corrigir o mapeamento antes de analisar.</li>
            </ol>
            <div class="callout callout--info mt-16">${icon('info')}
              <div>O analisador funciona também com CSVs de outras origens, desde que existam colunas equivalentes de lista, responsável e datas. Separadores <code>,</code> <code>;</code> <code>tab</code> e <code>|</code> são reconhecidos automaticamente.</div>
            </div>
          </div>
        </div>
      </div>`;

    const dropzone = $('#dropzone', view);
    const input = $('#fileInput', view);

    $('#pickFile', view).addEventListener('click', e => { e.stopPropagation(); input.click(); });
    dropzone.addEventListener('click', () => input.click());
    dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { if (input.files[0]) handleFile(input.files[0], view); });

    ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, e => {
      e.preventDefault(); dropzone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, e => {
      e.preventDefault();
      if (evt === 'dragleave' && dropzone.contains(e.relatedTarget)) return;
      dropzone.classList.remove('is-over');
    }));
    dropzone.addEventListener('drop', e => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file, view);
    });
  }

  async function handleFile(file, view) {
    const isCSV = /\.(csv|txt|tsv)$/i.test(file.name) || /csv|text/.test(file.type);
    if (!isCSV) {
      UI.toast('Formato não suportado. Envie um arquivo .csv exportado do Trello.', 'error', 5000);
      return;
    }
    view.innerHTML = `<div class="panel"><div class="panel__body">
      <div class="row gap-12"><div class="skeleton" style="width:34px;height:34px;border-radius:10px"></div>
      <div class="grow"><div class="skeleton" style="height:12px;width:220px"></div>
      <div class="skeleton mt-8" style="height:10px;width:150px"></div></div></div>
      <div class="skeleton mt-16" style="height:150px"></div></div></div>`;

    try {
      const text = await CSV.readFile(file);
      const parsed = CSV.parse(text);
      if (!parsed.rows.length) throw new Error('O arquivo não possui linhas de dados além do cabeçalho.');

      state.fileName = file.name;
      state.fileSize = file.size;
      state.parsed = parsed;
      state.mapping = Analytics.detectMapping(parsed.headers);
      state.config = null;
      state.tab = 'overview';
      state.table = { search: '', sort: null, dir: 'asc', page: 1, hidden: new Set() };
      renderMapping(view);
    } catch (err) {
      console.error(err);
      state.parsed = null;
      renderUpload(view);
      UI.toast(err.message || 'Não foi possível ler o arquivo.', 'error', 6000);
    }
  }

  /* ---------------------------------------------------------
     Etapa: colunas identificadas
     --------------------------------------------------------- */
  function renderMapping(view) {
    const { headers, rows, delimiter, warnings, warningCount } = state.parsed;
    const mapping = state.mapping;
    const missingRequired = Analytics.FIELDS.filter(f => f.required && !mapping[f.key]);
    const delimiterName = { ',': 'vírgula', ';': 'ponto e vírgula', '\t': 'tabulação', '|': 'barra vertical' }[delimiter] || delimiter;

    view.innerHTML = `
      <div class="panel">
        <div class="panel__head">
          <div>
            <h2>Colunas identificadas</h2>
            <p class="tiny dim">Confirme o mapeamento antes de gerar o painel. Você pode corrigir qualquer campo.</p>
          </div>
          <div class="row gap-8">
            <span class="file-chip">${icon('file', 'ico--sm')} ${esc(U.truncate(state.fileName, 34))}
              <span class="dim num">${U.num(state.fileSize / 1024, 0)} KB</span></span>
            <button class="btn btn--sm" id="changeFile">Trocar arquivo</button>
          </div>
        </div>
        <div class="panel__body">
          <div class="row gap-16 row--wrap small dim" style="margin-bottom:14px">
            <span>${icon('table', 'ico--sm')} ${U.num(rows.length)} ${U.plural(rows.length, 'linha', 'linhas')}</span>
            <span>${icon('filter', 'ico--sm')} ${U.num(headers.length)} colunas</span>
            <span>${icon('info', 'ico--sm')} separador: ${esc(delimiterName)}</span>
          </div>

          ${missingRequired.length ? `<div class="callout callout--danger" style="margin-bottom:14px">${icon('alert')}
            <div><strong>Falta identificar ${missingRequired.length === 1 ? 'uma coluna essencial' : 'colunas essenciais'}:
            ${esc(missingRequired.map(f => f.label).join(', '))}.</strong><br>
            Selecione manualmente abaixo. Sem esses campos, boa parte das métricas não pode ser calculada.</div></div>` : ''}

          ${warningCount ? `<div class="callout callout--warn" style="margin-bottom:14px">${icon('alert')}
            <div><strong>${U.num(warningCount)} ${U.plural(warningCount, 'aviso de leitura', 'avisos de leitura')}.</strong>
            <ul class="mt-8 tiny">${warnings.map(w => `<li>· ${esc(w)}</li>`).join('')}</ul></div></div>` : ''}

          <div class="mapping-grid">
            ${Analytics.FIELDS.map(field => {
              const found = mapping[field.key];
              const pill = found ? 'pill--found' : (field.required ? 'pill--required' : 'pill--missing');
              const pillText = found ? 'identificada' : (field.required ? 'obrigatória' : 'não encontrada');
              return `<div class="mapping-item">
                <div class="mapping-item__head">
                  <strong>${esc(field.label)}</strong>
                  <span class="pill ${pill}">${pillText}</span>
                </div>
                <select class="select" data-map="${esc(field.key)}">
                  <option value="">— não usar —</option>
                  ${headers.map(h => `<option value="${esc(h)}" ${found === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}
                </select>
              </div>`;
            }).join('')}
          </div>

          <div class="method-note">
            Quando a coluna de data de criação não existe, a data é derivada do identificador do card do Trello
            (os 8 primeiros caracteres do ID contêm o horário de criação). Métricas sem campo de origem são exibidas
            como indisponíveis, com o motivo.
          </div>
        </div>
        <div class="panel__foot row row--between">
          <span class="tiny dim">Nenhum dado sai do navegador.</span>
          <button class="btn btn--primary" id="runAnalysis">${icon('activity', 'ico--sm')} Gerar análise</button>
        </div>
      </div>

      <div class="panel mt-16">
        <div class="panel__head"><h2>Prévia do arquivo</h2><span class="tiny dim">primeiras 5 linhas</span></div>
        <div class="table-wrap">
          <table class="table data-table">
            <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${rows.slice(0, 5).map(r => `<tr>${headers.map(h => `<td title="${esc(r[h])}">${esc(U.truncate(r[h], 60))}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`;

    view.querySelectorAll('[data-map]').forEach(select => {
      select.addEventListener('change', () => {
        const key = select.dataset.map;
        if (select.value) state.mapping[key] = select.value;
        else delete state.mapping[key];
        renderMapping(view);
      });
    });
    $('#changeFile', view).addEventListener('click', () => { resetAnalysis(); renderUpload(view); });
    $('#runAnalysis', view).addEventListener('click', () => runAnalysis(view));
  }

  function runAnalysis(view) {
    const config = currentConfig();
    const built = Analytics.buildCards(state.parsed.rows, state.mapping, config);
    state.cards = built.cards;
    state.idDerivedCreated = built.idDerivedCreated;
    state.caps = Analytics.buildCapabilities(state.cards, state.mapping, built.idDerivedCreated);
    state.config = { period: config.period, granularity: config.granularity };
    state.result = Analytics.analyze(state.cards, state.mapping, config, state.caps);
    renderAnalysis(view);
    UI.toast('Análise gerada a partir do arquivo.', 'ok');
  }

  function recompute(view) {
    const config = currentConfig();
    state.result = Analytics.analyze(state.cards, state.mapping, config, state.caps);
    renderAnalysis(view);
  }

  function resetAnalysis() {
    state.parsed = null; state.cards = null; state.result = null;
    state.mapping = null; state.caps = null; state.config = null;
    state.fileName = ''; state.tab = 'overview';
  }

  /* ---------------------------------------------------------
     Painel de análise
     --------------------------------------------------------- */
  const TABS = [
    { key: 'overview', label: 'Visão geral' },
    { key: 'team', label: 'Performance da equipe' },
    { key: 'timeline', label: 'Evolução' },
    { key: 'backlog', label: 'Backlog' },
    { key: 'efficiency', label: 'Eficiência' },
    { key: 'raw', label: 'Dados brutos' }
  ];

  function renderAnalysis(view) {
    const r = state.result, caps = state.caps, config = currentConfig();

    view.innerHTML = `
      <div class="row row--between row--wrap gap-12 no-print" style="margin-bottom:14px">
        <div class="row gap-8 row--wrap">
          <span class="file-chip">${icon('file', 'ico--sm')} ${esc(U.truncate(state.fileName, 30))}
            <span class="dim num">${U.num(r.totals.total)} cards</span></span>
          <button class="btn btn--sm" id="editMapping">${icon('filter', 'ico--sm')} Colunas</button>
          <button class="btn btn--sm" id="newFile">${icon('upload', 'ico--sm')} Analisar outro arquivo</button>
        </div>
        <div class="row gap-8 row--wrap">
          <div class="segmented" id="periodPicker">
            ${[7, 30, 90].map(d => `<button data-period="${d}" class="${String(config.period) === String(d) ? 'is-on' : ''}">${d} dias</button>`).join('')}
            <button data-period="all" class="${config.period === 'all' ? 'is-on' : ''}">Todo período</button>
          </div>
          <div class="dropdown">
            <button class="btn btn--sm" id="exportBtn">${icon('download', 'ico--sm')} Exportar análise ${icon('chevron-down', 'ico--sm')}</button>
            <div class="dropdown__menu" id="exportMenu">
              <button data-export="json">${icon('file', 'ico--sm')} Resumo em JSON</button>
              <button data-export="csv">${icon('table', 'ico--sm')} Cards interpretados (CSV)</button>
              <button data-export="raw">${icon('table', 'ico--sm')} Dados filtrados (CSV)</button>
              <div class="dropdown__sep"></div>
              <button data-export="html">${icon('file', 'ico--sm')} Relatório HTML</button>
              <button data-export="print">${icon('print', 'ico--sm')} Imprimir / salvar em PDF</button>
            </div>
          </div>
        </div>
      </div>

      <div class="tabs no-print" id="analysisTabs">
        ${TABS.map(t => `<button data-tab="${t.key}" class="${state.tab === t.key ? 'is-on' : ''}">${esc(t.label)}</button>`).join('')}
      </div>

      <div class="mt-16" id="tabContent"></div>`;

    renderTab(view);

    $('#newFile', view).addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Analisar outro arquivo',
        message: 'A análise atual será descartada. Os dados não ficam salvos em lugar nenhum.',
        confirmLabel: 'Descartar e continuar'
      });
      if (ok) { resetAnalysis(); renderUpload(view); }
    });
    $('#editMapping', view).addEventListener('click', () => renderMapping(view));

    view.querySelectorAll('#periodPicker button').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.period;
        state.config.period = value === 'all' ? 'all' : Number(value);
        recompute(view);
      });
    });
    view.querySelectorAll('#analysisTabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tab = btn.dataset.tab;
        view.querySelectorAll('#analysisTabs button').forEach(b => b.classList.toggle('is-on', b === btn));
        renderTab(view);
      });
    });

    const exportBtn = $('#exportBtn', view);
    const exportMenu = $('#exportMenu', view);
    const dd = UI.attachDropdown(exportBtn, exportMenu);
    exportMenu.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', () => { dd.close(); doExport(btn.dataset.export); });
    });
  }

  function renderTab(view) {
    const host = $('#tabContent', view);
    const renderers = {
      overview: tabOverview, team: tabTeam, timeline: tabTimeline,
      backlog: tabBacklog, efficiency: tabEfficiency, raw: tabRaw
    };
    (renderers[state.tab] || tabOverview)(host, view);
  }

  /* ---------- helpers de exibição ---------- */
  function metricCard(label, value, iconName, color, foot, unavailableReason) {
    if (unavailableReason) {
      return `<div class="kpi" style="--kpi-color:var(--neutral)">
        <div class="kpi__label">${icon(iconName, 'ico--sm')} ${esc(label)}</div>
        <div class="kpi__value dim">—</div>
        <div class="kpi__foot"><span class="tip" data-tip="${esc(unavailableReason)}" tabindex="0"
          style="cursor:help;text-decoration:underline dotted">indisponível neste CSV</span></div>
      </div>`;
    }
    return `<div class="kpi" style="--kpi-color:${color}">
      <div class="kpi__label">${icon(iconName, 'ico--sm')} ${esc(label)}</div>
      <div class="kpi__value">${value}</div>
      ${foot ? `<div class="kpi__foot">${foot}</div>` : ''}
    </div>`;
  }
  function unavailable(reason) {
    return `<div class="metric-unavailable">${icon('info', 'ico--sm')}
      <div>Esta métrica não pode ser calculada porque o CSV não possui o campo necessário. ${esc(reason)}</div></div>`;
  }

  /* ---------------------------------------------------------
     Aba: visão geral
     --------------------------------------------------------- */
  function tabOverview(host, view) {
    const r = state.result, caps = state.caps, config = currentConfig();
    const t = r.totals;
    const summary = Analytics.buildSummary(r, caps, config);
    const insights = Analytics.buildInsights(r, caps, config);

    host.innerHTML = `
      <div class="grid grid--kpi">
        ${metricCard('Total de cards', U.num(t.total), 'table', 'var(--accent)', `${U.num(t.lists)} listas no arquivo`)}
        ${metricCard('Concluídos', U.num(t.done), 'check', 'var(--ok)', `${U.pct(t.done, t.total)} do total`)}
        ${metricCard('Em produção', U.num(t.doing), 'activity', 'var(--info)', `${U.pct(t.doing, t.total)} do total`)}
        ${metricCard('Pendentes', U.num(t.pending), 'clock', 'var(--warn)', `${U.pct(t.pending, t.total)} do total`)}
        ${metricCard('Atrasados', U.num(t.overdue), 'alert', 'var(--danger)', 'prazo vencido e em aberto',
          caps.due.ok ? null : caps.due.reason)}
        ${metricCard('Sem responsável', U.num(t.unassigned), 'users', 'var(--warn)', `${U.pct(t.unassigned, t.total)} dos cards`,
          caps.members.ok ? null : caps.members.reason)}
        ${metricCard('Pessoas na operação', U.num(t.members), 'users', 'var(--accent)', 'membros citados nos cards',
          caps.members.ok ? null : caps.members.reason)}
        ${metricCard('Concluídos no período', U.num(t.completedInRange), 'target', 'var(--ok)',
          UI.delta(t.completedInRange, r.previous.completed) + ' vs período anterior',
          caps.completed.ok ? null : caps.completed.reason)}
      </div>

      <div class="grid grid--sidebarish mt-16" style="align-items:start">
        <div class="panel">
          <div class="panel__head"><div><h2>Resumo operacional</h2>
            <p class="tiny dim">Gerado a partir dos dados do arquivo</p></div></div>
          <div class="panel__body">
            <ul class="summary-list">${summary.map(s => `<li><span>${s}</span></li>`).join('')}</ul>
            ${state.idDerivedCreated ? `<div class="method-note">
              ${U.num(state.idDerivedCreated)} ${U.plural(state.idDerivedCreated, 'card teve', 'cards tiveram')}
              a data de criação derivada do identificador do Trello, por ausência de coluna específica.</div>` : ''}
            ${caps.completed.estimated ? `<div class="method-note">
              A data de conclusão foi aproximada pela última atividade dos cards concluídos, pois o arquivo não traz
              uma coluna de conclusão. Métricas de tempo de produção devem ser lidas como estimativas.</div>` : ''}
          </div>
        </div>

        <div class="panel">
          <div class="panel__head"><h2>Distribuição por lista</h2></div>
          <div class="panel__body"><div id="chartLists"></div></div>
        </div>
      </div>

      <div class="section mt-24">
        <div class="section__head"><div><h2>Insights</h2>
          <p>Leituras automáticas sobre o comportamento da operação</p></div></div>
        ${insights.length ? `<div class="insights">${insights.map(i => `
          <article class="insight insight--${i.type === 'ok' ? 'ok' : i.type === 'warn' ? 'warn' : i.type === 'risk' ? 'risk' : 'info'}">
            <div class="insight__title">${icon(i.icon)} ${esc(i.title)}</div>
            <p>${esc(i.text)}</p>
          </article>`).join('')}</div>`
          : `<div class="panel"><div class="panel__body">${unavailable('Não há campos suficientes para gerar insights.')}</div></div>`}
      </div>

      ${caps.completed.ok ? `
      <div class="panel mt-16">
        <div class="panel__head"><div><h2>Comparação de períodos</h2>
          <p class="tiny dim">${esc(U.fmtDate(r.range.start))} a ${esc(U.fmtDate(r.range.end))} contra
          ${esc(U.fmtDate(r.previous.start))} a ${esc(U.fmtDate(r.previous.end))}</p></div></div>
        <div class="panel__body">
          <div class="compare-grid">
            ${compareItem('Cards concluídos', t.completedInRange, r.previous.completed)}
            ${caps.created.ok ? compareItem('Cards criados', t.createdInRange, r.previous.created) : ''}
            ${r.leadTime.avgInRange !== null
              ? compareItem('Tempo médio de produção', r.leadTime.avgInRange, r.previous.leadTime, true)
              : ''}
          </div>
        </div>
      </div>` : ''}

      ${r.byLabel.length ? `
      <div class="panel mt-16">
        <div class="panel__head"><h2>Cards por etiqueta</h2></div>
        <div class="panel__body"><div id="chartLabels"></div></div>
      </div>` : ''}`;

    Charts.donut($('#chartLists', host), {
      data: r.byList.slice(0, 8).map((l, i) => ({ label: l.label, value: l.value, color: Charts.colorAt(i) })),
      centerLabel: 'cards'
    });
    const labelsHost = $('#chartLabels', host);
    if (labelsHost) {
      Charts.hbars(labelsHost, { data: r.byLabel.slice(0, 10) });
    }
  }

  function compareItem(label, current, previous, isDuration) {
    const format = v => v === null || v === undefined ? '—' : (isDuration ? U.formatDuration(v) : U.num(v));
    return `<div class="compare-item">
      <div class="compare-item__label">${esc(label)}</div>
      <div class="compare-item__value">${format(current)}</div>
      <div class="compare-item__prev">anterior: ${format(previous)} ${UI.delta(current, previous, { inverse: !!isDuration })}</div>
    </div>`;
  }

  /* ---------------------------------------------------------
     Aba: equipe
     --------------------------------------------------------- */
  const teamSort = { key: 'total', dir: 'desc' };

  function tabTeam(host, view) {
    const r = state.result, caps = state.caps;
    if (!caps.members.ok) {
      host.innerHTML = `<div class="panel"><div class="panel__body">${unavailable(caps.members.reason)}</div></div>`;
      return;
    }
    const rows = U.sortBy(r.members, m => {
      const v = m[teamSort.key];
      return typeof v === 'number' ? v : U.normalize(v);
    }, teamSort.dir);

    host.innerHTML = `
      <div class="grid grid--2">
        <div class="panel">
          <div class="panel__head"><div><h2>Produção por pessoa</h2>
            <p class="tiny dim">Cards concluídos por responsável</p></div></div>
          <div class="panel__body"><div id="chartProducers"></div></div>
        </div>
        <div class="panel">
          <div class="panel__head"><div><h2>Carga aberta por pessoa</h2>
            <p class="tiny dim">Em produção e pendentes</p></div></div>
          <div class="panel__body"><div id="chartLoad"></div></div>
        </div>
      </div>

      <div class="panel mt-16">
        <div class="panel__head">
          <div><h2>Performance da equipe</h2>
            <p class="tiny dim">Clique no cabeçalho para ordenar · ${U.num(r.members.length)} ${U.plural(r.members.length, 'pessoa', 'pessoas')}</p></div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              ${th('name', 'Produtor')}
              ${th('total', 'Cards', true)}
              ${th('done', 'Concluídos', true)}
              ${th('doing', 'Em produção', true)}
              ${th('pending', 'Pendentes', true)}
              ${th('overdue', 'Atrasados', true)}
              ${th('completionRate', 'Taxa de conclusão', true)}
              ${th('avgLeadTime', 'Tempo médio', true)}
            </tr></thead>
            <tbody>
              ${rows.map(m => `<tr>
                <td><div class="row gap-8">${UI.avatar(m.name === '(sem responsável)' ? '' : m.name, 'sm')}
                  <span class="truncate">${esc(m.name)}</span></div></td>
                <td class="num">${U.num(m.total)}</td>
                <td class="num">${U.num(m.done)}</td>
                <td class="num">${U.num(m.doing)}</td>
                <td class="num">${U.num(m.pending)}</td>
                <td class="num" style="color:${m.overdue ? 'var(--danger)' : 'inherit'}">${U.num(m.overdue)}</td>
                <td class="num">${U.pct(m.done, m.total, 0)}</td>
                <td class="num">${m.avgLeadTime !== null ? esc(U.formatDuration(m.avgLeadTime)) : '<span class="dim">—</span>'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!state.caps.leadTime.ok ? `<div class="panel__foot">${unavailable(state.caps.leadTime.reason)}</div>` : ''}
      </div>`;

    const producers = r.members.filter(m => m.name !== '(sem responsável)');
    Charts.hbars($('#chartProducers', host), {
      data: U.sortBy(producers, m => m.done, 'desc').slice(0, 12).map(m => ({ label: m.name, value: m.done })),
      emptyText: 'Nenhum card concluído com responsável identificado'
    });
    Charts.hbars($('#chartLoad', host), {
      data: U.sortBy(producers, m => m.doing + m.pending, 'desc').slice(0, 12)
        .map(m => ({ label: m.name, value: m.doing + m.pending, color: 'var(--warn)' })),
      emptyText: 'Nenhum card aberto com responsável identificado'
    });

    host.querySelectorAll('th.sortable').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.sort;
        if (teamSort.key === key) teamSort.dir = teamSort.dir === 'desc' ? 'asc' : 'desc';
        else { teamSort.key = key; teamSort.dir = key === 'name' ? 'asc' : 'desc'; }
        tabTeam(host, view);
      });
    });

    function th(key, label, numeric) {
      const on = teamSort.key === key;
      return `<th class="sortable ${numeric ? 'num' : ''}" data-sort="${key}">${esc(label)}
        <span class="sort-ind">${on ? (teamSort.dir === 'desc' ? '↓' : '↑') : ''}</span></th>`;
    }
  }

  /* ---------------------------------------------------------
     Aba: evolução temporal
     --------------------------------------------------------- */
  function tabTimeline(host, view) {
    const r = state.result, caps = state.caps;
    if (!caps.created.ok && !caps.completed.ok) {
      host.innerHTML = `<div class="panel"><div class="panel__body">${unavailable(
        'São necessárias datas de criação ou de conclusão para montar séries temporais.')}</div></div>`;
      return;
    }
    const gran = state.config.granularity || 'auto';

    host.innerHTML = `
      <div class="row row--between row--wrap gap-12 no-print" style="margin-bottom:14px">
        <p class="small dim">Período de ${esc(U.fmtDate(r.range.start))} a ${esc(U.fmtDate(r.range.end))} ·
          agregação por ${r.granularity === 'day' ? 'dia' : r.granularity === 'week' ? 'semana' : 'mês'}</p>
        <div class="segmented" id="granPicker">
          ${[['auto', 'Automático'], ['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']].map(([k, lab]) =>
            `<button data-gran="${k}" class="${gran === k ? 'is-on' : ''}">${lab}</button>`).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="panel__head"><div><h2>Entrada e conclusão de cards</h2>
          <p class="tiny dim">Novos cards criados contra cards concluídos</p></div></div>
        <div class="panel__body"><div id="chartFlow"></div></div>
      </div>

      <div class="grid grid--2 mt-16">
        <div class="panel">
          <div class="panel__head"><div><h2>Conclusões por período</h2>
            <p class="tiny dim">Throughput da equipe</p></div></div>
          <div class="panel__body"><div id="chartThroughput"></div></div>
        </div>
        <div class="panel">
          <div class="panel__head"><div><h2>Backlog ao longo do tempo</h2>
            <p class="tiny dim">Cards criados menos concluídos, acumulado</p></div></div>
          <div class="panel__body"><div id="chartBacklog"></div></div>
        </div>
      </div>

      <div class="panel mt-16">
        <div class="panel__body">
          <div class="stat-row">
            <div class="stat"><span class="stat__label">Média por ${r.granularity === 'day' ? 'dia' : r.granularity === 'week' ? 'semana' : 'mês'}</span>
              <span class="stat__value">${r.throughput.perPeriod !== null ? U.num(r.throughput.perPeriod, 1) : '—'}</span></div>
            <div class="stat"><span class="stat__label">Concluídos no período</span>
              <span class="stat__value">${U.num(r.throughput.inRange)}</span></div>
            <div class="stat"><span class="stat__label">Média diária</span>
              <span class="stat__value">${r.throughput.perDay !== null ? U.num(r.throughput.perDay, 2) : '—'}</span></div>
            <div class="stat"><span class="stat__label">Períodos com produção</span>
              <span class="stat__value">${U.num(r.throughput.activePeriods)} / ${U.num(r.series.labels.length)}</span></div>
          </div>
          <div class="method-note">Throughput considera apenas cards com data de conclusão conhecida dentro da janela selecionada.</div>
        </div>
      </div>`;

    const series = [];
    if (state.caps.created.ok) series.push({ name: 'Criados', values: r.series.created, color: 'var(--info)' });
    if (state.caps.completed.ok) series.push({ name: 'Concluídos', values: r.series.completed, color: 'var(--ok)' });

    Charts.line($('#chartFlow', host), { labels: r.series.labels, series, height: 260 });
    Charts.bars($('#chartThroughput', host), {
      data: r.series.labels.map((l, i) => ({ label: l, value: r.series.completed[i] })),
      color: 'var(--ok)', height: 230,
      formatter: v => `${U.num(v)} ${U.plural(v, 'card concluído', 'cards concluídos')}`
    });
    const backlogHost = $('#chartBacklog', host);
    if (r.series.backlog) {
      Charts.line(backlogHost, {
        labels: r.series.labels, height: 230,
        series: [{ name: 'Backlog acumulado', values: r.series.backlog, color: 'var(--warn)' }]
      });
    } else {
      backlogHost.innerHTML = unavailable(state.caps.created.reason);
    }

    host.querySelectorAll('#granPicker button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.config.granularity = btn.dataset.gran;
        recompute(view);
      });
    });
  }

  /* ---------------------------------------------------------
     Aba: backlog
     --------------------------------------------------------- */
  function tabBacklog(host, view) {
    const r = state.result, caps = state.caps, config = currentConfig();
    const b = r.backlog;

    host.innerHTML = `
      <div class="backlog-buckets">
        <div class="bucket" style="--c:var(--neutral)">
          <b>${U.num(b.total)}</b><span>Total em aberto</span>
          <small>cards que não estão em listas de conclusão</small></div>
        <div class="bucket" style="--c:var(--ok)">
          <b>${U.num(b.buckets.normal.length)}</b><span>Backlog normal</span>
          <small>abertos há menos de ${config.agingAttention} dias</small></div>
        <div class="bucket" style="--c:var(--warn)">
          <b>${U.num(b.buckets.attention.length)}</b><span>Backlog em atenção</span>
          <small>entre ${config.agingAttention} e ${config.agingCritical} dias</small></div>
        <div class="bucket" style="--c:var(--danger)">
          <b>${U.num(b.buckets.critical.length)}</b><span>Backlog crítico</span>
          <small>abertos há mais de ${config.agingCritical} dias</small></div>
      </div>
      ${b.buckets.unknown.length ? `<p class="tiny dim mt-8">
        ${U.num(b.buckets.unknown.length)} ${U.plural(b.buckets.unknown.length, 'card aberto não tem', 'cards abertos não têm')}
        data de criação e ficaram fora da classificação por idade.</p>` : ''}
      ${!caps.created.ok ? `<div class="mt-8">${unavailable(caps.created.reason)}</div>` : ''}

      <div class="panel mt-16">
        <div class="panel__body">
          <div class="stat-row">
            <div class="stat"><span class="stat__label">Idade média dos abertos</span>
              <span class="stat__value">${esc(U.formatDuration(b.avgAge))}</span></div>
            <div class="stat"><span class="stat__label">Card aberto mais antigo</span>
              <span class="stat__value">${esc(U.formatDuration(b.maxAge))}</span></div>
            <div class="stat"><span class="stat__label">Sem movimentação</span>
              <span class="stat__value">${caps.activity.ok ? U.num(b.idleCards.length) : '—'}</span></div>
            <div class="stat"><span class="stat__label">Sem responsável</span>
              <span class="stat__value">${caps.members.ok ? U.num(r.totals.unassigned) : '—'}</span></div>
            <div class="stat"><span class="stat__label">Atrasados</span>
              <span class="stat__value">${caps.due.ok ? U.num(r.totals.overdue) : '—'}</span></div>
          </div>
          <div class="method-note">Idade = dias desde a criação do card, considerando apenas cards em aberto.
          Sem movimentação = sem registro de atividade há mais de ${config.agingCritical} dias.</div>
        </div>
      </div>

      <div class="panel mt-16">
        <div class="panel__head"><div><h2>Cards mais antigos em aberto</h2>
          <p class="tiny dim">Clique em um card para ver os detalhes</p></div></div>
        <div class="table-wrap">
          ${b.oldest.length ? `<table class="table table--clickable">
            <thead><tr><th>Card</th><th>Lista</th><th>Responsável</th><th class="num">Aberto há</th><th class="num">Sem atividade</th></tr></thead>
            <tbody>${b.oldest.map(c => `<tr data-card="${c.index}">
              <td class="truncate" style="max-width:340px">${esc(c.name)}</td>
              <td>${esc(c.list || '—')}</td>
              <td>${c.members.length ? esc(c.members.join(', ')) : '<span class="dim">sem responsável</span>'}</td>
              <td class="num">${esc(U.formatDuration(c.age))}</td>
              <td class="num">${c.idle !== null ? esc(U.formatDuration(c.idle)) : '<span class="dim">—</span>'}</td>
            </tr>`).join('')}</tbody></table>`
            : UI.empty('check', 'Nenhum card em aberto', 'Todos os cards do arquivo estão em listas de conclusão.')}
        </div>
      </div>

      ${caps.members.ok && r.totals.unassigned ? `
      <div class="panel mt-16">
        <div class="panel__head"><h2>Cards sem responsável</h2>
          <span class="tiny dim">${U.num(r.totals.unassigned)} ${U.plural(r.totals.unassigned, 'card', 'cards')}</span></div>
        <div class="table-wrap">
          <table class="table table--clickable">
            <thead><tr><th>Card</th><th>Lista</th><th class="num">Criado em</th></tr></thead>
            <tbody>${r.cards.filter(c => !c.members.length).slice(0, 25).map(c => `<tr data-card="${c.index}">
              <td class="truncate" style="max-width:400px">${esc(c.name)}</td>
              <td>${esc(c.list || '—')}</td>
              <td class="num">${esc(U.fmtDate(c.created))}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>` : ''}`;

    host.querySelectorAll('[data-card]').forEach(row => {
      row.addEventListener('click', () => openCard(+row.dataset.card));
    });
  }

  /* ---------------------------------------------------------
     Aba: eficiência
     --------------------------------------------------------- */
  function tabEfficiency(host, view) {
    const r = state.result, caps = state.caps, config = currentConfig();
    const lt = r.leadTime;

    host.innerHTML = `
      <div class="grid grid--kpi">
        ${metricCard('Tempo médio de produção', U.formatDuration(lt.avg), 'clock', 'var(--accent)',
          `base: ${U.num(lt.count)} ${U.plural(lt.count, 'card concluído', 'cards concluídos')}`,
          caps.leadTime.ok ? null : caps.leadTime.reason)}
        ${metricCard('Tempo mediano', U.formatDuration(lt.median), 'target', 'var(--info)',
          'metade dos cards abaixo deste valor', caps.leadTime.ok ? null : caps.leadTime.reason)}
        ${metricCard('Tempo mínimo', U.formatDuration(lt.min), 'down', 'var(--ok)', 'card mais rápido',
          caps.leadTime.ok ? null : caps.leadTime.reason)}
        ${metricCard('Tempo máximo', U.formatDuration(lt.max), 'up', 'var(--danger)', 'card mais demorado',
          caps.leadTime.ok ? null : caps.leadTime.reason)}
        ${metricCard('Taxa de conclusão', U.pct(r.totals.done, r.totals.total), 'check', 'var(--ok)',
          `${U.num(r.totals.done)} de ${U.num(r.totals.total)} cards`)}
        ${metricCard('Throughput no período', U.num(r.throughput.inRange), 'activity', 'var(--accent)',
          `${r.throughput.perDay !== null ? U.num(r.throughput.perDay, 2) : '—'} cards por dia`,
          caps.completed.ok ? null : caps.completed.reason)}
        ${metricCard('Aging médio (abertos)', U.formatDuration(r.backlog.avgAge), 'clock', 'var(--warn)',
          `${U.num(r.backlog.total)} cards em aberto`, caps.created.ok ? null : caps.created.reason)}
        ${metricCard('Cards por pessoa', caps.members.ok && r.totals.members ? U.num(r.totals.total / r.totals.members, 1) : '—',
          'users', 'var(--info)', 'média de cards atribuídos', caps.members.ok ? null : caps.members.reason)}
      </div>

      ${caps.leadTime.ok ? `
      <div class="panel mt-16">
        <div class="panel__head"><div><h2>Distribuição do tempo de produção</h2>
          <p class="tiny dim">Quantidade de cards por faixa de lead time</p></div></div>
        <div class="panel__body"><div id="chartLead"></div></div>
      </div>` : ''}

      <div class="panel mt-16">
        <div class="panel__head"><h2>Metodologia das métricas</h2></div>
        <div class="panel__body">
          <ul class="summary-list">
            <li><span><b>Lead time</b> — diferença entre a data de criação e a data de conclusão do card.
              ${caps.completed.estimated ? 'Neste arquivo, a conclusão foi aproximada pela última atividade dos cards em listas de conclusão.' : 'Calculado com a coluna de conclusão do arquivo.'}</span></li>
            <li><span><b>Aging</b> — dias desde a criação, apenas para cards que ainda não estão concluídos.</span></li>
            <li><span><b>Throughput</b> — número de cards concluídos dentro da janela selecionada, dividido pelo número de dias quando exibido por dia.</span></li>
            <li><span><b>Taxa de conclusão</b> — cards concluídos dividido pelo total de cards do arquivo.</span></li>
            <li><span><b>Classificação de status</b> — um card é considerado concluído quando tem data de conclusão,
              está com o prazo marcado como concluído, ou está em uma lista cujo nome contém uma das palavras configuradas
              (${esc(config.doneKeywords)}). É considerado em produção quando a lista contém
              (${esc(config.doingKeywords)}). Os demais são pendentes. Essas listas são editáveis em Configurações.</span></li>
            <li><span><b>Atrasado</b> — card em aberto cuja data de entrega já passou.</span></li>
          </ul>
        </div>
      </div>`;

    if (caps.leadTime.ok) {
      const values = r.cards.filter(c => c.leadTime !== null).map(c => c.leadTime);
      const ranges = [
        { label: '< 1 dia', test: v => v < 1 },
        { label: '1–3 dias', test: v => v >= 1 && v < 3 },
        { label: '3–7 dias', test: v => v >= 3 && v < 7 },
        { label: '7–14 dias', test: v => v >= 7 && v < 14 },
        { label: '14–30 dias', test: v => v >= 14 && v < 30 },
        { label: '30+ dias', test: v => v >= 30 }
      ];
      Charts.bars($('#chartLead', host), {
        data: ranges.map(rg => ({ label: rg.label, value: values.filter(rg.test).length })),
        height: 230,
        formatter: v => `${U.num(v)} ${U.plural(v, 'card', 'cards')}`
      });
    }
  }

  /* ---------------------------------------------------------
     Aba: dados brutos
     --------------------------------------------------------- */
  function filteredRows() {
    const headers = state.parsed.headers;
    const q = U.normalize(state.table.search);
    let rows = state.parsed.rows;
    if (q) {
      rows = rows.filter(row => headers.some(h => U.normalize(row[h]).includes(q)));
    }
    if (state.table.sort) {
      const key = state.table.sort;
      rows = U.sortBy(rows, r => {
        const raw = r[key];
        const n = Number(String(raw).replace(',', '.'));
        return raw !== '' && !Number.isNaN(n) ? n : U.normalize(raw);
      }, state.table.dir);
    }
    return rows;
  }

  function tabRaw(host, view) {
    const headers = state.parsed.headers;
    const visible = headers.filter(h => !state.table.hidden.has(h));
    const rows = filteredRows();
    const pageSize = 25;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.table.page = U.clamp(state.table.page, 1, pages);
    const pageRows = rows.slice((state.table.page - 1) * pageSize, state.table.page * pageSize);

    host.innerHTML = `
      <div class="panel">
        <div class="panel__head">
          <div class="row gap-8 grow row--wrap">
            <div class="search-box">${icon('search')}
              <input class="input input--search" id="rawSearch" placeholder="Pesquisar em todas as colunas"
                     value="${esc(state.table.search)}"></div>
            <span class="tiny dim">${U.num(rows.length)} de ${U.num(state.parsed.rows.length)} linhas</span>
          </div>
          <div class="dropdown">
            <button class="btn btn--sm" id="colsBtn">${icon('eye', 'ico--sm')} Colunas ${icon('chevron-down', 'ico--sm')}</button>
            <div class="dropdown__menu" id="colsMenu">
              ${headers.map(h => `<label class="col-toggle">
                <span class="checkbox"><input type="checkbox" data-col="${esc(h)}" ${state.table.hidden.has(h) ? '' : 'checked'}>
                <span class="checkbox__box">${icon('check')}</span></span>
                <span class="truncate">${esc(h)}</span></label>`).join('')}
            </div>
          </div>
        </div>
        <div class="table-wrap">
          ${pageRows.length ? `<table class="table data-table table--clickable">
            <thead><tr>${visible.map(h => `<th class="sortable" data-sort="${esc(h)}">${esc(h)}
              <span class="sort-ind">${state.table.sort === h ? (state.table.dir === 'desc' ? '↓' : '↑') : ''}</span></th>`).join('')}</tr></thead>
            <tbody>${pageRows.map(row => `<tr data-row="${row.__row}">
              ${visible.map(h => `<td title="${esc(row[h])}">${esc(U.truncate(row[h], 70)) || '<span class="dim">—</span>'}</td>`).join('')}
            </tr>`).join('')}</tbody>
          </table>` : UI.empty('search', 'Nenhuma linha encontrada', 'Ajuste a pesquisa para ver outros registros.')}
        </div>
        ${pages > 1 ? `<div class="pagination">
          <span class="tiny dim">Página ${state.table.page} de ${pages}</span>
          <div class="pagination__pages">
            <button class="page-btn" data-page="${state.table.page - 1}" ${state.table.page === 1 ? 'disabled' : ''}>${icon('chevron-left', 'ico--sm')}</button>
            ${pageNumbers(state.table.page, pages).map(p => p === '…'
              ? '<span class="page-btn" style="pointer-events:none">…</span>'
              : `<button class="page-btn ${p === state.table.page ? 'is-on' : ''}" data-page="${p}">${p}</button>`).join('')}
            <button class="page-btn" data-page="${state.table.page + 1}" ${state.table.page === pages ? 'disabled' : ''}>${icon('chevron-right', 'ico--sm')}</button>
          </div>
        </div>` : ''}
      </div>`;

    const search = $('#rawSearch', host);
    search.addEventListener('input', U.debounce(e => {
      state.table.search = e.target.value;
      state.table.page = 1;
      tabRaw(host, view);
      const next = $('#rawSearch', host);
      if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
    }, 250));

    const dd = UI.attachDropdown($('#colsBtn', host), $('#colsMenu', host));
    host.querySelectorAll('[data-col]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) state.table.hidden.delete(cb.dataset.col);
        else state.table.hidden.add(cb.dataset.col);
        if (state.table.hidden.size >= headers.length) {
          state.table.hidden.delete(cb.dataset.col);
          UI.toast('Pelo menos uma coluna precisa ficar visível.', 'warn');
          return;
        }
        tabRaw(host, view);
      });
    });
    host.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.table.sort === key) state.table.dir = state.table.dir === 'asc' ? 'desc' : 'asc';
        else { state.table.sort = key; state.table.dir = 'asc'; }
        tabRaw(host, view);
      });
    });
    host.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.table.page = +btn.dataset.page;
        tabRaw(host, view);
      });
    });
    host.querySelectorAll('tbody tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const card = state.cards.find(c => c.rowNumber === +tr.dataset.row);
        if (card) openCard(card.index);
      });
    });
  }

  function pageNumbers(current, total) {
    const out = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - current) <= 1) out.push(i);
      else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
  }

  /* ---------------------------------------------------------
     Detalhe do card
     --------------------------------------------------------- */
  function openCard(index) {
    const card = state.cards[index];
    if (!card) return;
    const statusLabel = { done: 'Concluído', doing: 'Em produção', pending: 'Pendente' }[card.status];
    const statusColor = { done: 'var(--ok)', doing: 'var(--info)', pending: 'var(--warn)' }[card.status];

    const known = [
      ['Lista', card.list || '—'],
      ['Quadro', card.board || '—'],
      ['Responsáveis', card.members.length ? card.members.join(', ') : 'sem responsável'],
      ['Etiquetas', card.labels.length ? card.labels.join(', ') : '—'],
      ['Criado em', U.fmtDateTime(card.created) + (state.mapping.created ? '' : (card.created ? ' (derivado do ID)' : ''))],
      ['Início', U.fmtDate(card.start)],
      ['Prazo', U.fmtDate(card.due) + (card.isOverdue ? ' — vencido' : '')],
      ['Última atividade', U.fmtDateTime(card.lastActivity)],
      ['Concluído em', U.fmtDateTime(card.completed) + (card.completedEstimated ? ' (estimado pela última atividade)' : '')],
      ['Tempo de produção', card.leadTime !== null ? U.formatDuration(card.leadTime) : '—'],
      ['Aberto há', card.age !== null ? U.formatDuration(card.age) : '—'],
      ['Arquivado', card.archived ? 'sim' : 'não'],
      ['Checklist', card.checklistTotal !== null ? `${U.num(card.checklistDone || 0)} de ${U.num(card.checklistTotal)}` : '—']
    ];

    const usedHeaders = new Set(Object.values(state.mapping));
    const extras = state.parsed.headers.filter(h => !usedHeaders.has(h) && card.raw[h]);

    UI.openModal({
      title: U.truncate(card.name, 80),
      subtitle: `Linha ${card.rowNumber} do arquivo`,
      size: 'wide',
      body: `
        <div class="row gap-8 row--wrap" style="margin-bottom:14px">
          ${UI.badge(statusLabel, statusColor)}
          ${card.isOverdue ? UI.badge('Atrasado', 'var(--danger)') : ''}
          ${!card.members.length ? UI.badge('Sem responsável', 'var(--neutral)') : ''}
          ${card.url ? `<a class="btn btn--xs" href="${esc(card.url)}" target="_blank" rel="noopener">Abrir no Trello</a>` : ''}
        </div>
        ${card.description ? `<p class="small muted" style="margin-bottom:14px;white-space:pre-wrap">${esc(U.truncate(card.description, 600))}</p>` : ''}
        <table class="table">
          <tbody>${known.map(([k, v]) => `<tr><td style="width:190px;color:var(--text-3)">${esc(k)}</td>
            <td>${esc(v)}</td></tr>`).join('')}</tbody>
        </table>
        ${extras.length ? `<p class="eyebrow mt-16" style="margin-bottom:8px">Outros campos do arquivo</p>
          <table class="table"><tbody>${extras.map(h => `<tr>
            <td style="width:190px;color:var(--text-3)">${esc(h)}</td><td>${esc(U.truncate(card.raw[h], 200))}</td></tr>`).join('')}
          </tbody></table>` : ''}`,
      footer: `<button class="btn" data-modal-close>Fechar</button>`
    });
  }

  /* ---------------------------------------------------------
     Exportação
     --------------------------------------------------------- */
  function doExport(kind) {
    const r = state.result, caps = state.caps, config = currentConfig();
    const slug = U.timestampSlug();

    if (kind === 'json') {
      const payload = {
        arquivo: state.fileName,
        geradoEm: new Date().toISOString(),
        periodo: { de: r.range.start.toISOString(), ate: r.range.end.toISOString(), selecao: config.period },
        mapeamentoDeColunas: state.mapping,
        totais: r.totals,
        throughput: r.throughput,
        leadTime: r.leadTime,
        backlog: {
          total: r.backlog.total,
          normal: r.backlog.buckets.normal.length,
          atencao: r.backlog.buckets.attention.length,
          critico: r.backlog.buckets.critical.length,
          idadeMedia: r.backlog.avgAge,
          idadeMaxima: r.backlog.maxAge
        },
        equipe: r.members,
        porLista: r.byList,
        porEtiqueta: r.byLabel,
        comparacaoPeriodoAnterior: r.previous,
        resumo: Analytics.buildSummary(r, caps, config).map(s => s.replace(/<[^>]+>/g, '')),
        insights: Analytics.buildInsights(r, caps, config)
      };
      U.downloadFile(`analise-trello-${slug}.json`, JSON.stringify(payload, null, 2), 'application/json');
      UI.toast('Resumo exportado em JSON.', 'ok');
      return;
    }

    if (kind === 'csv') {
      const rows = r.cards.map(c => ({
        'Card': c.name,
        'Lista': c.list,
        'Status interpretado': { done: 'Concluído', doing: 'Em produção', pending: 'Pendente' }[c.status],
        'Responsáveis': c.members.join(' | '),
        'Etiquetas': c.labels.join(' | '),
        'Criado em': c.created ? U.fmtDateTime(c.created) : '',
        'Prazo': c.due ? U.fmtDate(c.due) : '',
        'Concluído em': c.completed ? U.fmtDateTime(c.completed) : '',
        'Conclusão estimada': c.completedEstimated ? 'sim' : 'não',
        'Tempo de produção (dias)': c.leadTime !== null ? U.num(c.leadTime, 2) : '',
        'Aberto há (dias)': c.age !== null ? U.num(c.age, 2) : '',
        'Atrasado': c.isOverdue ? 'sim' : 'não'
      }));
      U.downloadFile(`cards-interpretados-${slug}.csv`, U.toCSV(rows), 'text/csv');
      UI.toast('Cards interpretados exportados.', 'ok');
      return;
    }

    if (kind === 'raw') {
      const rows = filteredRows();
      const cols = state.parsed.headers.filter(h => !state.table.hidden.has(h));
      U.downloadFile(`dados-filtrados-${slug}.csv`, U.toCSV(rows, cols), 'text/csv');
      UI.toast(`${U.num(rows.length)} linhas exportadas.`, 'ok');
      return;
    }

    if (kind === 'print') { window.print(); return; }

    if (kind === 'html') {
      U.downloadFile(`relatorio-trello-${slug}.html`, buildReportHTML(), 'text/html');
      UI.toast('Relatório HTML gerado.', 'ok');
    }
  }

  /** Relatório autocontido, pronto para impressão. */
  function buildReportHTML() {
    const r = state.result, caps = state.caps, config = currentConfig();
    const summary = Analytics.buildSummary(r, caps, config);
    const insights = Analytics.buildInsights(r, caps, config);
    const t = r.totals;

    const rowsTeam = r.members.map(m => `<tr><td>${esc(m.name)}</td><td>${U.num(m.total)}</td><td>${U.num(m.done)}</td>
      <td>${U.num(m.doing)}</td><td>${U.num(m.pending)}</td><td>${U.num(m.overdue)}</td>
      <td>${m.avgLeadTime !== null ? esc(U.formatDuration(m.avgLeadTime)) : '—'}</td></tr>`).join('');

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de produção — ${esc(state.fileName)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #131829; margin: 0; padding: 40px; background: #fff; }
  .wrap { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 30px 0 10px; text-transform: uppercase; letter-spacing: .06em; color: #4b5468; }
  .meta { color: #79839a; font-size: 12.5px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 18px; }
  .kpi { border: 1px solid #e2e5ee; border-radius: 10px; padding: 12px; }
  .kpi span { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #79839a; }
  .kpi b { display: block; font-size: 24px; margin-top: 5px; }
  ul { padding-left: 18px; line-height: 1.6; font-size: 13.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  th, td { border-bottom: 1px solid #e2e5ee; padding: 7px 9px; text-align: left; }
  th { background: #f5f6f9; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #4b5468; }
  .insight { border-left: 3px solid #4b5bd6; padding: 8px 12px; margin-bottom: 9px; background: #f8f9fc; font-size: 13px; }
  .insight b { display: block; margin-bottom: 3px; }
  .note { font-size: 11.5px; color: #79839a; border-top: 1px dashed #cdd2e0; padding-top: 10px; margin-top: 26px; }
  @media print { body { padding: 0; } .kpi, table, .insight { break-inside: avoid; } }
</style></head><body><div class="wrap">
  <h1>Relatório de produção</h1>
  <p class="meta">Arquivo: ${esc(state.fileName)} · Gerado em ${esc(U.fmtDateTime(new Date()))} ·
    Período analisado: ${esc(U.fmtDate(r.range.start))} a ${esc(U.fmtDate(r.range.end))}</p>

  <div class="kpis">
    <div class="kpi"><span>Total de cards</span><b>${U.num(t.total)}</b></div>
    <div class="kpi"><span>Concluídos</span><b>${U.num(t.done)}</b></div>
    <div class="kpi"><span>Em produção</span><b>${U.num(t.doing)}</b></div>
    <div class="kpi"><span>Pendentes</span><b>${U.num(t.pending)}</b></div>
    <div class="kpi"><span>Atrasados</span><b>${caps.due.ok ? U.num(t.overdue) : '—'}</b></div>
    <div class="kpi"><span>Sem responsável</span><b>${caps.members.ok ? U.num(t.unassigned) : '—'}</b></div>
    <div class="kpi"><span>Tempo médio</span><b>${esc(U.formatDuration(r.leadTime.avg))}</b></div>
    <div class="kpi"><span>Backlog crítico</span><b>${U.num(r.backlog.buckets.critical.length)}</b></div>
  </div>

  <h2>Resumo operacional</h2>
  <ul>${summary.map(s => `<li>${s.replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>')}</li>`).join('')}</ul>

  <h2>Insights</h2>
  ${insights.map(i => `<div class="insight"><b>${esc(i.title)}</b>${esc(i.text)}</div>`).join('') || '<p>Sem insights disponíveis.</p>'}

  ${caps.members.ok ? `<h2>Performance da equipe</h2>
  <table><thead><tr><th>Produtor</th><th>Cards</th><th>Concluídos</th><th>Em produção</th><th>Pendentes</th><th>Atrasados</th><th>Tempo médio</th></tr></thead>
  <tbody>${rowsTeam}</tbody></table>` : ''}

  <h2>Distribuição por lista</h2>
  <table><thead><tr><th>Lista</th><th>Cards</th><th>Participação</th></tr></thead>
  <tbody>${r.byList.map(l => `<tr><td>${esc(l.label)}</td><td>${U.num(l.value)}</td><td>${U.pct(l.value, t.total)}</td></tr>`).join('')}</tbody></table>

  <p class="note">Métricas calculadas localmente a partir do arquivo enviado. Cards são classificados como concluídos
  quando possuem data de conclusão, prazo marcado como concluído ou estão em listas cujo nome contém:
  ${esc(config.doneKeywords)}. ${caps.completed.estimated ? 'A data de conclusão foi aproximada pela última atividade do card.' : ''}
  Lead time = criação até conclusão. Aging = dias desde a criação para cards em aberto.</p>
</div></body></html>`;
  }

  global.Trello = { render, reset: resetAnalysis, hasAnalysis: () => !!state.result };
})(window);
