/*
 * Kreft dev client — `kreftjs dev` adds this to every page while you work.
 *   • hot reload: a changed .kreft file is swapped in place and keeps its state;
 *     a changed .css file is reloaded; anything else reloads the page
 *   • error overlay: .kreft mistakes and runtime errors show on the page
 *   • DevTools: Alt+Shift+D opens the Kreft DevTools panel (no floating button)
 * Not part of your app: `kreftjs build` never includes it.
 */
(function () {
  'use strict';
  window.__KREFT_DEV__ = true;

  /* ---------------- error overlay ---------------- */
  let overlay = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Every error is kept, oldest first: the first one is usually the cause (a later "Kreftjs is not defined" only follows a file that never started).
  const entries = [];
  const hintFor = (text) => (/SyntaxError|Unexpected token|Kreftjs is not defined|Kreft is not defined/.test(text)
    ? 'If kreftjs.js could not start, this browser is probably too old to read it. On a phone, update "Android System WebView" (and Chrome) in the Play Store, then reload.' : '');
  function showError(title, message) {
    if (!document.body) return void addEventListener('DOMContentLoaded', () => showError(title, message));
    const text = String(message);
    if (!entries.some((x) => x.title === title && x.message === text) && entries.length < 8) entries.push({ title, message: text });
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('data-kreft-overlay', '');
      overlay.style.cssText = 'position:fixed;inset:auto 16px 16px 16px;max-height:45vh;overflow:auto;z-index:2147483646;' +
        'background:#09090b;color:#fafafa;border-left:4px solid #dc2626;padding:14px 44px 14px 16px;' +
        'font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;border:1px solid #27272a';
      overlay.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) hideError(); });
      document.body.appendChild(overlay);
    }
    const hint = entries.map((x) => hintFor(x.message)).find(Boolean);
    overlay.innerHTML = '<button data-close style="position:absolute;top:8px;right:10px;background:none;border:0;color:#EDEDF1;font-size:20px;cursor:pointer">×</button>' +
      (entries.length > 1 ? `<div style="color:#a1a1aa;margin-bottom:8px">${entries.length} errors. The first one is usually the cause.</div>` : '') +
      entries.map((x) => `<div style="color:#f87171;font-weight:700;margin:6px 0">${esc(x.title)}</div><pre style="margin:0;white-space:pre-wrap">${esc(x.message)}</pre>`).join('') +
      (hint ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #27272a;color:#fbbf24">${esc(hint)}</div>` : '');
  }
  function hideError() { if (overlay) { overlay.remove(); overlay = null; } entries.length = 0; }
  const errorText = (e) => (e && (e.stack || e.message)) || String(e);
  // a script that cannot be read has no stack: say which file and line
  const withWhere = (text, e) => (e && e.filename && !String(text).includes(e.filename) ? `${text}\n    at ${e.filename}:${e.lineno}:${e.colno}` : text);
  addEventListener('error', (e) => showError('Error', withWhere(errorText(e.error || e.message), e)));
  addEventListener('unhandledrejection', (e) => showError('Error (promise)', errorText(e.reason)));
  const consoleError = console.error.bind(console);
  console.error = (...args) => {
    consoleError(...args);
    if (args[0] === '[Kreft error]' || /^\[Kreft error\]/.test(String(args[0]))) {
      showError('Kreft error', args.slice(args[0] === '[Kreft error]' ? 1 : 0).map((a) => (a instanceof Error ? errorText(a) : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    }
  };

  /* ---------------- hot reload ---------------- */
  const reload = () => location.reload();
  async function onChange(msg) {
    if (msg.type === 'kreft' && window.Kreftjs && window.Kreftjs.__hot) {
      try {
        const res = await fetch(msg.path, { cache: 'no-store', headers: window.Kreftjs.__fileHeaders ? window.Kreftjs.__fileHeaders(msg.path) : {} });
        const ok = await window.Kreftjs.__hot(new URL(msg.path, location.origin).href, await res.text());
        if (!ok) return reload();
        hideError();
        console.log('[Kreft] updated ' + msg.path);
      } catch (e) {
        showError('Could not update ' + msg.path, e.message);
      }
      return;
    }
    if (msg.type === 'css') {
      const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter((l) => new URL(l.href, location.href).pathname === msg.path);
      if (!links.length) return reload();
      links.forEach((l) => { const u = new URL(l.href, location.href); u.searchParams.set('t', Date.now()); l.href = u.href; });
      console.log('[Kreft] updated ' + msg.path);
      return;
    }
    reload();
  }
  function connect() {
    if (!window.EventSource) return;
    const es = new EventSource('/__kreft/events');
    let wasOpen = false;
    es.onopen = () => { if (wasOpen) reload(); wasOpen = true; }; // the server restarted
    es.onmessage = (e) => { try { onChange(JSON.parse(e.data)); } catch (_) { /* ignore */ } };
    es.onerror = () => { if (es.readyState === 2) setTimeout(connect, 1000); };
  }
  connect();

  /* ---------------- DevTools button ---------------- */
  let loaded = null;
  function openDevtools() {
    if (window.KreftDevtools) return window.KreftDevtools.toggle();
    if (loaded) return;
    loaded = document.createElement('script');
    loaded.src = '/__kreft/devtools.js';
    loaded.onload = () => window.KreftDevtools && window.KreftDevtools.toggle();
    document.head.appendChild(loaded);
  }
  window.__kreftOpenDevtools = openDevtools; // pages can offer a button
  window.addEventListener('keydown', (e) => { if (e.altKey && e.shiftKey && (e.key === 'D' || e.key === 'd' || e.code === 'KeyD')) openDevtools(); });
})();
