/* =========================================================
   dashboard.js — visão executiva do portfólio
   Exposto globalmente como window.Dashboard
   ========================================================= */
(function (global) {
  'use strict';
  const { $, esc, icon } = U;

  function render(view) {
    const projects = Store.projects();
    const settings = Store.settings();

    if (!projects.length) {
      view.innerHTML = `<div class="panel">${UI.empty('dashboard', 'Sem projetos para exibir',
        'Cadastre projetos para acompanhar o portfólio, ou restaure os dados de demonstração em Configurações.',
        '<button class="btn btn--primary btn--sm" id="dashNew">Criar primeiro projeto</button>')}</div>`;
      const btn = $('#dashNew', view);
      if (btn) btn.addEventListener('click', () => Projects.openForm(null));
      return;
    }

    const byKind = kind => projects.filter(p => Store.status(p.statusId).kind === kind);
    const active = byKind('active');
    const paused = byKind('paused');
    const stopped = byKind('stopped');
    const finished = byKind('done');
    const critical = projects.filter(p => Store.criticality(p.criticalityId).weight >= 3 && Store.status(p.statusId).kind !== 'done');
    const stale = projects.filter(Projects.isStale);
    const attention = projects.filter(Projects.needsAttention);
    const openProjects = projects.filter(p => Store.status(p.statusId).kind !== 'done');

    const totalRisks = projects.reduce((sum, p) => sum + p.items.risks.length, 0);
    const totalDoing = projects.reduce((sum, p) => sum + p.items.doing.length, 0);
    const totalNext = projects.reduce((sum, p) => sum + p.items.next.length, 0);
    const totalDone = projects.reduce((sum, p) => sum + p.items.done.length, 0);
    const overdue = projects.filter(Projects.isOverdue);

    view.innerHTML = `
      <div class="grid grid--kpi">
        ${kpi('Total de projetos', projects.length, 'projects', 'var(--accent)',
          `${U.num(finished.length)} já concluídos`, 'all')}
        ${kpi('Ativos', active.length, 'activity', 'var(--ok)',
          U.pct(active.length, projects.length, 0) + ' do portfólio', 'active')}
        ${kpi('Pausados', paused.length, 'clock', 'var(--warn)',
          paused.length ? 'aguardando retomada' : 'nenhum pausado', 'paused')}
        ${kpi('Parados', stopped.length, 'alert', 'var(--danger)',
          stopped.length ? 'exigem decisão' : 'nenhum parado', 'stopped')}
        ${kpi('Criticidade crítica', critical.length, 'flag', 'var(--danger)',
          critical.length ? 'em acompanhamento' : 'nenhum crítico', 'critical')}
        ${kpi('Sem atualização', stale.length, 'refresh', 'var(--warn)',
          `há mais de ${settings.prefs.staleDays} dias`, 'stale')}
      </div>

      <div class="focus-card mt-16">
        <div class="focus-card__top">
          <div class="grow">
            <p class="eyebrow">Precisam de atenção</p>
            <div class="focus-score">
              <b style="color:${attention.length ? 'var(--danger)' : 'var(--ok)'}">${U.num(attention.length)}</b>
              <span>de ${U.num(openProjects.length)} ${U.plural(openProjects.length, 'projeto em aberto', 'projetos em aberto')}
              ${UI.infoDot('Um projeto entra nesta lista quando está parado, tem criticidade crítica, acumula pontos de atenção, está sem atualização além do limite configurado ou teve o prazo vencido.')}</span>
            </div>
            <div class="row gap-16 row--wrap mt-8 small dim">
              <span>${icon('alert', 'ico--sm')} ${U.num(totalRisks)} pontos de atenção abertos</span>
              <span>${icon('clock', 'ico--sm')} ${U.num(overdue.length)} com prazo vencido</span>
              <span>${icon('check', 'ico--sm')} ${U.num(totalDone)} itens já realizados</span>
            </div>
          </div>
          <div style="min-width:210px">
            <p class="eyebrow" style="margin-bottom:6px">Composição do trabalho</p>
            <div class="stack-bar" style="height:9px">
              <i style="width:${share(totalDoing)}%;background:var(--info)"></i>
              <i style="width:${share(totalRisks)}%;background:var(--warn)"></i>
              <i style="width:${share(totalNext)}%;background:var(--accent)"></i>
              <i style="width:${share(totalDone)}%;background:var(--ok)"></i>
            </div>
            <ul class="legend mt-8">
              <li><i style="background:var(--info)"></i><span>Em andamento</span><b class="num">${U.num(totalDoing)}</b></li>
              <li><i style="background:var(--warn)"></i><span>Pontos de atenção</span><b class="num">${U.num(totalRisks)}</b></li>
              <li><i style="background:var(--accent)"></i><span>Próximos passos</span><b class="num">${U.num(totalNext)}</b></li>
              <li><i style="background:var(--ok)"></i><span>Realizado</span><b class="num">${U.num(totalDone)}</b></li>
            </ul>
          </div>
        </div>
      </div>

      <div class="grid grid--sidebarish mt-16" style="align-items:start">
        <div class="panel">
          <div class="panel__head">
            <div><h2>Projetos que precisam de atenção</h2>
              <p class="tiny dim">Ordenados por criticidade e tempo sem atualização</p></div>
            <a class="btn btn--sm no-print" href="#/projects">Ver todos ${icon('arrow-right', 'ico--sm')}</a>
          </div>
          <div class="attention-list">
            ${attention.length ? attentionRows(attention) : `<div class="empty" style="padding:34px">
              <div class="empty__icon" style="background:var(--ok-soft);color:var(--ok)">${icon('check')}</div>
              <h3>Nada exige atenção agora</h3>
              <p>Todos os projetos em aberto estão dentro dos critérios definidos.</p></div>`}
          </div>
        </div>

        <div class="col gap-16">
          <div class="panel">
            <div class="panel__head"><h2>Projetos por status</h2></div>
            <div class="panel__body"><div id="chartStatus"></div></div>
          </div>
          <div class="panel">
            <div class="panel__head"><h2>Por criticidade</h2></div>
            <div class="panel__body"><div id="chartCrit"></div></div>
          </div>
        </div>
      </div>

      <div class="grid grid--2 mt-16">
        <div class="panel">
          <div class="panel__head">
            <div><h2>Projetos por área</h2><p class="tiny dim">Distribuição do portfólio</p></div>
          </div>
          <div class="panel__body"><div id="chartArea"></div></div>
        </div>
        <div class="panel">
          <div class="panel__head">
            <div><h2>Atualizações nas últimas 12 semanas</h2>
              <p class="tiny dim">Projetos editados por semana</p></div>
          </div>
          <div class="panel__body"><div id="chartUpdates"></div></div>
        </div>
      </div>`;

    function share(v) {
      const total = totalDoing + totalRisks + totalNext + totalDone;
      return total ? (v / total) * 100 : 0;
    }

    /* --- gráficos --- */
    Charts.donut($('#chartStatus', view), {
      data: settings.statuses.map(s => ({
        label: s.label, color: s.color,
        value: projects.filter(p => p.statusId === s.id).length
      })),
      centerLabel: 'projetos'
    });

    Charts.hbars($('#chartCrit', view), {
      data: settings.criticalities.map(c => ({
        label: c.label, color: c.color,
        value: projects.filter(p => p.criticalityId === c.id).length
      }))
    });

    const areaCounts = U.countBy(projects, p => p.area || 'Sem área');
    Charts.hbars($('#chartArea', view), {
      data: Array.from(areaCounts, ([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
      emptyText: 'Nenhuma área informada nos projetos'
    });

    // Atualizações por semana (12 semanas)
    const weeks = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    for (let i = 11; i >= 0; i--) {
      const start = new Date(cursor);
      start.setDate(start.getDate() - i * 7);
      weeks.push(U.periodKey(start, 'week'));
    }
    const updatesByWeek = U.countBy(projects, p => U.periodKey(p.updatedAt, 'week'));
    Charts.bars($('#chartUpdates', view), {
      data: weeks.map(w => ({ label: U.periodLabel(w, 'week'), value: updatesByWeek.get(w) || 0 })),
      height: 220,
      formatter: v => `${U.num(v)} ${U.plural(v, 'projeto atualizado', 'projetos atualizados')}`
    });

    view.querySelectorAll('[data-focus]').forEach(card => {
      card.addEventListener('click', () => applyFocus(card.dataset.focus));
    });
    view.querySelectorAll('.attention-item').forEach(row => {
      row.addEventListener('click', () => { location.hash = '#/projects/' + row.dataset.id; });
    });
  }

  function kpi(label, value, iconName, color, foot, focus) {
    return `<div class="kpi kpi--link" style="--kpi-color:${color}" data-focus="${esc(focus)}" tabindex="0" role="button">
      <div class="kpi__label">${icon(iconName, 'ico--sm')} ${esc(label)}</div>
      <div class="kpi__value">${U.num(value)}</div>
      <div class="kpi__foot">${esc(foot)}</div>
    </div>`;
  }

  function attentionRows(list) {
    const ordered = list.slice().sort((a, b) => {
      const wa = Store.criticality(a.criticalityId).weight, wb = Store.criticality(b.criticalityId).weight;
      if (wa !== wb) return wb - wa;
      return (U.daysSince(b.updatedAt) || 0) - (U.daysSince(a.updatedAt) || 0);
    });
    return ordered.slice(0, 12).map(p => {
      const status = Store.status(p.statusId);
      return `<div class="attention-item" data-id="${esc(p.id)}" tabindex="0">
        <i class="attention-item__rail" style="background:${esc(status.color)}"></i>
        <div class="grow" style="min-width:0">
          <div class="attention-item__name truncate">${esc(p.name)}</div>
          <div class="attention-item__why truncate">${esc(Projects.attentionReasons(p).join(' · '))}</div>
        </div>
        <div class="attention-item__meta">
          ${UI.criticalityBadge(p.criticalityId)}
          <span class="tiny dim num nowrap">${esc(U.relativeDays(p.updatedAt))}</span>
        </div>
      </div>`;
    }).join('');
  }

  /** Ao clicar em um KPI, abre a lista de projetos já filtrada. */
  function applyFocus(focus) {
    const settings = Store.settings();
    const byKind = kind => (settings.statuses.find(s => s.kind === kind) || {}).id || '';
    const map = {
      all: {},
      active: { status: byKind('active') },
      paused: { status: byKind('paused') },
      stopped: { status: byKind('stopped') },
      critical: { criticality: (settings.criticalities.find(c => c.weight >= 3) || {}).id || '' },
      stale: { updated: 'stale' }
    };
    global.App.setProjectFilters(map[focus] || {});
    location.hash = '#/projects';
  }

  global.Dashboard = { render };
})(window);
