/*
 * Kreft DevTools — a panel inside the page (opened by the "K" button or Alt+Shift+D while `kreft dev` runs).
 *   Components  the live component tree; pick one to see and change its props, state and derived values
 *   Stores      every Kreft.store: change values, $reset()
 *   Route       the current route and every route of the router
 *   Timeline    store actions and bus messages, newest first
 */
(function () {
  'use strict';
  const Kreft = window.Kreft;
  if (!Kreft || !Kreft.__devtools) return console.warn('[Kreft] DevTools need Kreft 1.5 or newer.');
  const dt = Kreft.__devtools;

  const host = document.createElement('div');
  host.setAttribute('data-kreft-devtools', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { all: initial }
    .panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); z-index: 2147483647; display: flex; flex-direction: column;
      background: #09090b; color: #EDEDF1; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; border-left: 1px solid #27272a }
    header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #2A2738 }
    header b { color: #fafafa; font-size: 15px } header span { color: #8F8BA3; font-size: 12px; flex: 1 }
    button { font: inherit; cursor: pointer; border: 1px solid #3A364D; background: #201D2E; color: #EDEDF1; padding: 3px 9px }
    button:hover { border-color: #fafafa }
    nav { display: flex; gap: 4px; padding: 8px 12px; border-bottom: 1px solid #2A2738 }
    nav button.on { background: #fafafa; border-color: #fafafa; color: #09090b }
    main { flex: 1; overflow: auto; padding: 10px 12px }
    .tree div { padding: 2px 6px; cursor: pointer; white-space: nowrap; font-family: ui-monospace, Menlo, Consolas, monospace }
    .tree div:hover { background: #241F35 } .tree div.sel { background: #3B2416; color: #FFB08F }
    .tag { color: #FF8A5B } .muted { color: #8F8BA3 } .kept { color: #7DD3A8; font-size: 11px }
    h4 { margin: 14px 0 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #8F8BA3 }
    .row { display: grid; grid-template-columns: minmax(80px, 38%) 1fr; gap: 8px; align-items: start; padding: 3px 0; border-bottom: 1px dashed #2A2738 }
    .k { color: #C9B8FF; font-family: ui-monospace, Menlo, Consolas, monospace; word-break: break-all }
    .v { font-family: ui-monospace, Menlo, Consolas, monospace; word-break: break-all; white-space: pre-wrap }
    input, textarea { width: 100%; box-sizing: border-box; font: 12px ui-monospace, Menlo, Consolas, monospace; background: #0E0C17; color: #EDEDF1;
      border: 1px solid #3A364D;padding: 3px 6px } textarea { min-height: 54px; resize: vertical }
    input:focus, textarea:focus { outline: none; border-color: #fafafa }
    .ev { padding: 4px 0; border-bottom: 1px dashed #2A2738; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px }
    .ev em { font-style: normal; color: #7DD3A8 } .ev i { font-style: normal; color: #FF8A5B }
    .split { display: flex; flex-direction: column; gap: 6px }
  </style>
  <div class="panel">
    <header><b>Kreft</b><span>DevTools · ${Kreft.version}</span><button data-act="close" title="Close (Alt+Shift+D)">×</button></header>
    <nav><button data-tab="components" class="on">Components</button><button data-tab="stores">Stores</button><button data-tab="route">Route</button><button data-tab="timeline">Timeline</button></nav>
    <main></main>
  </div>`;
  const main = root.querySelector('main');
  let tab = 'components', selected = null, open = false, timer = null, lastHtml = '';

  // a box drawn over the element of the component under the mouse
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #2563eb;background:rgba(37,99,235,.08);display:none';
  document.body.appendChild(box);
  function highlight(inst) {
    const el = inst && dt.element(inst);
    if (!el || !el.getBoundingClientRect) return void (box.style.display = 'none');
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const show = (v) => { try { return typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, null, 1); } catch (_) { return String(v); } };
  const field = (where, key, value) => {
    const t = typeof value;
    if (t === 'boolean') return `<input type="checkbox" data-edit="${where}" data-key="${esc(key)}" ${value ? 'checked' : ''} style="width:auto">`;
    if (t === 'number' || t === 'string' || value == null) return `<input data-edit="${where}" data-key="${esc(key)}" data-type="${t}" value="${esc(value == null ? 'null' : value)}">`;
    return `<textarea data-edit="${where}" data-key="${esc(key)}" data-type="json">${esc(show(value))}</textarea>`;
  };
  const rows = (obj, edit) => {
    const keys = Object.keys(obj || {});
    if (!keys.length) return '<div class="muted">—</div>';
    return keys.map((k) => `<div class="row"><div class="k">${esc(k)}</div><div class="v">${edit ? field(edit, k, obj[k]) : esc(show(obj[k]))}</div></div>`).join('');
  };
  const routerOf = () => { const r = dt.instances().find((i) => !i.parent); return r && r.appContext.config.globals.$router; };

  function renderComponents() {
    const list = dt.instances();
    const byParent = new Map();
    list.forEach((i) => { const p = i.parent && list.includes(i.parent) ? i.parent.uid : null; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(i); });
    const tree = [];
    const walk = (p, depth) => (byParent.get(p) || []).sort((a, b) => a.uid - b.uid).forEach((i) => {
      const d = dt.describe(i);
      tree.push(`<div data-uid="${i.uid}" class="${selected === i.uid ? 'sel' : ''}" style="padding-left:${6 + depth * 14}px"><span class="tag">&lt;${esc(d.name)}&gt;</span>${d.kept ? ' <span class="kept">kept</span>' : ''}</div>`);
      walk(i.uid, depth + 1);
    });
    walk(null, 0);
    let detail = '<div class="muted" style="margin-top:12px">Pick a component to see its data.</div>';
    const inst = list.find((i) => i.uid === selected);
    if (inst) {
      const d = dt.describe(inst);
      detail = `<h4>&lt;${esc(d.name)}&gt; · props</h4>${rows(d.props)}<h4>state (you can change it)</h4>${rows(d.state, 'state')}<h4>derived</h4>${rows(d.derived)}`;
    }
    return `<div class="tree">${tree.join('') || '<div class="muted">No components yet.</div>'}</div>${detail}`;
  }
  function renderStores() {
    const names = Object.keys(dt.stores);
    if (!names.length) return '<div class="muted">No stores. Make one with Kreft.store(\'cart\', { … }).</div>';
    return names.map((n) => {
      const s = dt.stores[n];
      const data = {};
      Object.keys(s).forEach((k) => { if (typeof s[k] !== 'function') data[k] = s[k]; });
      return `<h4>${esc(n)} <button data-reset="${esc(n)}" style="margin-left:6px">$reset()</button></h4>${rows(data, 'store:' + n)}`;
    }).join('');
  }
  function renderRoute() {
    const r = routerOf();
    if (!r) return '<div class="muted">This app has no router.</div>';
    const cur = r.route;
    const info = { path: cur.path, params: cur.params, query: cur.query, name: cur.name, meta: cur.meta };
    const routes = (r.routes || []).map((x) => `<div class="row"><div class="k">${esc(x.path)}</div><div class="v">${x.path.includes(':') || x.path.includes('*') ? '<span class="muted">needs params</span>' : `<button data-go="${esc(x.path)}">go</button>`}${x.name ? ' <span class="muted">' + esc(x.name) + '</span>' : ''}</div></div>`).join('');
    return `<h4>current</h4>${rows(info)}<h4>routes</h4>${routes}`;
  }
  function renderTimeline() {
    const items = [
      ...dt.storeLog.map((e) => ({ at: e.at, html: `<em>${esc(e.store)}</em>.${esc(e.action)}(${esc(e.args.map(show).join(', ').slice(0, 120))})` })),
      ...dt.busLog.map((e) => ({ at: e.at, html: `<i>bus</i> ${esc(e.name)} ${esc(e.args.map(show).join(', ').slice(0, 120))}` })),
    ].sort((a, b) => b.at - a.at).slice(0, 100);
    if (!items.length) return '<div class="muted">Store actions and bus messages show up here.</div>';
    return items.map((e) => `<div class="ev"><span class="muted">${new Date(e.at).toLocaleTimeString()}</span> ${e.html}</div>`).join('');
  }
  function render(force) {
    if (!open) return;
    if (!force && root.activeElement && /INPUT|TEXTAREA/.test(root.activeElement.tagName)) return; // don't fight your typing
    const html = tab === 'components' ? renderComponents() : tab === 'stores' ? renderStores() : tab === 'route' ? renderRoute() : renderTimeline();
    if (html !== lastHtml) { main.innerHTML = html; lastHtml = html; }
  }

  function readValue(input) {
    if (input.type === 'checkbox') return input.checked;
    const t = input.getAttribute('data-type'), v = input.value;
    if (t === 'number') return Number(v);
    if (t === 'json' || v === 'null') { try { return JSON.parse(v); } catch (_) { return undefined; } }
    return v;
  }
  root.addEventListener('change', (e) => {
    const input = e.target, where = input.getAttribute('data-edit'), key = input.getAttribute('data-key');
    if (!where) return;
    const value = readValue(input);
    if (value === undefined) return void (input.style.borderColor = '#E5484D');
    input.style.borderColor = '';
    if (where === 'state') { const inst = dt.instances().find((i) => i.uid === selected); if (inst) dt.set(inst, key, value); }
    else if (where.startsWith('store:')) dt.stores[where.slice(6)][key] = value;
    input.blur();
    setTimeout(() => render(true), 30);
  });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-uid],[data-act],[data-reset],[data-go]');
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; root.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b === t)); }
    else if (t.dataset.uid) selected = Number(t.dataset.uid);
    else if (t.dataset.act === 'close') return api.toggle();
    else if (t.dataset.reset) dt.stores[t.dataset.reset].$reset();
    else if (t.dataset.go) { const r = routerOf(); if (r) r.go(t.dataset.go); }
    render(true);
  });
  root.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-uid]');
    highlight(t ? dt.instances().find((i) => i.uid === Number(t.dataset.uid)) : null);
  });
  root.addEventListener('mouseleave', () => highlight(null), true);
  host.addEventListener('mouseleave', () => highlight(null));

  const api = {
    toggle() {
      open = !open;
      if (open) { document.body.appendChild(host); lastHtml = ''; render(true); timer = setInterval(render, 500); }
      else { host.remove(); clearInterval(timer); highlight(null); }
    },
    get open() { return open; },
  };
  window.KreftDevtools = api;
})();
