/* =========================================================
   ui.js — componentes de interface reutilizáveis
   Exposto globalmente como window.UI
   ========================================================= */
(function (global) {
  'use strict';
  const { $, html, esc, icon } = U;

  /* ---------------- Toasts ---------------- */
  const toastRoot = $('#toasts');
  const TOAST_ICONS = { ok: 'check', info: 'info', warn: 'alert', error: 'alert' };

  function toast(message, type, duration) {
    const kind = type || 'info';
    const node = html(`
      <div class="toast toast--${esc(kind)}" role="status">
        ${icon(TOAST_ICONS[kind] || 'info')}
        <div class="grow">${esc(message)}</div>
        <button class="icon-btn icon-btn--sm" aria-label="Fechar">${icon('x', 'ico--sm')}</button>
      </div>`);
    const close = () => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 220);
    };
    node.querySelector('button').addEventListener('click', close);
    toastRoot.appendChild(node);
    setTimeout(close, duration || 3800);
    return close;
  }

  /* ---------------- Modais ---------------- */
  const modalRoot = $('#modalRoot');
  const modalStack = [];

  function openModal(options) {
    const opts = Object.assign({ title: '', subtitle: '', body: '', footer: '', size: '', onMount: null, onClose: null }, options);
    const wrapper = html(`
      <div class="modal ${opts.size === 'wide' ? 'modal--wide' : opts.size === 'sm' ? 'modal--sm' : ''}"
           role="dialog" aria-modal="true" aria-label="${esc(opts.title)}">
        <div class="modal__head">
          <div class="grow">
            <h2>${esc(opts.title)}</h2>
            ${opts.subtitle ? `<p>${esc(opts.subtitle)}</p>` : ''}
          </div>
          <button class="icon-btn" data-modal-close aria-label="Fechar">${icon('x')}</button>
        </div>
        <div class="modal__body"></div>
        ${opts.footer ? `<div class="modal__foot"></div>` : ''}
      </div>`);

    const bodyEl = wrapper.querySelector('.modal__body');
    if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
    else if (opts.body) bodyEl.appendChild(opts.body);

    if (opts.footer) {
      const footEl = wrapper.querySelector('.modal__foot');
      if (typeof opts.footer === 'string') footEl.innerHTML = opts.footer;
      else footEl.appendChild(opts.footer);
    }

    modalRoot.hidden = false;
    modalRoot.innerHTML = '';
    modalRoot.appendChild(wrapper);
    document.body.style.overflow = 'hidden';

    const api = {
      root: wrapper,
      body: bodyEl,
      close() {
        modalStack.pop();
        modalRoot.hidden = true;
        modalRoot.innerHTML = '';
        document.body.style.overflow = '';
        if (opts.onClose) opts.onClose();
      }
    };
    modalStack.push(api);

    wrapper.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', api.close));
    if (opts.onMount) opts.onMount(api);

    // foco no primeiro campo interativo
    setTimeout(() => {
      const focusable = wrapper.querySelector('input, textarea, select, button:not([data-modal-close])');
      if (focusable) focusable.focus();
    }, 40);

    return api;
  }

  modalRoot.addEventListener('mousedown', e => {
    if (e.target === modalRoot && modalStack.length) modalStack[modalStack.length - 1].close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close();
  });

  /** Confirmação com promessa. */
  function confirm(options) {
    const opts = Object.assign({
      title: 'Confirmar ação',
      message: 'Deseja continuar?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      danger: false
    }, options);

    return new Promise(resolve => {
      let settled = false;
      const modal = openModal({
        title: opts.title,
        size: 'sm',
        body: `<p class="muted" style="line-height:1.55">${esc(opts.message)}</p>`,
        footer: `
          <button class="btn" data-act="cancel">${esc(opts.cancelLabel)}</button>
          <button class="btn ${opts.danger ? 'btn--danger' : 'btn--primary'}" data-act="ok">${esc(opts.confirmLabel)}</button>`,
        onClose() { if (!settled) { settled = true; resolve(false); } }
      });
      modal.root.querySelector('[data-act="cancel"]').addEventListener('click', () => modal.close());
      modal.root.querySelector('[data-act="ok"]').addEventListener('click', () => {
        settled = true; modal.close(); resolve(true);
      });
    });
  }

  /** Entrada de texto simples em modal. */
  function prompt(options) {
    const opts = Object.assign({ title: 'Informe um valor', label: 'Valor', value: '', placeholder: '', confirmLabel: 'Salvar' }, options);
    return new Promise(resolve => {
      let settled = false;
      const modal = openModal({
        title: opts.title,
        size: 'sm',
        body: `<div class="field"><label for="promptInput">${esc(opts.label)}</label>
               <input class="input" id="promptInput" value="${esc(opts.value)}" placeholder="${esc(opts.placeholder)}"></div>`,
        footer: `<button class="btn" data-act="cancel">Cancelar</button>
                 <button class="btn btn--primary" data-act="ok">${esc(opts.confirmLabel)}</button>`,
        onClose() { if (!settled) { settled = true; resolve(null); } }
      });
      const input = modal.root.querySelector('#promptInput');
      const submit = () => {
        const value = input.value.trim();
        if (!value) { input.focus(); return; }
        settled = true; modal.close(); resolve(value);
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      modal.root.querySelector('[data-act="ok"]').addEventListener('click', submit);
      modal.root.querySelector('[data-act="cancel"]').addEventListener('click', () => modal.close());
    });
  }

  /* ---------------- Renderizadores ---------------- */
  function badge(label, color, extraClass) {
    return `<span class="badge badge--c ${extraClass || ''}" style="--c:${esc(color || '#6c7689')}">
              <i class="dot"></i><span>${esc(label)}</span></span>`;
  }
  function statusBadge(statusId) {
    const s = Store.status(statusId);
    return badge(s.label, s.color);
  }
  function criticalityBadge(criticalityId) {
    const c = Store.criticality(criticalityId);
    return badge(c.label, c.color);
  }
  function avatar(name, size) {
    if (!name) return `<span class="avatar ${size === 'sm' ? 'avatar--sm' : ''}" style="--c:#6c7689" title="Sem responsável">?</span>`;
    const color = U.colorFor(name);
    return `<span class="avatar ${size === 'sm' ? 'avatar--sm' : ''}" title="${esc(name)}"
             style="background:color-mix(in srgb, ${color} 15%, transparent);color:${color};border-color:color-mix(in srgb, ${color} 32%, transparent)">${esc(U.initials(name))}</span>`;
  }
  function empty(iconName, title, message, actionHTML) {
    return `<div class="empty">
      <div class="empty__icon">${icon(iconName)}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(message)}</p>
      ${actionHTML ? `<div class="mt-8">${actionHTML}</div>` : ''}
    </div>`;
  }
  function delta(current, previous, options) {
    const opts = options || {};
    if (previous === null || previous === undefined || Number.isNaN(previous)) {
      return `<span class="delta delta--flat">sem base de comparação</span>`;
    }
    if (previous === 0 && current === 0) return `<span class="delta delta--flat">0%</span>`;
    if (previous === 0) return `<span class="delta delta--up">${icon('up')} novo</span>`;
    const change = ((current - previous) / Math.abs(previous)) * 100;
    const dir = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'flat';
    const arrow = dir === 'up' ? icon('up') : dir === 'down' ? icon('down') : '';
    return `<span class="delta delta--${dir} ${opts.inverse ? 'delta--inverse' : ''}">
      ${arrow}${U.num(Math.abs(change), 1)}%</span>`;
  }
  function infoDot(text) {
    return `<span class="info-dot tip" data-tip="${esc(text)}" tabindex="0">i</span>`;
  }

  /* ---------------- Menu suspenso ---------------- */
  function attachDropdown(triggerEl, menuEl) {
    let open = false;
    const close = () => {
      if (!open) return;
      open = false;
      menuEl.hidden = true;
      document.removeEventListener('mousedown', onOutside, true);
    };
    const onOutside = e => {
      if (!menuEl.contains(e.target) && !triggerEl.contains(e.target)) close();
    };
    triggerEl.addEventListener('click', e => {
      e.stopPropagation();
      open = !open;
      menuEl.hidden = !open;
      if (open) setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
      else document.removeEventListener('mousedown', onOutside, true);
    });
    menuEl.hidden = true;
    return { close };
  }

  /* ---------------- Editor de listas (tags, itens) ---------------- */
  /** Campo que transforma texto em chips (usado para tags). */
  function chipsInput(container, values, options) {
    const opts = Object.assign({ placeholder: 'Digite e pressione Enter', suggestions: [] }, options);
    let list = (values || []).slice();
    const listId = U.uid('dl');

    function render() {
      container.innerHTML = `
        <div class="chips-field">
          ${list.map((v, i) => `<span class="chip chip--tag">${esc(v)}
            <button type="button" data-remove="${i}" aria-label="Remover ${esc(v)}">${icon('x', 'ico--sm')}</button></span>`).join('')}
          <input class="chips-field__input" placeholder="${esc(opts.placeholder)}" list="${listId}">
          <datalist id="${listId}">${(opts.suggestions || []).map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        </div>`;
      const input = container.querySelector('input');
      container.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          list.splice(+btn.dataset.remove, 1);
          render();
          container.querySelector('input').focus();
        });
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          add(input.value);
        } else if (e.key === 'Backspace' && !input.value && list.length) {
          list.pop(); render(); container.querySelector('input').focus();
        }
      });
      input.addEventListener('blur', () => { if (input.value.trim()) add(input.value); });
    }
    function add(raw) {
      const value = String(raw || '').trim().replace(/^#/, '');
      if (value && !list.some(v => U.normalize(v) === U.normalize(value))) list.push(value);
      render();
      const input = container.querySelector('input');
      if (input) input.focus();
    }
    render();
    return { get value() { return list.slice(); }, set value(v) { list = (v || []).slice(); render(); } };
  }

  global.UI = {
    toast, openModal, confirm, prompt,
    badge, statusBadge, criticalityBadge, avatar, empty, delta, infoDot,
    attachDropdown, chipsInput
  };
})(window);
