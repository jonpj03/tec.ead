/* =========================================================
   app.js — roteador, tema e inicialização
   Exposto globalmente como window.App
   ========================================================= */
(function (global) {
  'use strict';
  const { $, $$, icon } = U;

  const view = $('#view');
  const sidebar = $('#sidebar');
  const scrim = $('#scrim');
  const titleEl = $('#pageTitle');
  const subtitleEl = $('#pageSubtitle');
  const actionsEl = $('#pageActions');

  let current = { route: 'dashboard', param: null };
  const mediaDark = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  /* ---------------------------------------------------------
     Tema
     --------------------------------------------------------- */
  function applyTheme() {
    const pref = Store.settings().theme || 'system';
    const resolved = pref === 'system' ? (mediaDark && mediaDark.matches ? 'dark' : 'light') : pref;
    document.documentElement.setAttribute('data-theme', resolved);
    $$('[data-theme-set]').forEach(btn => {
      btn.classList.toggle('is-on', btn.dataset.themeSet === pref);
      btn.setAttribute('aria-pressed', String(btn.dataset.themeSet === pref));
    });
  }

  function setTheme(pref) {
    Store.saveSettings({ theme: pref });
    applyTheme();
  }

  if (mediaDark) {
    const onSchemeChange = () => { if ((Store.settings().theme || 'system') === 'system') applyTheme(); };
    if (mediaDark.addEventListener) mediaDark.addEventListener('change', onSchemeChange);
    else if (mediaDark.addListener) mediaDark.addListener(onSchemeChange);
  }

  /* ---------------------------------------------------------
     Navegação lateral (off-canvas no celular)
     --------------------------------------------------------- */
  function openSidebar() {
    sidebar.classList.add('is-open');
    scrim.hidden = false;
    document.body.classList.add('no-scroll');
  }
  function closeSidebar() {
    sidebar.classList.remove('is-open');
    scrim.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  $('#burger').addEventListener('click', openSidebar);
  $('#sidebarClose').addEventListener('click', closeSidebar);
  scrim.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebar.classList.contains('is-open')) closeSidebar();
  });
  $$('.nav__item').forEach(link => link.addEventListener('click', closeSidebar));
  $$('[data-theme-set]').forEach(btn => btn.addEventListener('click', () => setTheme(btn.dataset.themeSet)));

  /* ---------------------------------------------------------
     Roteamento
     --------------------------------------------------------- */
  const ROUTES = {
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Visão executiva do portfólio',
      render: () => Dashboard.render(view),
      actions: () => [{ id: 'newProject', label: 'Novo projeto', ico: 'plus', primary: true }]
    },
    projects: {
      title: 'Projetos',
      subtitle: 'Acompanhamento macro de cada frente',
      render: () => Projects.renderList(view),
      actions: () => [{ id: 'newProject', label: 'Novo projeto', ico: 'plus', primary: true }]
    },
    project: {
      title: 'Projeto',
      subtitle: '',
      render: param => Projects.renderDetail(view, param),
      actions: () => [{ id: 'backToProjects', label: 'Voltar', ico: 'chevron-left' }]
    },
    trello: {
      title: 'Analisador Trello',
      subtitle: 'Leitura local do CSV exportado — nada sai deste navegador',
      render: () => Trello.render(view),
      actions: () => Trello.hasAnalysis()
        ? [{ id: 'newAnalysis', label: 'Novo arquivo', ico: 'refresh' }]
        : []
    },
    settings: {
      title: 'Configurações',
      subtitle: 'Personalização, preferências e backup dos dados',
      render: () => Settings.render(view),
      actions: () => []
    }
  };

  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '').trim();
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return { route: 'dashboard', param: null };
    const [head, param] = parts;
    if (head === 'projects' && param) return { route: 'project', param: decodeURIComponent(param) };
    if (ROUTES[head]) return { route: head, param: null };
    return { route: 'dashboard', param: null };
  }

  function renderActions(list) {
    actionsEl.innerHTML = (list || []).map(a =>
      `<button class="btn btn--sm ${a.primary ? 'btn--primary' : ''}" data-action="${a.id}">
         ${icon(a.ico, 'ico--sm')}<span>${U.esc(a.label)}</span>
       </button>`).join('');
  }

  actionsEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.action;
    if (id === 'newProject') Projects.openForm(null);
    else if (id === 'backToProjects') location.hash = '#/projects';
    else if (id === 'newAnalysis') { Trello.reset(); render(); }
  });

  function render() {
    current = parseHash();
    const route = ROUTES[current.route];

    // estado da navegação lateral
    const navKey = current.route === 'project' ? 'projects' : current.route;
    $$('.nav__item').forEach(link => {
      const active = link.dataset.nav === navKey;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    titleEl.textContent = route.title;
    subtitleEl.textContent = route.subtitle;
    subtitleEl.hidden = !route.subtitle;
    renderActions(route.actions());

    view.innerHTML = '';
    try {
      route.render(current.param);
    } catch (err) {
      console.error('Falha ao renderizar a rota', current, err);
      view.innerHTML = `<div class="callout callout--danger">${icon('alert')}
        <div><strong>Não foi possível carregar esta tela.</strong>
        <p class="small">${U.esc(err.message || 'Erro inesperado.')} Recarregue a página; seus dados continuam salvos.</p></div></div>`;
    }

    // no detalhe, o título vem do próprio projeto
    if (current.route === 'project') {
      const project = Store.project(current.param);
      if (project) {
        titleEl.textContent = U.truncate(project.name, 60);
        subtitleEl.textContent = `Atualizado ${U.relativeDays(project.updatedAt)}`;
        subtitleEl.hidden = false;
      }
    }

    document.title = `${titleEl.textContent} · OpsBoard`;
    view.scrollTop = 0;
    global.scrollTo({ top: 0, behavior: 'auto' });
    refreshChrome();
  }

  /** Atualiza contadores e elementos fora da área de conteúdo. */
  function refreshChrome() {
    $('#navProjectCount').textContent = U.num(Store.projects().length);
    applyTheme();
  }

  /** Redesenha a tela atual (após salvar, importar, etc.). */
  function rerender() { render(); }

  /** Abre a lista de projetos já filtrada (usado pelos KPIs do dashboard). */
  function setProjectFilters(patch) { Projects.setFilters(patch); }

  global.addEventListener('hashchange', render);

  /* ---------------------------------------------------------
     Snapshot publicado (data/projetos.js)
     --------------------------------------------------------- */
  function snapshot() {
    const s = global.OPSBOARD_SNAPSHOT;
    if (!s || !s.publishedAt || !Array.isArray(s.projects) || !s.projects.length) return null;
    return s;
  }

  /** Grava o conteúdo publicado por cima do que existe no navegador. */
  function applySnapshot(snap) {
    if (snap.settings && typeof snap.settings === 'object') {
      // O tema é preferência de quem visita, não de quem publicou.
      const localTheme = Store.settings().theme;
      Store.saveSettings(Object.assign({}, snap.settings, { theme: localTheme }));
    }
    Store.setProjects(snap.projects, { fromSnapshot: true });
    Store.setMeta({ snapshotVersion: snap.publishedAt, editedLocally: false });
  }

  function handleSnapshot() {
    const snap = snapshot();
    if (!snap) return false;

    const meta = Store.meta();
    const isNew = meta.snapshotVersion !== snap.publishedAt;
    if (!isNew) return false;

    // Visitante que nunca editou nada: recebe a versão publicada direto.
    if (!Store.isInitialized() || !meta.editedLocally) {
      applySnapshot(snap);
      return true;
    }

    // Já editou por conta própria: decide o que fazer, nada é sobrescrito sem aviso.
    UI.toast(
      `Há uma versão publicada mais recente${snap.label ? ` (${snap.label})` : ''}. ` +
      'Suas alterações locais serão substituídas se você atualizar.',
      'info', 0, {
        actionLabel: 'Atualizar',
        onAction() {
          applySnapshot(snap);
          render();
          UI.toast('Painel atualizado com a versão publicada.', 'ok');
        },
        dismissLabel: 'Manter o meu',
        onDismiss() { Store.setMeta({ snapshotVersion: snap.publishedAt }); }
      });
    return false;
  }

  /* ---------------------------------------------------------
     Inicialização
     --------------------------------------------------------- */
  function boot() {
    applyTheme();

    const fromSnapshot = handleSnapshot();

    // Primeira visita sem snapshot publicado: carrega os projetos de demonstração.
    if (!fromSnapshot && !Store.isInitialized()) {
      Store.setProjects(Seed.projects(), { fromSnapshot: true });
      Store.setPref('demoDismissed', false);
    }

    if (!location.hash) location.hash = '#/dashboard';
    render();

    if (!Store.HAS_LS) {
      UI.toast('Este navegador está bloqueando o armazenamento local. As alterações valem só para esta aba — exporte um backup em Configurações.', 'warn', 9000);
    }
  }

  global.App = { render, rerender, refreshChrome, setTheme, setProjectFilters, get route() { return current; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
