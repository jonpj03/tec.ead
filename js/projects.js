/* =========================================================
   projects.js — lista, detalhe e edição de projetos
   Exposto globalmente como window.Projects
   ========================================================= */
(function (global) {
  'use strict';
  const { $, $$, esc, icon, html } = U;

  const COLUMNS = [
    { key: 'doing', label: 'Em andamento', color: 'var(--info)', marker: 'clock', addLabel: 'Adicionar item em andamento' },
    { key: 'risks', label: 'Pontos de atenção', color: 'var(--warn)', marker: 'alert', addLabel: 'Adicionar ponto de atenção' },
    { key: 'next', label: 'Próximos passos', color: 'var(--accent)', marker: 'arrow-right', addLabel: 'Adicionar próximo passo' },
    { key: 'done', label: 'Realizado', color: 'var(--ok)', marker: 'check', addLabel: 'Adicionar realização' }
  ];
  const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map(c => [c.key, c]));

  /* Estado dos filtros (mantido em memória durante a sessão) */
  const filters = {
    search: '', status: '', criticality: '', owner: '', area: '', tag: '', updated: '',
    sort: 'updatedAt', dir: 'desc'
  };

  /* ---------------- Helpers de domínio ---------------- */
  function isStale(project) {
    const limit = Store.settings().prefs.staleDays || 7;
    const days = U.daysSince(project.updatedAt);
    return days !== null && days > limit && Store.status(project.statusId).kind !== 'done';
  }
  function isOverdue(project) {
    if (!project.dueDate) return false;
    if (Store.status(project.statusId).kind === 'done') return false;
    const days = U.daysBetween(new Date(), project.dueDate);
    return days !== null && days < 0;
  }
  /** Motivos pelos quais um projeto exige atenção. */
  function attentionReasons(project) {
    const reasons = [];
    const status = Store.status(project.statusId);
    const crit = Store.criticality(project.criticalityId);
    if (status.kind === 'done') return reasons;
    if (status.kind === 'stopped') reasons.push('Projeto parado');
    if (crit.weight >= 3) reasons.push('Criticidade crítica');
    if (project.items.risks.length >= 3) reasons.push(`${project.items.risks.length} pontos de atenção`);
    else if (project.items.risks.length > 0 && crit.weight >= 2) {
      const n = project.items.risks.length;
      reasons.push(`${n} ${U.plural(n, 'ponto de atenção', 'pontos de atenção')}`);
    }
    if (isStale(project)) reasons.push(`Sem atualização ${U.relativeDays(project.updatedAt)}`);
    if (isOverdue(project)) reasons.push('Prazo vencido');
    return reasons;
  }
  function needsAttention(project) { return attentionReasons(project).length > 0; }

  function counts(project) {
    return {
      doing: project.items.doing.length,
      risks: project.items.risks.length,
      next: project.items.next.length,
      done: project.items.done.length
    };
  }

  /* ---------------- Filtragem ---------------- */
  function applyFilters(list) {
    const q = U.normalize(filters.search);
    return list.filter(p => {
      if (filters.status && p.statusId !== filters.status) return false;
      if (filters.criticality && p.criticalityId !== filters.criticality) return false;
      if (filters.owner && p.owner !== filters.owner) return false;
      if (filters.area && p.area !== filters.area) return false;
      if (filters.tag && !p.tags.includes(filters.tag)) return false;

      if (filters.updated) {
        const days = U.daysSince(p.updatedAt);
        if (filters.updated === 'stale') { if (!isStale(p)) return false; }
        else if (days === null || days > +filters.updated) return false;
      }

      if (q) {
        const haystack = U.normalize([
          p.name, p.description, p.owner, p.area, p.tags.join(' '),
          p.flags.map(f => Store.flag(f).label).join(' ')
        ].join(' '));
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function sortList(list) {
    const key = filters.sort;
    const getters = {
      name: p => U.normalize(p.name),
      status: p => Store.status(p.statusId).label,
      criticality: p => -Store.criticality(p.criticalityId).weight,
      owner: p => U.normalize(p.owner),
      area: p => U.normalize(p.area),
      dueDate: p => p.dueDate ? new Date(p.dueDate).getTime() : Infinity,
      updatedAt: p => new Date(p.updatedAt).getTime(),
      risks: p => p.items.risks.length,
      doing: p => p.items.doing.length
    };
    return U.sortBy(list, getters[key] || getters.updatedAt, filters.dir);
  }

  function activeFilterCount() {
    return ['status', 'criticality', 'owner', 'area', 'tag', 'updated']
      .filter(k => filters[k]).length + (filters.search ? 1 : 0);
  }

  /* ---------------- Tela: lista ---------------- */
  function renderList(view) {
    const settings = Store.settings();
    const all = Store.projects();
    const filtered = sortList(applyFilters(all));

    view.innerHTML = `
      <div class="toolbar no-print">
        <div class="search-box">
          ${icon('search')}
          <input class="input input--search" id="fSearch" placeholder="Buscar por nome, descrição, responsável ou tag"
                 value="${esc(filters.search)}" autocomplete="off">
        </div>
        <select class="select" id="fStatus" aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          ${settings.statuses.map(s => `<option value="${esc(s.id)}" ${filters.status === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>
        <select class="select" id="fCrit" aria-label="Filtrar por criticidade">
          <option value="">Toda criticidade</option>
          ${settings.criticalities.map(c => `<option value="${esc(c.id)}" ${filters.criticality === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select>
        <select class="select" id="fOwner" aria-label="Filtrar por responsável">
          <option value="">Todos os responsáveis</option>
          ${Store.allOwners().map(o => `<option value="${esc(o)}" ${filters.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select>
        <select class="select" id="fArea" aria-label="Filtrar por área">
          <option value="">Todas as áreas</option>
          ${settings.areas.map(a => `<option value="${esc(a)}" ${filters.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
        </select>
        <select class="select" id="fTag" aria-label="Filtrar por tag">
          <option value="">Todas as tags</option>
          ${Store.allTags().map(t => `<option value="${esc(t)}" ${filters.tag === t ? 'selected' : ''}>#${esc(t)}</option>`).join('')}
        </select>
        <select class="select" id="fUpdated" aria-label="Filtrar por última atualização">
          <option value="">Qualquer atualização</option>
          <option value="7" ${filters.updated === '7' ? 'selected' : ''}>Últimos 7 dias</option>
          <option value="14" ${filters.updated === '14' ? 'selected' : ''}>Últimos 14 dias</option>
          <option value="30" ${filters.updated === '30' ? 'selected' : ''}>Últimos 30 dias</option>
          <option value="stale" ${filters.updated === 'stale' ? 'selected' : ''}>Desatualizados (+${settings.prefs.staleDays}d)</option>
        </select>
        <button class="btn btn--ghost btn--sm" id="fClear" ${activeFilterCount() ? '' : 'disabled'}>
          ${icon('x', 'ico--sm')} Limpar filtros${activeFilterCount() ? ` (${activeFilterCount()})` : ''}
        </button>
      </div>

      <div class="panel">
        <div class="panel__head">
          <div>
            <h2>Portfólio</h2>
            <p class="tiny dim">${U.num(filtered.length)} de ${U.num(all.length)} ${U.plural(all.length, 'projeto', 'projetos')} · clique em uma linha para abrir o detalhe</p>
          </div>
          <div class="row gap-8 no-print">
            <div class="segmented segmented--sm" id="viewToggle">
              <button data-view="panorama" class="${listView() === 'panorama' ? 'is-on' : ''}">${icon('table', 'ico--sm')} Panorama</button>
              <button data-view="compact" class="${listView() === 'compact' ? 'is-on' : ''}">${icon('menu', 'ico--sm')} Compacta</button>
            </div>
            <button class="btn btn--sm" id="printList">${icon('print', 'ico--sm')} Imprimir</button>
            <select class="select" id="fSort" aria-label="Ordenar por">
              <option value="updatedAt:desc">Atualização recente</option>
              <option value="updatedAt:asc">Atualização antiga</option>
              <option value="criticality:asc">Criticidade (maior)</option>
              <option value="name:asc">Nome (A–Z)</option>
              <option value="dueDate:asc">Prazo mais próximo</option>
              <option value="risks:desc">Mais pontos de atenção</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          ${filtered.length ? (listView() === 'panorama' ? renderPanorama(filtered) : renderTable(filtered)) : UI.empty(
            all.length ? 'search' : 'projects',
            all.length ? 'Nenhum projeto encontrado' : 'Nenhum projeto cadastrado',
            all.length ? 'Ajuste os filtros ou limpe a busca para ver os demais projetos.'
                       : 'Cadastre o primeiro projeto para começar a acompanhar o portfólio.',
            all.length ? '<button class="btn btn--sm" data-act="clear-empty">Limpar filtros</button>'
                       : '<button class="btn btn--primary btn--sm" data-act="new-empty">Novo projeto</button>')}
        </div>
      </div>`;

    bindListEvents(view);
  }

  /** Visão escolhida para a listagem, guardada nas preferências. */
  function listView() {
    return Store.settings().prefs.listView === 'compact' ? 'compact' : 'panorama';
  }

  /**
   * Panorama: uma linha por projeto com o conteúdo das quatro listas lado a lado,
   * no formato do quadro que a diretoria acompanha.
   */
  function renderPanorama(list) {
    return `<table class="table panorama-table table--clickable">
      <thead><tr>
        <th class="rail-cell"></th>
        <th class="col-project">Projeto</th>
        <th>Entrega realizada</th>
        <th>Em andamento</th>
        <th>Próximos passos</th>
        <th>Pontos de atenção</th>
        <th class="col-narrow">Nível</th>
        <th class="col-narrow">Última atualização</th>
        <th class="col-status">Status</th>
      </tr></thead>
      <tbody>${list.map(panoramaRow).join('')}</tbody>
    </table>`;
  }

  /** Bullets de uma das quatro listas, com corte para não esticar a linha. */
  function cellItems(items, limit) {
    if (!items.length) return '<span class="dim">—</span>';
    const max = limit || 4;
    const shown = items.slice(0, max);
    const rest = items.length - shown.length;
    return `<ul class="cell-list">
      ${shown.map(it => `<li>${esc(it.text)}</li>`).join('')}
      ${rest ? `<li class="dim">+${rest} ${U.plural(rest, 'item', 'itens')}</li>` : ''}
    </ul>`;
  }

  function panoramaRow(p) {
    const status = Store.status(p.statusId);
    const crit = Store.criticality(p.criticalityId);
    const stale = isStale(p);

    return `<tr data-id="${esc(p.id)}" tabindex="0">
      <td class="rail-cell"><i class="rail" style="--c:${esc(status.color)}"></i></td>
      <td class="col-project" data-label="Projeto">
        <strong>${esc(p.name)}</strong>
        <div class="project-meta">
          ${p.area ? `<span>${esc(p.area)}</span>` : ''}
          ${p.owner ? `<span>${esc(p.owner)}</span>` : ''}
          ${p.flags.length ? `<span class="tip" data-tip="${esc(p.flags.map(f => Store.flag(f).label).join(' · '))}">
            ${icon('flag', 'ico--sm')} ${p.flags.length}</span>` : ''}
        </div>
      </td>
      <td data-label="Entrega realizada">${cellItems(p.items.done)}</td>
      <td data-label="Em andamento">${cellItems(p.items.doing)}</td>
      <td data-label="Próximos passos">${cellItems(p.items.next)}</td>
      <td data-label="Pontos de atenção" class="${p.items.risks.length ? 'cell-risk' : ''}">${cellItems(p.items.risks)}</td>
      <td class="col-narrow" data-label="Nível">${UI.criticalityBadge(p.criticalityId)}</td>
      <td class="col-narrow" data-label="Última atualização">
        <span class="num small ${stale ? 'is-stale' : ''}">${esc(U.fmtDate(p.updatedAt))}</span>
        <div class="tiny dim">${esc(U.relativeDays(p.updatedAt))}</div>
      </td>
      <td class="col-status" data-label="Status">
        <span class="status-dot tip" style="--c:${esc(status.color)}"
              data-tip="${esc(status.label)}${crit.weight >= 3 ? ' · ' + esc(crit.label) : ''}"></span>
        <span class="tiny dim status-dot__label">${esc(status.label)}</span>
      </td>
    </tr>`;
  }

  function renderTable(list) {
    return `<table class="table projects-table table--clickable">
      <thead><tr>
        <th class="rail-cell"></th>
        <th>Projeto</th>
        <th>Status</th>
        <th>Criticidade</th>
        <th>Responsável</th>
        <th>Acompanhamento</th>
        <th>Prazo</th>
        <th>Última atualização</th>
        <th></th>
      </tr></thead>
      <tbody>${list.map(rowHTML).join('')}</tbody>
    </table>`;
  }

  function rowHTML(p) {
    const status = Store.status(p.statusId);
    const c = counts(p);
    const total = c.doing + c.risks + c.next + c.done || 1;
    const staleDays = U.daysSince(p.updatedAt);
    const limit = Store.settings().prefs.staleDays || 7;
    const freshRatio = U.clamp(1 - (staleDays || 0) / (limit * 2), 0.06, 1);
    const freshColor = isStale(p) ? 'var(--danger)' : (staleDays > limit / 2 ? 'var(--warn)' : 'var(--ok)');
    const overdue = isOverdue(p);

    return `<tr data-id="${esc(p.id)}" tabindex="0">
      <td class="rail-cell"><i class="rail" style="--c:${esc(status.color)}"></i></td>
      <td>
        <div class="project-name">
          <strong>${esc(p.name)}</strong>
          <div class="project-meta">
            ${p.area ? `<span>${esc(p.area)}</span>` : ''}
            ${p.tags.slice(0, 3).map(t => `<span class="chip chip--tag" style="height:19px;font-size:11px">${esc(t)}</span>`).join('')}
            ${p.tags.length > 3 ? `<span>+${p.tags.length - 3}</span>` : ''}
            ${p.flags.length ? `<span class="tip" data-tip="${esc(p.flags.map(f => Store.flag(f).label).join(' · '))}">
              ${icon('flag', 'ico--sm')}</span>` : ''}
          </div>
        </div>
      </td>
      <td data-label="Status">${UI.statusBadge(p.statusId)}</td>
      <td data-label="Criticidade">${UI.criticalityBadge(p.criticalityId)}</td>
      <td data-label="Responsável">
        <div class="row gap-8">${UI.avatar(p.owner, 'sm')}<span class="truncate small">${esc(p.owner || '—')}</span></div>
      </td>
      <td data-label="Acompanhamento">
        <div class="item-mix">
          <span class="stack-bar tip" data-tip="Em andamento ${c.doing} · Atenção ${c.risks} · Próximos ${c.next} · Realizado ${c.done}">
            <i style="width:${c.doing / total * 100}%;background:var(--info)"></i>
            <i style="width:${c.risks / total * 100}%;background:var(--warn)"></i>
            <i style="width:${c.next / total * 100}%;background:var(--accent)"></i>
            <i style="width:${c.done / total * 100}%;background:var(--ok)"></i>
          </span>
          <span class="item-mix__counts">
            <span><i style="background:var(--info)"></i>${c.doing}</span>
            <span><i style="background:var(--warn)"></i>${c.risks}</span>
            <span><i style="background:var(--accent)"></i>${c.next}</span>
            <span><i style="background:var(--ok)"></i>${c.done}</span>
          </span>
        </div>
      </td>
      <td data-label="Prazo" class="small">
        ${p.dueDate ? `<span style="color:${overdue ? 'var(--danger)' : 'inherit'};font-weight:${overdue ? 600 : 400}">
          ${esc(U.fmtDate(p.dueDate))}${overdue ? ' ⚠' : ''}</span>` : '<span class="dim">—</span>'}
      </td>
      <td data-label="Última atualização">
        <div class="freshness">
          <span class="freshness__label">${esc(U.relativeDays(p.updatedAt))}</span>
          <span class="meter"><i style="width:${freshRatio * 100}%;background:${freshColor}"></i></span>
        </div>
      </td>
      <td class="actions-cell">
        <div class="row-actions no-print">
          <button class="icon-btn icon-btn--sm" data-act="edit" data-id="${esc(p.id)}" title="Editar projeto">${icon('edit', 'ico--sm')}</button>
          <button class="icon-btn icon-btn--sm icon-btn--danger" data-act="delete" data-id="${esc(p.id)}" title="Excluir projeto">${icon('trash', 'ico--sm')}</button>
        </div>
      </td>
    </tr>`;
  }

  function bindListEvents(view) {
    const rerender = () => renderList(view);
    const setAndRender = (key, value) => { filters[key] = value; rerender(); };

    const search = $('#fSearch', view);
    if (search) {
      search.addEventListener('input', U.debounce(e => {
        filters.search = e.target.value;
        const focusPos = e.target.selectionStart;
        rerender();
        const next = $('#fSearch', view);
        if (next) { next.focus(); next.setSelectionRange(focusPos, focusPos); }
      }, 260));
    }
    const bindSelect = (id, key) => {
      const el = $(id, view);
      if (el) el.addEventListener('change', e => setAndRender(key, e.target.value));
    };
    bindSelect('#fStatus', 'status');
    bindSelect('#fCrit', 'criticality');
    bindSelect('#fOwner', 'owner');
    bindSelect('#fArea', 'area');
    bindSelect('#fTag', 'tag');
    bindSelect('#fUpdated', 'updated');

    view.querySelectorAll('#viewToggle [data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        Store.setPref('listView', btn.dataset.view);
        rerender();
      });
    });

    const printBtn = $('#printList', view);
    if (printBtn) printBtn.addEventListener('click', () => global.print());

    const sortEl = $('#fSort', view);
    if (sortEl) {
      sortEl.value = `${filters.sort}:${filters.dir}`;
      sortEl.addEventListener('change', e => {
        const [sort, dir] = e.target.value.split(':');
        filters.sort = sort; filters.dir = dir;
        rerender();
      });
    }

    const clearFilters = () => {
      Object.assign(filters, { search: '', status: '', criticality: '', owner: '', area: '', tag: '', updated: '' });
      rerender();
    };
    const clearBtn = $('#fClear', view);
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
    const clearEmpty = view.querySelector('[data-act="clear-empty"]');
    if (clearEmpty) clearEmpty.addEventListener('click', clearFilters);
    const newEmpty = view.querySelector('[data-act="new-empty"]');
    if (newEmpty) newEmpty.addEventListener('click', () => openForm(null));

    view.querySelectorAll('tbody tr').forEach(tr => {
      tr.addEventListener('click', e => {
        if (e.target.closest('[data-act]')) return;
        location.hash = '#/projects/' + tr.dataset.id;
      });
      tr.addEventListener('keydown', e => {
        if (e.key === 'Enter') location.hash = '#/projects/' + tr.dataset.id;
      });
    });
    view.querySelectorAll('[data-act="edit"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openForm(Store.project(btn.dataset.id));
      });
    });
    view.querySelectorAll('[data-act="delete"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        confirmDelete(btn.dataset.id);
      });
    });
  }

  async function confirmDelete(id) {
    const project = Store.project(id);
    if (!project) return;
    if (Store.settings().prefs.confirmDelete) {
      const ok = await UI.confirm({
        title: 'Excluir projeto',
        message: `“${project.name}” e todo o seu histórico serão removidos deste navegador. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir projeto',
        danger: true
      });
      if (!ok) return;
    }
    Store.remove(id);
    UI.toast('Projeto excluído.', 'ok');
    if (location.hash.includes(id)) location.hash = '#/projects';
  }

  /* ---------------- Tela: detalhe ---------------- */
  function renderDetail(view, id) {
    const p = Store.project(id);
    if (!p) {
      view.innerHTML = UI.empty('search', 'Projeto não encontrado',
        'Ele pode ter sido excluído ou o endereço está incorreto.',
        '<a class="btn btn--sm" href="#/projects">Voltar para projetos</a>');
      return;
    }
    const status = Store.status(p.statusId);
    const crit = Store.criticality(p.criticalityId);
    const c = counts(p);
    const reasons = attentionReasons(p);

    view.innerHTML = `
      <a class="btn btn--ghost btn--sm no-print" href="#/projects" style="margin-bottom:14px">
        ${icon('chevron-left', 'ico--sm')} Voltar para projetos</a>

      <div class="detail-head" style="--c:${esc(status.color)}">
        <div class="detail-head__top">
          <div class="grow">
            <div class="row gap-8 row--wrap">
              ${UI.statusBadge(p.statusId)}
              ${UI.criticalityBadge(p.criticalityId)}
              ${p.flags.map(f => {
                const flag = Store.flag(f);
                return UI.badge(flag.label, flag.color);
              }).join('')}
            </div>
            <h2 class="mt-8">${esc(p.name)}</h2>
            ${p.description ? `<p class="detail-head__desc">${esc(p.description)}</p>` : ''}
          </div>
          <div class="row gap-8 no-print">
            <select class="select" id="quickStatus" style="width:auto" title="Alterar status">
              ${Store.settings().statuses.map(s =>
                `<option value="${esc(s.id)}" ${s.id === p.statusId ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
            </select>
            <button class="btn" id="editProject">${icon('edit', 'ico--sm')} Editar</button>
            <button class="btn btn--danger" id="deleteProject" title="Excluir projeto">${icon('trash', 'ico--sm')}</button>
          </div>
        </div>

        <div class="detail-meta">
          <div class="detail-meta__item"><span>Responsável</span>
            <strong>${UI.avatar(p.owner, 'sm')} ${esc(p.owner || 'Não definido')}</strong></div>
          <div class="detail-meta__item"><span>Área</span><strong>${esc(p.area || '—')}</strong></div>
          <div class="detail-meta__item"><span>Início</span><strong class="num">${esc(U.fmtDate(p.startDate))}</strong></div>
          <div class="detail-meta__item"><span>Prazo previsto</span>
            <strong class="num" style="color:${isOverdue(p) ? 'var(--danger)' : 'inherit'}">${esc(U.fmtDate(p.dueDate))}</strong></div>
          <div class="detail-meta__item"><span>Última atualização</span>
            <strong class="num">${esc(U.fmtDateTime(p.updatedAt))}</strong></div>
          ${p.tags.length ? `<div class="detail-meta__item"><span>Tags</span>
            <strong>${p.tags.map(t => `<span class="chip chip--tag">${esc(t)}</span>`).join(' ')}</strong></div>` : ''}
        </div>

        ${reasons.length ? `<div class="callout callout--warn mt-16">${icon('alert')}
          <div><strong>Este projeto precisa de atenção.</strong><br>${esc(reasons.join(' · '))}</div></div>` : ''}
      </div>

      <div class="grid grid--kpi mt-24">
        ${kpiCard('Em andamento', c.doing, 'clock', 'var(--info)')}
        ${kpiCard('Pontos de atenção', c.risks, 'alert', 'var(--warn)')}
        ${kpiCard('Próximos passos', c.next, 'arrow-right', 'var(--accent)')}
        ${kpiCard('Realizado', c.done, 'check', 'var(--ok)')}
      </div>

      <div class="grid grid--sidebarish mt-24" style="align-items:start">
        <div class="board">${COLUMNS.map(col => columnHTML(p, col)).join('')}</div>
        <div class="panel">
          <div class="panel__head"><h2>Histórico</h2>
            <span class="tiny dim">${p.history.length} ${U.plural(p.history.length, 'registro', 'registros')}</span></div>
          <div class="panel__body">
            ${p.history.length ? `<div class="history">${p.history.slice(0, 25).map(h => `
              <div class="history__entry">
                <div class="history__dot"></div>
                <div>
                  <div class="history__when">${esc(U.fmtDateTime(h.ts))}</div>
                  <ul class="history__changes">${(h.changes || []).map(ch => `<li>${esc(ch)}</li>`).join('')}</ul>
                </div>
              </div>`).join('')}</div>`
              : `<p class="small dim">Nenhuma alteração registrada ainda. O histórico é preenchido automaticamente a cada edição.</p>`}
          </div>
        </div>
      </div>`;

    bindDetailEvents(view, p);
  }

  function kpiCard(label, value, iconName, color) {
    return `<div class="kpi" style="--kpi-color:${color}">
      <div class="kpi__label">${icon(iconName, 'ico--sm')} ${esc(label)}</div>
      <div class="kpi__value">${U.num(value)}</div>
    </div>`;
  }

  function columnHTML(p, col) {
    const list = p.items[col.key] || [];
    return `<section class="board__col" data-col="${col.key}">
      <div class="board__head">
        <i class="dot" style="background:${col.color}"></i>
        <h3>${esc(col.label)}</h3>
        <b>${list.length}</b>
      </div>
      <div class="board__list" data-drop="${col.key}">
        ${list.length ? list.map(item => itemHTML(item, col)).join('')
          : `<p class="small dim" style="padding:10px 9px">Nenhum item aqui.</p>`}
      </div>
      <div class="board__foot no-print">
        <button class="item-add" data-add="${col.key}">${icon('plus', 'ico--sm')} ${esc(col.addLabel)}</button>
      </div>
    </section>`;
  }

  function itemHTML(item, col) {
    const isDone = col.key === 'done' || item.done;
    return `<div class="item ${isDone ? 'is-done' : ''}" data-item="${esc(item.id)}" data-col="${col.key}" draggable="true">
      <span class="item__marker">${icon(col.marker, 'ico--sm')}</span>
      <span class="item__text" data-edit="${esc(item.id)}" title="Clique para editar">${esc(item.text)}</span>
      <span class="item__actions no-print">
        ${col.key !== 'done'
          ? `<button class="icon-btn icon-btn--sm" data-complete="${esc(item.id)}" title="Concluir e mover para Realizado">${icon('check', 'ico--sm')}</button>`
          : `<button class="icon-btn icon-btn--sm" data-reopen="${esc(item.id)}" title="Reabrir em Em andamento">${icon('refresh', 'ico--sm')}</button>`}
        <button class="icon-btn icon-btn--sm icon-btn--danger" data-remove="${esc(item.id)}" title="Excluir item">${icon('trash', 'ico--sm')}</button>
        <span class="item__drag" title="Arraste para reordenar">${icon('grip', 'ico--sm')}</span>
      </span>
    </div>`;
  }

  function bindDetailEvents(view, project) {
    const refresh = changes => {
      Store.save(project, { changes });
      renderDetail(view, project.id);
    };

    $('#editProject', view).addEventListener('click', () => openForm(project));
    $('#deleteProject', view).addEventListener('click', () => confirmDelete(project.id));
    $('#quickStatus', view).addEventListener('change', e => {
      const from = Store.status(project.statusId).label;
      const to = Store.status(e.target.value).label;
      project.statusId = e.target.value;
      refresh([`Status alterado de ${from} para ${to}`]);
      UI.toast('Status atualizado.', 'ok');
    });

    /* --- Adicionar item --- */
    view.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.add;
        const listEl = view.querySelector(`[data-drop="${key}"]`);
        const placeholder = listEl.querySelector('p.dim');
        if (placeholder) placeholder.remove();

        const row = html(`<div class="item">
          <span class="item__marker">${icon(COLUMN_BY_KEY[key].marker, 'ico--sm')}</span>
          <input class="item__input" placeholder="Descreva o item e pressione Enter">
        </div>`);
        listEl.appendChild(row);
        const input = row.querySelector('input');
        input.focus();

        const commit = keepOpen => {
          const text = input.value.trim();
          if (!text) { row.remove(); if (!listEl.children.length) renderDetail(view, project.id); return; }
          project.items[key].push({ id: U.uid('it'), text, done: key === 'done', createdAt: new Date().toISOString() });
          Store.save(project, { changes: [`${COLUMN_BY_KEY[key].label}: item adicionado — ${U.truncate(text, 60)}`] });
          renderDetail(view, project.id);
          if (keepOpen) {
            const nextBtn = view.querySelector(`[data-add="${key}"]`);
            if (nextBtn) nextBtn.click();
          }
        };
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(true); }
          if (e.key === 'Escape') { row.remove(); }
        });
        input.addEventListener('blur', () => setTimeout(() => { if (row.isConnected) commit(false); }, 120));
      });
    });

    /* --- Editar texto inline --- */
    view.querySelectorAll('[data-edit]').forEach(span => {
      span.addEventListener('click', () => {
        const itemEl = span.closest('.item');
        const key = itemEl.dataset.col;
        const item = project.items[key].find(i => i.id === span.dataset.edit);
        if (!item) return;
        const input = html(`<input class="item__input" value="${esc(item.text)}">`);
        span.replaceWith(input);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        const commit = () => {
          const text = input.value.trim();
          if (text && text !== item.text) {
            const before = item.text;
            item.text = text;
            Store.save(project, { changes: [`Item editado: “${U.truncate(before, 40)}” → “${U.truncate(text, 40)}”`] });
          }
          renderDetail(view, project.id);
        };
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') renderDetail(view, project.id);
        });
        input.addEventListener('blur', commit);
      });
    });

    /* --- Concluir / reabrir / excluir --- */
    view.querySelectorAll('[data-complete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemEl = btn.closest('.item');
        const key = itemEl.dataset.col;
        const idx = project.items[key].findIndex(i => i.id === btn.dataset.complete);
        if (idx < 0) return;
        const [item] = project.items[key].splice(idx, 1);
        item.done = true;
        project.items.done.unshift(item);
        refresh([`Item concluído: ${U.truncate(item.text, 60)}`]);
        UI.toast('Item movido para Realizado.', 'ok');
      });
    });
    view.querySelectorAll('[data-reopen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = project.items.done.findIndex(i => i.id === btn.dataset.reopen);
        if (idx < 0) return;
        const [item] = project.items.done.splice(idx, 1);
        item.done = false;
        project.items.doing.unshift(item);
        refresh([`Item reaberto: ${U.truncate(item.text, 60)}`]);
      });
    });
    view.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemEl = btn.closest('.item');
        const key = itemEl.dataset.col;
        const item = project.items[key].find(i => i.id === btn.dataset.remove);
        if (!item) return;
        if (Store.settings().prefs.confirmDelete) {
          const ok = await UI.confirm({
            title: 'Excluir item',
            message: `Remover “${U.truncate(item.text, 80)}” de ${COLUMN_BY_KEY[key].label}?`,
            confirmLabel: 'Excluir', danger: true
          });
          if (!ok) return;
        }
        project.items[key] = project.items[key].filter(i => i.id !== item.id);
        refresh([`${COLUMN_BY_KEY[key].label}: item removido — ${U.truncate(item.text, 60)}`]);
      });
    });

    bindDragAndDrop(view, project);
  }

  /* --- Reordenação por arrastar (dentro e entre colunas) --- */
  function bindDragAndDrop(view, project) {
    let dragged = null;

    view.querySelectorAll('.item[draggable="true"]').forEach(el => {
      el.addEventListener('dragstart', e => {
        dragged = { id: el.dataset.item, col: el.dataset.col };
        el.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', el.dataset.item); } catch (err) { /* ignora */ }
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('is-dragging');
        view.querySelectorAll('.is-over').forEach(n => n.classList.remove('is-over'));
      });
      el.addEventListener('dragover', e => {
        if (!dragged) return;
        e.preventDefault();
        el.classList.add('is-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('is-over'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragged) return;
        move(dragged, el.dataset.col, el.dataset.item);
      });
    });

    view.querySelectorAll('[data-drop]').forEach(listEl => {
      listEl.addEventListener('dragover', e => { if (dragged) e.preventDefault(); });
      listEl.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragged) return;
        move(dragged, listEl.dataset.drop, null);
      });
    });

    function move(source, targetCol, beforeItemId) {
      const fromList = project.items[source.col];
      const idx = fromList.findIndex(i => i.id === source.id);
      if (idx < 0) { dragged = null; return; }
      const [item] = fromList.splice(idx, 1);
      if (targetCol === 'done') item.done = true;
      else if (source.col === 'done') item.done = false;

      const toList = project.items[targetCol];
      const insertAt = beforeItemId ? toList.findIndex(i => i.id === beforeItemId) : toList.length;
      toList.splice(insertAt < 0 ? toList.length : insertAt, 0, item);

      const changes = source.col === targetCol
        ? [`${COLUMN_BY_KEY[targetCol].label}: itens reordenados`]
        : [`Item movido de ${COLUMN_BY_KEY[source.col].label} para ${COLUMN_BY_KEY[targetCol].label} — ${U.truncate(item.text, 50)}`];
      dragged = null;
      Store.save(project, { changes });
      renderDetail(view, project.id);
    }
  }

  /* ---------------- Formulário ---------------- */
  function openForm(existing) {
    const settings = Store.settings();
    const isNew = !existing;
    const p = existing ? JSON.parse(JSON.stringify(existing)) : Store.emptyProject();

    const body = html(`<div>
      <div class="form-grid">
        <div class="field span-2">
          <label for="pName">Nome do projeto *</label>
          <input class="input" id="pName" value="${esc(p.name)}" placeholder="Ex.: Implantação do painel de indicadores" maxlength="120">
        </div>
        <div class="field span-2">
          <label for="pDesc">Descrição</label>
          <textarea class="textarea" id="pDesc" placeholder="O que este projeto entrega e por quê">${esc(p.description)}</textarea>
        </div>
        <div class="field">
          <label for="pOwner">Responsável</label>
          <input class="input" id="pOwner" value="${esc(p.owner)}" list="ownerList" placeholder="Nome do responsável">
          <datalist id="ownerList">${Store.allOwners().map(o => `<option value="${esc(o)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="pArea">Área</label>
          <input class="input" id="pArea" value="${esc(p.area)}" list="areaList" placeholder="Ex.: Operações">
          <datalist id="areaList">${settings.areas.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="pStatus">Status</label>
          <select class="select" id="pStatus">
            ${settings.statuses.map(s => `<option value="${esc(s.id)}" ${s.id === p.statusId ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="pCrit">Criticidade</label>
          <select class="select" id="pCrit">
            ${settings.criticalities.map(c => `<option value="${esc(c.id)}" ${c.id === p.criticalityId ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="pStart">Data de início</label>
          <input class="input" type="date" id="pStart" value="${esc(U.toDateInput(p.startDate))}">
        </div>
        <div class="field">
          <label for="pDue">Prazo previsto</label>
          <input class="input" type="date" id="pDue" value="${esc(U.toDateInput(p.dueDate))}">
        </div>
        <div class="field span-2">
          <label>Tags</label>
          <div id="pTags"></div>
          <span class="hint">Pressione Enter para adicionar cada tag.</span>
        </div>
        <div class="field span-2">
          <label>Flags</label>
          <div class="flag-picker" id="pFlags">
            ${settings.flags.map(f => `
              <button type="button" class="flag-toggle ${p.flags.includes(f.id) ? 'is-on' : ''}"
                      data-flag="${esc(f.id)}" style="--c:${esc(f.color)}">
                <i></i>${esc(f.label)}</button>`).join('')}
            ${settings.flags.length ? '' : '<span class="hint">Nenhuma flag cadastrada. Crie flags em Configurações.</span>'}
          </div>
        </div>
      </div>

      <div class="divider"></div>
      <p class="eyebrow" style="margin-bottom:10px">Acompanhamento</p>
      <div class="form-grid">
        ${COLUMNS.map(col => `
          <div class="field">
            <label>${esc(col.label)}</label>
            <div class="mini-list" data-list="${col.key}"></div>
            <button type="button" class="item-add" data-addrow="${col.key}">${icon('plus', 'ico--sm')} Adicionar</button>
          </div>`).join('')}
      </div>
    </div>`);

    const modal = UI.openModal({
      title: isNew ? 'Novo projeto' : 'Editar projeto',
      subtitle: isNew ? 'Os dados ficam salvos apenas neste navegador.' : U.truncate(p.name, 70),
      size: 'wide',
      body,
      footer: `<button class="btn" data-modal-close>Cancelar</button>
               <button class="btn btn--primary" data-act="save">${isNew ? 'Criar projeto' : 'Salvar alterações'}</button>`
    });

    const tagsInput = UI.chipsInput(modal.root.querySelector('#pTags'), p.tags, {
      suggestions: Store.allTags(), placeholder: 'Adicionar tag'
    });

    /* flags */
    const selectedFlags = new Set(p.flags);
    modal.root.querySelectorAll('[data-flag]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.flag;
        if (selectedFlags.has(id)) { selectedFlags.delete(id); btn.classList.remove('is-on'); }
        else { selectedFlags.add(id); btn.classList.add('is-on'); }
      });
    });

    /* listas de acompanhamento */
    const draft = {
      doing: p.items.doing.map(i => i.text),
      risks: p.items.risks.map(i => i.text),
      next: p.items.next.map(i => i.text),
      done: p.items.done.map(i => i.text)
    };
    function renderMiniList(key) {
      const wrap = modal.root.querySelector(`[data-list="${key}"]`);
      wrap.innerHTML = draft[key].map((text, i) => `
        <div class="mini-list__row">
          <input class="input" value="${esc(text)}" data-key="${key}" data-idx="${i}">
          <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-del="${key}:${i}" title="Remover">${icon('x', 'ico--sm')}</button>
        </div>`).join('') || '<span class="hint">Nenhum item.</span>';
      wrap.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', e => { draft[e.target.dataset.key][+e.target.dataset.idx] = e.target.value; });
      });
      wrap.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          const [k, i] = btn.dataset.del.split(':');
          draft[k].splice(+i, 1);
          renderMiniList(k);
        });
      });
    }
    COLUMNS.forEach(col => renderMiniList(col.key));
    modal.root.querySelectorAll('[data-addrow]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.addrow;
        draft[key].push('');
        renderMiniList(key);
        const inputs = modal.root.querySelectorAll(`[data-list="${key}"] input`);
        if (inputs.length) inputs[inputs.length - 1].focus();
      });
    });

    /* salvar */
    modal.root.querySelector('[data-act="save"]').addEventListener('click', () => {
      const name = modal.root.querySelector('#pName').value.trim();
      if (!name) {
        UI.toast('Informe o nome do projeto para continuar.', 'warn');
        modal.root.querySelector('#pName').focus();
        return;
      }
      const start = modal.root.querySelector('#pStart').value;
      const due = modal.root.querySelector('#pDue').value;
      if (start && due && new Date(due) < new Date(start)) {
        UI.toast('O prazo previsto não pode ser anterior à data de início.', 'warn');
        return;
      }

      const updated = Object.assign({}, p, {
        name,
        description: modal.root.querySelector('#pDesc').value.trim(),
        owner: modal.root.querySelector('#pOwner').value.trim(),
        area: modal.root.querySelector('#pArea').value.trim(),
        statusId: modal.root.querySelector('#pStatus').value,
        criticalityId: modal.root.querySelector('#pCrit').value,
        startDate: start,
        dueDate: due,
        tags: tagsInput.value,
        flags: Array.from(selectedFlags)
      });

      // Preserva ids/datas dos itens que não mudaram de texto
      COLUMNS.forEach(col => {
        const previous = (existing ? existing.items[col.key] : []) || [];
        updated.items[col.key] = draft[col.key]
          .map(text => text.trim())
          .filter(Boolean)
          .map(text => {
            const match = previous.find(i => i.text === text);
            return match || { id: U.uid('it'), text, done: col.key === 'done', createdAt: new Date().toISOString() };
          });
      });

      const changes = existing ? diffProjects(existing, updated) : ['Projeto criado'];
      const saved = Store.save(updated, { changes: changes.length ? changes : ['Projeto revisado sem alterações de conteúdo'] });
      modal.close();
      UI.toast(isNew ? 'Projeto criado.' : 'Alterações salvas.', 'ok');
      if (isNew) location.hash = '#/projects/' + saved.id;
      else global.App.rerender();
    });
  }

  /** Compara duas versões e descreve as mudanças para o histórico. */
  function diffProjects(before, after) {
    const changes = [];
    if (before.name !== after.name) changes.push(`Nome alterado para “${U.truncate(after.name, 50)}”`);
    if (before.description !== after.description) changes.push('Descrição atualizada');
    if (before.owner !== after.owner) changes.push(`Responsável: ${after.owner || 'não definido'}`);
    if (before.area !== after.area) changes.push(`Área: ${after.area || 'não definida'}`);
    if (before.statusId !== after.statusId) {
      changes.push(`Status alterado de ${Store.status(before.statusId).label} para ${Store.status(after.statusId).label}`);
    }
    if (before.criticalityId !== after.criticalityId) {
      changes.push(`Criticidade alterada para ${Store.criticality(after.criticalityId).label}`);
    }
    if (before.dueDate !== after.dueDate) changes.push(`Prazo previsto: ${U.fmtDate(after.dueDate)}`);
    if (before.startDate !== after.startDate) changes.push(`Data de início: ${U.fmtDate(after.startDate)}`);
    if (before.tags.join('|') !== after.tags.join('|')) changes.push('Tags atualizadas');
    if (before.flags.join('|') !== after.flags.join('|')) changes.push('Flags atualizadas');

    COLUMNS.forEach(col => {
      const b = before.items[col.key].map(i => i.text);
      const a = after.items[col.key].map(i => i.text);
      const added = a.filter(t => !b.includes(t));
      const removed = b.filter(t => !a.includes(t));
      added.forEach(t => changes.push(`${col.label}: adicionado — ${U.truncate(t, 55)}`));
      removed.forEach(t => changes.push(`${col.label}: removido — ${U.truncate(t, 55)}`));
    });
    return changes;
  }

  /** Aplica um recorte vindo de outra tela (ex.: KPIs do dashboard). */
  function setFilters(patch) {
    Object.assign(filters, {
      search: '', status: '', criticality: '', owner: '', area: '', tag: '', updated: ''
    }, patch || {});
  }

  global.Projects = {
    renderList, renderDetail, openForm, confirmDelete, setFilters,
    isStale, isOverdue, needsAttention, attentionReasons, counts, COLUMNS
  };
})(window);
