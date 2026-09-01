/* =========================================================
   storage.js — persistência local (localStorage)
   Único ponto de contato com o armazenamento do navegador.
   Exposto globalmente como window.Store
   ========================================================= */
(function (global) {
  'use strict';

  const NS = 'opsboard.v1';
  const KEYS = {
    projects: NS + '.projects',
    settings: NS + '.settings',
    meta: NS + '.meta'
  };
  const SCHEMA_VERSION = 1;

  /* ---------- Fallback quando o localStorage não está disponível ---------- */
  let memoryFallback = null;
  function storageAvailable() {
    try {
      const k = NS + '.probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }
  const HAS_LS = storageAvailable();
  if (!HAS_LS) memoryFallback = new Map();

  function rawGet(key) {
    try { return HAS_LS ? localStorage.getItem(key) : (memoryFallback.get(key) || null); }
    catch (e) { return null; }
  }
  function rawSet(key, value) {
    try {
      if (HAS_LS) localStorage.setItem(key, value);
      else memoryFallback.set(key, value);
      return true;
    } catch (e) {
      console.error('[Store] Falha ao gravar', key, e);
      return false;
    }
  }

  function readJSON(key, fallback) {
    const raw = rawGet(key);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      console.warn('[Store] JSON inválido em', key, '— usando valor padrão.');
      return fallback;
    }
  }
  function writeJSON(key, value) { return rawSet(key, JSON.stringify(value)); }

  /* ---------- Configurações padrão ---------- */
  function defaultSettings() {
    return {
      schema: SCHEMA_VERSION,
      theme: 'system',
      statuses: [
        { id: 'st_active', label: 'Ativo', color: '#17805a', kind: 'active' },
        { id: 'st_paused', label: 'Pausado', color: '#b8860b', kind: 'paused' },
        { id: 'st_stopped', label: 'Parado', color: '#c03a3a', kind: 'stopped' },
        { id: 'st_done', label: 'Concluído', color: '#6c7689', kind: 'done' }
      ],
      criticalities: [
        { id: 'cr_normal', label: 'Normal', color: '#17805a', weight: 1 },
        { id: 'cr_attention', label: 'Atenção', color: '#b8860b', weight: 2 },
        { id: 'cr_critical', label: 'Crítico', color: '#c03a3a', weight: 3 }
      ],
      flags: [
        { id: 'fl_dep', label: 'Dependência externa', color: '#7a4fd0' },
        { id: 'fl_ti', label: 'Aguardando TI', color: '#2a6bb0' },
        { id: 'fl_forn', label: 'Aguardando fornecedor', color: '#b4632c' },
        { id: 'fl_prazo', label: 'Risco de prazo', color: '#c03a3a' },
        { id: 'fl_prio', label: 'Alta prioridade', color: '#a3325f' },
        { id: 'fl_block', label: 'Bloqueado', color: '#4b5468' }
      ],
      areas: ['Operações', 'Tecnologia', 'Financeiro', 'Comercial', 'Qualidade'],
      prefs: {
        staleDays: 7,          // dias sem atualização = "desatualizado"
        pageSize: 25,
        confirmDelete: true,
        demoDismissed: false
      },
      trello: {
        agingAttention: 7,     // dias abertos → backlog em atenção
        agingCritical: 14,     // dias abertos → backlog crítico
        defaultPeriod: 30,     // janela padrão de análise (dias)
        doneKeywords: 'concluido, concluído, done, finalizado, entregue, publicado, completo, aprovado, finalizada',
        doingKeywords: 'producao, produção, doing, andamento, execucao, execução, em progresso, wip, revisao, revisão, review, edicao, edição',
        treatArchivedAsDone: false
      }
    };
  }

  /* ---------- Modelo de projeto ---------- */
  function emptyProject() {
    const now = new Date().toISOString();
    return {
      id: U.uid('prj'),
      name: '',
      description: '',
      owner: '',
      area: '',
      statusId: 'st_active',
      criticalityId: 'cr_normal',
      startDate: '',
      dueDate: '',
      tags: [],
      flags: [],
      items: { doing: [], risks: [], next: [], done: [] },
      history: [],
      createdAt: now,
      updatedAt: now
    };
  }

  /** Garante que um projeto vindo de import/versão antiga tenha todos os campos. */
  function normalizeProject(input) {
    const base = emptyProject();
    const p = Object.assign(base, input || {});
    p.id = input && input.id ? String(input.id) : base.id;
    p.name = String(p.name || 'Projeto sem nome');
    p.description = String(p.description || '');
    p.owner = String(p.owner || '');
    p.area = String(p.area || '');
    p.tags = Array.isArray(p.tags) ? p.tags.map(String) : [];
    p.flags = Array.isArray(p.flags) ? p.flags.map(String) : [];
    const items = p.items && typeof p.items === 'object' ? p.items : {};
    p.items = {
      doing: normalizeItems(items.doing),
      risks: normalizeItems(items.risks),
      next: normalizeItems(items.next),
      done: normalizeItems(items.done, true)
    };
    p.history = Array.isArray(p.history) ? p.history.slice(0, 200) : [];
    p.createdAt = p.createdAt || new Date().toISOString();
    p.updatedAt = p.updatedAt || p.createdAt;
    return p;
  }
  function normalizeItems(list, forceDone) {
    if (!Array.isArray(list)) return [];
    return list.map(it => {
      if (typeof it === 'string') return { id: U.uid('it'), text: it, done: !!forceDone, createdAt: new Date().toISOString() };
      return {
        id: it && it.id ? String(it.id) : U.uid('it'),
        text: String((it && it.text) || ''),
        done: forceDone ? true : !!(it && it.done),
        createdAt: (it && it.createdAt) || new Date().toISOString()
      };
    }).filter(it => it.text.trim() !== '');
  }

  /* ---------- Estado em memória ---------- */
  let settings = null;
  let projects = null;
  let meta = null;
  const listeners = new Set();

  function loadSettings() {
    const stored = readJSON(KEYS.settings, null);
    const base = defaultSettings();
    if (!stored) return base;
    // merge defensivo: mantém defaults para chaves ausentes
    const merged = Object.assign(base, stored);
    merged.prefs = Object.assign(base.prefs, stored.prefs || {});
    merged.trello = Object.assign(base.trello, stored.trello || {});
    if (!Array.isArray(merged.statuses) || !merged.statuses.length) merged.statuses = base.statuses;
    if (!Array.isArray(merged.criticalities) || !merged.criticalities.length) merged.criticalities = base.criticalities;
    if (!Array.isArray(merged.flags)) merged.flags = base.flags;
    if (!Array.isArray(merged.areas)) merged.areas = base.areas;
    return merged;
  }

  function init() {
    settings = loadSettings();
    projects = readJSON(KEYS.projects, null);
    if (!Array.isArray(projects)) projects = null; // null = nunca inicializado (seed pode entrar)
    if (projects) projects = projects.map(normalizeProject);
    meta = readJSON(KEYS.meta, null) || { snapshotVersion: null, editedLocally: false };
  }
  init();

  function emit(type, payload) {
    listeners.forEach(fn => {
      try { fn({ type, payload }); } catch (e) { console.error(e); }
    });
  }

  function markEdited() {
    if (!meta.editedLocally) {
      meta.editedLocally = true;
      writeJSON(KEYS.meta, meta);
    }
  }

  /* ---------- API pública ---------- */
  const Store = {
    HAS_LS,
    SCHEMA_VERSION,

    /* --- Metadados locais (controle do snapshot publicado) --- */
    meta() { return Object.assign({}, meta); },
    setMeta(patch) {
      meta = Object.assign({}, meta, patch || {});
      writeJSON(KEYS.meta, meta);
      return meta;
    },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /* --- Configurações --- */
    settings() { return settings; },
    saveSettings(patch) {
      settings = Object.assign({}, settings, patch || {});
      writeJSON(KEYS.settings, settings);
      emit('settings', settings);
      return settings;
    },
    setPref(key, value) {
      settings.prefs[key] = value;
      writeJSON(KEYS.settings, settings);
      emit('settings', settings);
    },
    setTrelloPref(key, value) {
      settings.trello[key] = value;
      writeJSON(KEYS.settings, settings);
      emit('settings', settings);
    },

    /* --- Consultas de taxonomia --- */
    status(id) {
      return settings.statuses.find(s => s.id === id) ||
        { id: id || 'st_unknown', label: 'Sem status', color: '#6c7689', kind: 'active' };
    },
    criticality(id) {
      return settings.criticalities.find(c => c.id === id) ||
        { id: id || 'cr_unknown', label: 'Não definida', color: '#6c7689', weight: 1 };
    },
    flag(id) {
      return settings.flags.find(f => f.id === id) ||
        { id: id, label: 'Flag removida', color: '#6c7689' };
    },
    allTags() {
      return U.unique((projects || []).flatMap(p => p.tags)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    allOwners() {
      return U.unique((projects || []).map(p => p.owner)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },

    /* --- Projetos --- */
    isInitialized() { return projects !== null; },
    projects() { return projects || []; },
    project(id) { return (projects || []).find(p => p.id === id) || null; },

    setProjects(list, options) {
      projects = (list || []).map(normalizeProject);
      writeJSON(KEYS.projects, projects);
      // Alterações vindas de um snapshot publicado não contam como edição do visitante.
      if (!(options && options.fromSnapshot)) markEdited();
      if (!(options && options.silent)) emit('projects', projects);
      return projects;
    },

    /**
     * Cria ou atualiza um projeto.
     * @param {object} project
     * @param {{changes?: string[], touch?: boolean}} [meta] entradas para o histórico
     */
    save(project, meta) {
      if (!projects) projects = [];
      const normalized = normalizeProject(project);
      const touch = !meta || meta.touch !== false;
      if (touch) normalized.updatedAt = new Date().toISOString();

      const changes = (meta && meta.changes) || [];
      if (changes.length) {
        normalized.history = [{
          id: U.uid('hst'),
          ts: normalized.updatedAt,
          changes: changes.slice(0, 12)
        }].concat(normalized.history || []).slice(0, 120);
      }

      const idx = projects.findIndex(p => p.id === normalized.id);
      if (idx >= 0) projects[idx] = normalized;
      else projects.unshift(normalized);

      writeJSON(KEYS.projects, projects);
      markEdited();
      emit('projects', projects);
      return normalized;
    },

    remove(id) {
      if (!projects) return;
      projects = projects.filter(p => p.id !== id);
      writeJSON(KEYS.projects, projects);
      markEdited();
      emit('projects', projects);
    },

    /* --- Backup / portabilidade --- */
    exportAll() {
      return {
        app: 'OpsBoard',
        schema: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        settings: settings,
        projects: projects || []
      };
    },

    /**
     * Importa um backup.
     * @param {object} data
     * @param {'replace'|'merge'} mode
     * @returns {{imported:number, skipped:number, settings:boolean}}
     */
    importAll(data, mode) {
      if (!data || typeof data !== 'object') throw new Error('Arquivo inválido: conteúdo não reconhecido.');
      const incoming = Array.isArray(data.projects) ? data.projects
        : (Array.isArray(data) ? data : null);
      if (!incoming) throw new Error('Arquivo inválido: nenhuma lista de projetos encontrada.');

      let importedSettings = false;
      if (data.settings && typeof data.settings === 'object') {
        const base = defaultSettings();
        const merged = Object.assign(base, data.settings);
        merged.prefs = Object.assign(base.prefs, data.settings.prefs || {});
        merged.trello = Object.assign(base.trello, data.settings.trello || {});
        settings = merged;
        writeJSON(KEYS.settings, settings);
        importedSettings = true;
      }

      const normalized = incoming.map(normalizeProject);
      let imported = 0, skipped = 0;

      if (mode === 'merge' && projects) {
        const byId = new Map(projects.map(p => [p.id, p]));
        for (const p of normalized) {
          const existing = byId.get(p.id);
          if (existing) {
            // vence o registro mais recente
            if (new Date(p.updatedAt) > new Date(existing.updatedAt)) { byId.set(p.id, p); imported++; }
            else skipped++;
          } else { byId.set(p.id, p); imported++; }
        }
        projects = Array.from(byId.values());
      } else {
        projects = normalized;
        imported = normalized.length;
      }

      writeJSON(KEYS.projects, projects);
      emit('projects', projects);
      emit('settings', settings);
      return { imported, skipped, settings: importedSettings };
    },

    resetAll() {
      try {
        if (HAS_LS) Object.values(KEYS).forEach(k => localStorage.removeItem(k));
        else memoryFallback.clear();
      } catch (e) { /* ignora */ }
      settings = defaultSettings();
      projects = null;
      meta = { snapshotVersion: null, editedLocally: false };
      emit('reset');
    },

    /** Uso aproximado do armazenamento, em KB. */
    usage() {
      let bytes = 0;
      Object.values(KEYS).forEach(k => { bytes += (rawGet(k) || '').length * 2; });
      return bytes / 1024;
    },

    defaultSettings,
    emptyProject,
    normalizeProject
  };

  global.Store = Store;
})(window);
