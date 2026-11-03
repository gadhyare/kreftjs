/*
 * Kreft dev client — `kreftjs dev` adds this to every page while you work.
 *   • hot reload: a changed .kreftjs file is swapped in place and keeps its state;
 *     a changed .css file is reloaded; anything else reloads the page
 *   • error overlay: .kreftjs mistakes and runtime errors show on the page
 *   • DevTools: the "K" button (or Alt+Shift+D) opens the Kreft DevTools panel
 * Not part of your app: `kreftjs build` never includes it.
 */
(function () {
  'use strict';
  window.__KREFT_DEV__ = true;

  /* ---------------- error overlay ---------------- */
  let overlay = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function showError(title, message) {
    if (!document.body) return void addEventListener('DOMContentLoaded', () => showError(title, message));
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('data-kreft-overlay', '');
      overlay.style.cssText = 'position:fixed;inset:auto 16px 16px 16px;max-height:45vh;overflow:auto;z-index:2147483646;' +
        'background:#09090b;color:#fafafa;border-left:4px solid #dc2626;padding:14px 44px 14px 16px;' +
        'font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;border:1px solid #27272a';
      overlay.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) hideError(); });
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '<button data-close style="position:absolute;top:8px;right:10px;background:none;border:0;color:#EDEDF1;font-size:20px;cursor:pointer">×</button>' +
      `<div style="color:#f87171;font-weight:700;margin-bottom:6px">${esc(title)}</div><pre style="margin:0;white-space:pre-wrap">${esc(message)}</pre>`;
  }
  function hideError() { if (overlay) { overlay.remove(); overlay = null; } }
  const errorText = (e) => (e && (e.stack || e.message)) || String(e);
  addEventListener('error', (e) => showError('Error', errorText(e.error || e.message)));
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
  function isElectron() {
    if (typeof window === 'undefined') return false;
    if (window.kreftDesktop && window.kreftDesktop.isElectron) return true;
    if (window.__KREFT_ELECTRON__) return true;
    if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)) return true;
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) return true;
    return false;
  }

  function addButton() {
    // In Electron, totally hide the Kreft in-page DevTools button
    if (isElectron()) return;
    let hidden = false;
    try { hidden = localStorage.getItem('kreft:devtools-button') === 'off'; } catch (_) { /* blocked */ }
    if (hidden) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.title = 'Kreft DevTools (Alt+Shift+D)';
    b.setAttribute('data-kreft-devtools-button', '');
    b.textContent = 'K';
    b.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483645;width:34px;height:34px;border:0;' +
      'background:#18181b;color:#fafafa;font:700 16px/34px system-ui,sans-serif;cursor:pointer;border:1px solid #3f3f46;opacity:.9';
    b.onclick = openDevtools;
    b.oncontextmenu = (e) => { e.preventDefault(); b.remove(); try { localStorage.setItem('kreft:devtools-button', 'off'); } catch (_) {} };
    document.body.appendChild(b);
  }

  if (isElectron()) {
    // Ensure any devtools button is completely hidden in Electron
    const s = document.createElement('style');
    s.setAttribute('data-kreft-electron-style', '');
    s.textContent = '[data-kreft-devtools-button] { display: none !important; }';
    (document.head || document.documentElement).appendChild(s);
  } else {
    if (document.body) addButton(); else addEventListener('DOMContentLoaded', addButton);
  }
})();
