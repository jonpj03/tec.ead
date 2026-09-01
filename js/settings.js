/* =========================================================
   settings.js — personalização e gestão dos dados locais
   Exposto globalmente como window.Settings
   ========================================================= */
(function (global) {
  'use strict';
  const { $, esc, icon, html } = U;

  const KIND_LABELS = {
    active: 'Contabiliza como ativo',
    paused: 'Contabiliza como pausado',
    stopped: 'Contabiliza como parado',
    done: 'Contabiliza como concluído'
  };

  function render(view) {
    const s = Store.settings();
    const projects = Store.projects();
    const meta = Store.meta();

    view.innerHTML = `
      <div class="grid grid--2" style="align-items:start">

        <!-- Aparência -->
        <div class="panel">
          <div class="panel__head"><div><h2>Aparência</h2>
            <p class="tiny dim">A preferência fica salva neste navegador</p></div></div>
          <div class="panel__body">
            <div class="segmented" id="themePicker">
              ${[['light', 'Claro'], ['dark', 'Escuro'], ['system', 'Sistema']].map(([k, label]) =>
                `<button data-theme-opt="${k}" class="${s.theme === k ? 'is-on' : ''}">${label}</button>`).join('')}
            </div>
          </div>
        </div>

        <!-- Preferências gerais -->
        <div class="panel">
          <div class="panel__head"><h2>Preferências de acompanhamento</h2></div>
          <div class="panel__body panel__body--flush">
            <div class="settings-row">
              <div class="settings-row__main">
                <strong>Limite de desatualização</strong>
                <p>Dias sem edição para um projeto ser sinalizado como desatualizado</p>
              </div>
              <input class="input" type="number" min="1" max="180" id="staleDays" value="${esc(s.prefs.staleDays)}" style="width:88px">
            </div>
            <div class="settings-row">
              <div class="settings-row__main">
                <strong>Confirmar antes de excluir</strong>
                <p>Pede confirmação ao remover projetos e itens</p>
              </div>
              <label class="switch"><input type="checkbox" id="confirmDelete" ${s.prefs.confirmDelete ? 'checked' : ''}>
                <span class="switch__track"></span></label>
            </div>
          </div>
        </div>
      </div>

      <!-- Taxonomias -->
      <div class="grid grid--2 mt-16" style="align-items:start">
        ${taxonomyPanel('statuses', 'Status dos projetos', 'Cada status define como o projeto é contabilizado no dashboard.', s.statuses, true)}
        ${taxonomyPanel('criticalities', 'Níveis de criticidade', 'O peso define quais projetos entram na métrica de atenção.', s.criticalities, false, true)}
      </div>

      <div class="grid grid--2 mt-16" style="align-items:start">
        ${taxonomyPanel('flags', 'Flags', 'Marcadores livres para sinalizar dependências e riscos.', s.flags)}

        <div class="panel">
          <div class="panel__head"><div><h2>Áreas</h2>
            <p class="tiny dim">Sugestões exibidas no cadastro de projetos</p></div></div>
          <div class="panel__body">
            <div id="areasField"></div>
            <button class="btn btn--sm mt-8" id="saveAreas">Salvar áreas</button>
          </div>
        </div>
      </div>

      <!-- Trello -->
      <div class="panel mt-16">
        <div class="panel__head"><div><h2>Analisador Trello</h2>
          <p class="tiny dim">Define como os cards são classificados e quando o backlog vira atenção ou risco</p></div></div>
        <div class="panel__body panel__body--flush">
          <div class="settings-row">
            <div class="settings-row__main"><strong>Backlog em atenção</strong>
              <p>Cards abertos há mais dias que este valor</p></div>
            <input class="input" type="number" min="1" max="365" id="agingAttention" value="${esc(s.trello.agingAttention)}" style="width:88px">
          </div>
          <div class="settings-row">
            <div class="settings-row__main"><strong>Backlog crítico</strong>
              <p>Cards abertos há mais dias que este valor</p></div>
            <input class="input" type="number" min="2" max="720" id="agingCritical" value="${esc(s.trello.agingCritical)}" style="width:88px">
          </div>
          <div class="settings-row">
            <div class="settings-row__main"><strong>Janela padrão de análise</strong>
              <p>Período selecionado ao abrir uma nova análise</p></div>
            <select class="select" id="defaultPeriod">
              ${[7, 30, 90].map(d => `<option value="${d}" ${String(s.trello.defaultPeriod) === String(d) ? 'selected' : ''}>${d} dias</option>`).join('')}
              <option value="all" ${s.trello.defaultPeriod === 'all' ? 'selected' : ''}>Todo período</option>
            </select>
          </div>
          <div class="settings-row" style="align-items:flex-start">
            <div class="settings-row__main"><strong>Listas que indicam conclusão</strong>
              <p>Separe por vírgula. Um card em lista com um destes termos é considerado concluído.</p></div>
            <input class="input" id="doneKeywords" value="${esc(s.trello.doneKeywords)}" style="max-width:340px;min-width:200px">
          </div>
          <div class="settings-row" style="align-items:flex-start">
            <div class="settings-row__main"><strong>Listas que indicam produção</strong>
              <p>Cards nestas listas são contabilizados como em produção.</p></div>
            <input class="input" id="doingKeywords" value="${esc(s.trello.doingKeywords)}" style="max-width:340px;min-width:200px">
          </div>
          <div class="settings-row">
            <div class="settings-row__main"><strong>Tratar arquivados como concluídos</strong>
              <p>Use quando a operação arquiva o card ao finalizar a produção</p></div>
            <label class="switch"><input type="checkbox" id="treatArchived" ${s.trello.treatArchivedAsDone ? 'checked' : ''}>
              <span class="switch__track"></span></label>
          </div>
        </div>
        <div class="panel__foot row row--between">
          <span class="tiny dim">As alterações valem para a próxima análise gerada.</span>
          <button class="btn btn--primary btn--sm" id="saveTrello">Salvar preferências do Trello</button>
        </div>
      </div>

      <!-- Publicação -->
      <div class="panel mt-16">
        <div class="panel__head"><div><h2>Publicar o painel</h2>
          <p class="tiny dim">Gera o arquivo <code>data/projetos.js</code> com uma foto dos seus projetos</p></div></div>
        <div class="panel__body">
          <p class="small muted">Envie o arquivo gerado para o repositório, substituindo
          <code>data/projetos.js</code>. Quem abrir o site publicado passa a ver estes projetos sem
          precisar cadastrar nada. Repita sempre que quiser atualizar o que está no ar.</p>
          <div class="row gap-8 row--wrap mt-16">
            <input class="input" id="snapshotLabel" placeholder="Identificação da versão (ex.: Status de setembro)" style="max-width:340px">
            <button class="btn btn--primary" id="makeSnapshot">${icon('upload', 'ico--sm')} Gerar snapshot para publicação</button>
          </div>
          <p class="tiny dim mt-16">O snapshot é somente leitura para quem visita: as pessoas podem
          navegar, filtrar e usar o analisador, e se editarem algo a alteração fica apenas no navegador
          delas até você publicar a próxima versão.</p>
          ${meta.snapshotVersion ? `<div class="callout mt-16">${icon('info')}
            <div>Este navegador está com a versão publicada de <b>${esc(U.fmtDateTime(meta.snapshotVersion))}</b>.
            ${meta.editedLocally ? 'Há alterações locais feitas depois disso.' : 'Sem alterações locais desde então.'}</div></div>` : ''}
        </div>
      </div>

      <!-- Dados -->
      <div class="panel mt-16">
        <div class="panel__head"><div><h2>Seus dados</h2>
          <p class="tiny dim">${Store.HAS_LS
            ? `${U.num(projects.length)} ${U.plural(projects.length, 'projeto salvo', 'projetos salvos')} · ${U.num(Store.usage(), 1)} KB usados no navegador`
            : 'Armazenamento do navegador indisponível — os dados existem apenas nesta aba'}</p></div></div>
        <div class="panel__body">
          ${!Store.HAS_LS ? `<div class="callout callout--danger" style="margin-bottom:14px">${icon('alert')}
            <div><strong>O navegador está bloqueando o armazenamento local.</strong>
            Nada será mantido ao fechar a aba. Exporte um backup antes de sair.</div></div>` : ''}
          <div class="row gap-8 row--wrap">
            <button class="btn" id="exportData">${icon('download', 'ico--sm')} Exportar backup (JSON)</button>
            <button class="btn" id="importData">${icon('upload', 'ico--sm')} Restaurar backup</button>
            <input type="file" id="importInput" accept=".json,application/json" hidden>
            <button class="btn" id="exportCsv">${icon('table', 'ico--sm')} Exportar projetos (CSV)</button>
          </div>
          <div class="divider"></div>
          <div class="row gap-8 row--wrap">
            <button class="btn" id="loadDemo">${icon('refresh', 'ico--sm')} Recarregar dados de demonstração</button>
            <button class="btn btn--danger" id="removeDemo">${icon('trash', 'ico--sm')} Remover dados de demonstração</button>
            <button class="btn btn--danger" id="resetAll">${icon('alert', 'ico--sm')} Apagar tudo</button>
          </div>
          <p class="tiny dim mt-16">Os projetos ficam no <code>localStorage</code> deste navegador. Limpar o histórico do
          navegador, usar outro dispositivo ou uma janela anônima significa começar do zero — por isso o backup em JSON existe.</p>
        </div>
      </div>`;

    bindEvents(view);
  }

  function taxonomyPanel(kind, title, subtitle, list, showKind, showWeight) {
    return `<div class="panel" data-tax="${kind}">
      <div class="panel__head"><div><h2>${esc(title)}</h2><p class="tiny dim">${esc(subtitle)}</p></div>
        <button class="btn btn--sm" data-add-tax="${kind}">${icon('plus', 'ico--sm')} Adicionar</button></div>
      <div class="panel__body panel__body--flush">
        ${list.length ? list.map(item => `
          <div class="settings-row" data-item="${esc(item.id)}">
            <input class="swatch" type="color" value="${esc(item.color)}" data-color="${esc(item.id)}" title="Cor">
            <div class="settings-row__main">
              <input class="input" value="${esc(item.label)}" data-label="${esc(item.id)}" style="max-width:230px">
              ${showKind ? `<p>${esc(KIND_LABELS[item.kind] || 'Sem efeito nas métricas')}</p>` : ''}
              ${showWeight ? `<p>Peso ${esc(item.weight)}${item.weight >= 3 ? ' — entra na métrica de atenção' : ''}</p>` : ''}
            </div>
            ${showKind ? `<select class="select" data-kind="${esc(item.id)}" style="width:auto">
              ${Object.keys(KIND_LABELS).map(k => `<option value="${k}" ${item.kind === k ? 'selected' : ''}>${esc(KIND_LABELS[k])}</option>`).join('')}
            </select>` : ''}
            ${showWeight ? `<select class="select" data-weight="${esc(item.id)}" style="width:auto">
              ${[1, 2, 3].map(w => `<option value="${w}" ${item.weight === w ? 'selected' : ''}>Peso ${w}</option>`).join('')}
            </select>` : ''}
            <button class="icon-btn icon-btn--sm icon-btn--danger" data-del-tax="${kind}:${esc(item.id)}" title="Excluir">${icon('trash', 'ico--sm')}</button>
          </div>`).join('')
        : `<p class="small dim" style="padding:16px">Nada cadastrado ainda.</p>`}
      </div>
    </div>`;
  }

  function bindEvents(view) {
    const s = Store.settings();

    /* --- tema --- */
    view.querySelectorAll('[data-theme-opt]').forEach(btn => {
      btn.addEventListener('click', () => {
        global.App.setTheme(btn.dataset.themeOpt);
        view.querySelectorAll('[data-theme-opt]').forEach(b => b.classList.toggle('is-on', b === btn));
      });
    });

    /* --- preferências --- */
    const stale = $('#staleDays', view);
    stale.addEventListener('change', () => {
      const value = U.clamp(parseInt(stale.value, 10) || 7, 1, 180);
      stale.value = value;
      Store.setPref('staleDays', value);
      UI.toast('Limite de desatualização atualizado.', 'ok');
    });
    $('#confirmDelete', view).addEventListener('change', e => {
      Store.setPref('confirmDelete', e.target.checked);
    });

    /* --- taxonomias --- */
    view.querySelectorAll('[data-color]').forEach(input => {
      input.addEventListener('change', () => updateTaxonomy(input.closest('[data-tax]').dataset.tax,
        input.dataset.color, { color: input.value }, view));
    });
    view.querySelectorAll('[data-label]').forEach(input => {
      input.addEventListener('change', () => {
        const value = input.value.trim();
        if (!value) { UI.toast('O nome não pode ficar vazio.', 'warn'); render(view); return; }
        updateTaxonomy(input.closest('[data-tax]').dataset.tax, input.dataset.label, { label: value }, view, true);
      });
    });
    view.querySelectorAll('[data-kind]').forEach(select => {
      select.addEventListener('change', () => updateTaxonomy('statuses', select.dataset.kind, { kind: select.value }, view));
    });
    view.querySelectorAll('[data-weight]').forEach(select => {
      select.addEventListener('change', () => updateTaxonomy('criticalities', select.dataset.weight, { weight: +select.value }, view));
    });
    view.querySelectorAll('[data-add-tax]').forEach(btn => {
      btn.addEventListener('click', () => addTaxonomy(btn.dataset.addTax, view));
    });
    view.querySelectorAll('[data-del-tax]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [kind, id] = btn.dataset.delTax.split(':');
        deleteTaxonomy(kind, id, view);
      });
    });

    /* --- áreas --- */
    const areasField = UI.chipsInput($('#areasField', view), s.areas, { placeholder: 'Adicionar área' });
    $('#saveAreas', view).addEventListener('click', () => {
      Store.saveSettings({ areas: areasField.value });
      UI.toast('Áreas atualizadas.', 'ok');
    });

    /* --- Trello --- */
    $('#saveTrello', view).addEventListener('click', () => {
      const attention = U.clamp(parseInt($('#agingAttention', view).value, 10) || 7, 1, 365);
      let critical = U.clamp(parseInt($('#agingCritical', view).value, 10) || 14, 2, 720);
      if (critical <= attention) {
        critical = attention + 7;
        UI.toast('O limite crítico precisa ser maior que o de atenção. Ajustado automaticamente.', 'warn', 5000);
      }
      const period = $('#defaultPeriod', view).value;
      Store.saveSettings({
        trello: Object.assign({}, Store.settings().trello, {
          agingAttention: attention,
          agingCritical: critical,
          defaultPeriod: period === 'all' ? 'all' : Number(period),
          doneKeywords: $('#doneKeywords', view).value.trim() || Store.defaultSettings().trello.doneKeywords,
          doingKeywords: $('#doingKeywords', view).value.trim() || Store.defaultSettings().trello.doingKeywords,
          treatArchivedAsDone: $('#treatArchived', view).checked
        })
      });
      render(view);
      UI.toast('Preferências do Trello salvas.', 'ok');
    });

    /* --- publicação --- */
    $('#makeSnapshot', view).addEventListener('click', () => {
      const list = Store.projects();
      if (!list.length) return UI.toast('Não há projetos para publicar.', 'warn');
      const label = $('#snapshotLabel', view).value.trim();
      const publishedAt = new Date().toISOString();
      const payload = {
        publishedAt,
        label,
        projects: list,
        settings: Store.settings()
      };
      const file = `/* =========================================================
   data/projetos.js — snapshot publicado
   Gerado pelo OpsBoard em ${U.fmtDateTime(publishedAt)}${label ? ` — ${label}` : ''}
   ${list.length} ${U.plural(list.length, 'projeto', 'projetos')}.

   Substitua este arquivo no repositório e publique.
   ========================================================= */
window.OPSBOARD_SNAPSHOT = ${JSON.stringify(payload, null, 2)};
`;
      U.downloadFile('projetos.js', file, 'application/javascript');
      // Este navegador já está na versão que acabou de ser publicada.
      Store.setMeta({ snapshotVersion: publishedAt, editedLocally: false });
      render(view);
      UI.toast('Snapshot gerado. Substitua data/projetos.js no repositório.', 'ok', 6000);
    });

    /* --- dados --- */
    $('#exportData', view).addEventListener('click', () => {
      const data = Store.exportAll();
      U.downloadFile(`opsboard-backup-${U.timestampSlug()}.json`, JSON.stringify(data, null, 2), 'application/json');
      UI.toast('Backup exportado.', 'ok');
    });

    const importInput = $('#importInput', view);
    $('#importData', view).addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
      const file = importInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const count = Array.isArray(data.projects) ? data.projects.length : (Array.isArray(data) ? data.length : 0);
        if (!count) throw new Error('O arquivo não contém projetos.');

        const mode = await chooseImportMode(count);
        if (!mode) { importInput.value = ''; return; }
        const result = Store.importAll(data, mode);
        importInput.value = '';
        render(view);
        global.App.refreshChrome();
        UI.toast(`${U.num(result.imported)} ${U.plural(result.imported, 'projeto importado', 'projetos importados')}` +
          (result.skipped ? `, ${U.num(result.skipped)} ignorados por serem mais antigos.` : '.'), 'ok', 5000);
      } catch (err) {
        console.error(err);
        importInput.value = '';
        UI.toast(err.message || 'Não foi possível ler o backup.', 'error', 5500);
      }
    });

    $('#exportCsv', view).addEventListener('click', () => {
      const rows = Store.projects().map(p => ({
        'Projeto': p.name,
        'Descrição': p.description,
        'Status': Store.status(p.statusId).label,
        'Criticidade': Store.criticality(p.criticalityId).label,
        'Responsável': p.owner,
        'Área': p.area,
        'Tags': p.tags.join(' | '),
        'Flags': p.flags.map(f => Store.flag(f).label).join(' | '),
        'Início': U.fmtDate(p.startDate),
        'Prazo': U.fmtDate(p.dueDate),
        'Em andamento': p.items.doing.length,
        'Pontos de atenção': p.items.risks.length,
        'Próximos passos': p.items.next.length,
        'Realizado': p.items.done.length,
        'Última atualização': U.fmtDateTime(p.updatedAt)
      }));
      if (!rows.length) return UI.toast('Não há projetos para exportar.', 'warn');
      U.downloadFile(`projetos-${U.timestampSlug()}.csv`, U.toCSV(rows), 'text/csv');
      UI.toast('Projetos exportados em CSV.', 'ok');
    });

    $('#loadDemo', view).addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Recarregar demonstração',
        message: 'Os cinco projetos de exemplo serão adicionados novamente. Projetos existentes com o mesmo identificador serão substituídos.',
        confirmLabel: 'Recarregar'
      });
      if (!ok) return;
      const current = Store.projects().filter(p => !Seed.ids().includes(p.id));
      Store.setProjects(Seed.projects().concat(current));
      Store.setPref('demoDismissed', false);
      render(view);
      global.App.refreshChrome();
      UI.toast('Dados de demonstração recarregados.', 'ok');
    });

    $('#removeDemo', view).addEventListener('click', async () => {
      const demoIds = Seed.ids();
      const present = Store.projects().filter(p => demoIds.includes(p.id));
      if (!present.length) return UI.toast('Nenhum projeto de demonstração encontrado.', 'info');
      const ok = await UI.confirm({
        title: 'Remover dados de demonstração',
        message: `${present.length} ${U.plural(present.length, 'projeto de exemplo será removido', 'projetos de exemplo serão removidos')}. Seus projetos permanecem.`,
        confirmLabel: 'Remover exemplos', danger: true
      });
      if (!ok) return;
      Store.setProjects(Store.projects().filter(p => !demoIds.includes(p.id)));
      Store.setPref('demoDismissed', true);
      render(view);
      global.App.refreshChrome();
      UI.toast('Dados de demonstração removidos.', 'ok');
    });

    $('#resetAll', view).addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Apagar tudo',
        message: 'Todos os projetos, o histórico e as personalizações serão apagados deste navegador. Exporte um backup antes se quiser preservar algo.',
        confirmLabel: 'Apagar definitivamente', danger: true
      });
      if (!ok) return;
      Store.resetAll();
      Store.setProjects([]);
      Store.setPref('demoDismissed', true);
      global.App.refreshChrome();
      render(view);
      UI.toast('Tudo apagado. A aplicação voltou ao estado inicial.', 'ok');
    });
  }

  function chooseImportMode(count) {
    return new Promise(resolve => {
      let settled = false;
      const modal = UI.openModal({
        title: 'Restaurar backup',
        subtitle: `${count} ${U.plural(count, 'projeto encontrado', 'projetos encontrados')} no arquivo`,
        size: 'sm',
        body: `<p class="small muted">Como deseja aplicar este backup?</p>
          <div class="col gap-8 mt-16">
            <button class="btn btn--block" data-mode="merge">Mesclar com os projetos atuais</button>
            <button class="btn btn--block btn--danger" data-mode="replace">Substituir tudo pelo backup</button>
          </div>
          <p class="tiny dim mt-16">Na mesclagem, quando o mesmo projeto existe nos dois lados, vence a versão editada mais recentemente.</p>`,
        footer: `<button class="btn" data-modal-close>Cancelar</button>`,
        onClose() { if (!settled) { settled = true; resolve(null); } }
      });
      modal.root.querySelectorAll('[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => { settled = true; modal.close(); resolve(btn.dataset.mode); });
      });
    });
  }

  /* ---------------- Operações de taxonomia ---------------- */
  function updateTaxonomy(kind, id, patch, view, rerender) {
    const settings = Store.settings();
    const list = settings[kind].map(item => item.id === id ? Object.assign({}, item, patch) : item);
    Store.saveSettings({ [kind]: list });
    if (rerender) render(view);
    global.App.refreshChrome();
  }

  async function addTaxonomy(kind, view) {
    const titles = { statuses: 'Novo status', criticalities: 'Novo nível de criticidade', flags: 'Nova flag' };
    const label = await UI.prompt({ title: titles[kind], label: 'Nome', placeholder: 'Ex.: Em homologação' });
    if (!label) return;
    const settings = Store.settings();
    const prefix = { statuses: 'st', criticalities: 'cr', flags: 'fl' }[kind];
    const item = { id: U.uid(prefix), label, color: U.colorFor(label + Date.now()) };
    if (kind === 'statuses') item.kind = 'active';
    if (kind === 'criticalities') item.weight = 2;
    Store.saveSettings({ [kind]: settings[kind].concat([item]) });
    render(view);
    UI.toast(`${label} adicionado.`, 'ok');
  }

  async function deleteTaxonomy(kind, id, view) {
    const settings = Store.settings();
    const list = settings[kind];
    const item = list.find(i => i.id === id);
    if (!item) return;

    const projects = Store.projects();
    const inUse = kind === 'statuses' ? projects.filter(p => p.statusId === id)
      : kind === 'criticalities' ? projects.filter(p => p.criticalityId === id)
      : projects.filter(p => p.flags.includes(id));

    if (kind !== 'flags' && list.length <= 1) {
      return UI.toast('É preciso manter pelo menos uma opção nesta lista.', 'warn');
    }
    if (inUse.length && kind !== 'flags') {
      return UI.toast(`“${item.label}” está em uso por ${inUse.length} ${U.plural(inUse.length, 'projeto', 'projetos')}. Altere-os antes de excluir.`, 'warn', 5500);
    }

    const ok = await UI.confirm({
      title: `Excluir “${item.label}”`,
      message: inUse.length
        ? `A flag será removida de ${inUse.length} ${U.plural(inUse.length, 'projeto', 'projetos')}.`
        : 'Esta opção deixará de aparecer nos formulários.',
      confirmLabel: 'Excluir', danger: true
    });
    if (!ok) return;

    if (kind === 'flags' && inUse.length) {
      Store.setProjects(projects.map(p => Object.assign({}, p, { flags: p.flags.filter(f => f !== id) })));
    }
    Store.saveSettings({ [kind]: list.filter(i => i.id !== id) });
    render(view);
    global.App.refreshChrome();
    UI.toast('Excluído.', 'ok');
  }

  global.Settings = { render };
})(window);
