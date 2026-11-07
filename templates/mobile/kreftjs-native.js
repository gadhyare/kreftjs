/*
 * kreftjs-native.js: native features for Kreft apps, and the `edge` store that styles the top bar and bottom bar.
 *
 *   Kreftjs.native.device.info()           Kreftjs.native.file.pick()            Kreftjs.native.dialog.confirm('Sure?')
 *   Kreftjs.native.haptics.impact()        Kreftjs.native.system.share({...})    Kreftjs.native.safeArea()
 *   Kreftjs.native.position.get()          Kreftjs.native.on('resume', fn)       Kreftjs.native.asset('img/a.png')
 *
 * It runs inside the Capacitor phone app (iOS / Android), inside Electron, and in a plain browser. In the phone app it uses the
 * native plugins (@capacitor/device, haptics, filesystem …); anywhere else it falls back to what the browser has, so you can build
 * the whole app in the browser first. Every call returns a Promise (except where noted) and never throws for "not supported":
 * it resolves with a sensible default instead.
 */
(function (global) {
  'use strict';
  const K = global.Kreftjs;
  if (!K) { if (global.console) console.warn('kreftjs-native.js: load kreftjs.js first.'); return; }

  /* ------------------------------------------------------------ platform and plugins */
  const cap = () => global.Capacitor || null;
  const platform = () => {
    const c = cap();
    if (c && c.isNativePlatform && c.isNativePlatform()) return c.getPlatform();
    if (global.kreftDesktop || global.__KREFT_ELECTRON__) return 'electron';
    return 'web';
  };
  const isNative = () => { const p = platform(); return p === 'android' || p === 'ios'; };
  // call a Capacitor plugin method: Kreftjs.native.plugin('Device', 'getInfo'); null when there is no such plugin (browser, or not installed)
  function call(name, method, opts) {
    const c = cap();
    if (!c || !isNative()) return Promise.resolve(null);
    try {
      if (c.isPluginAvailable && !c.isPluginAvailable(name)) return Promise.resolve(null);
      if (c.nativePromise) return c.nativePromise(name, method, opts || {});
      const p = c.Plugins && c.Plugins[name];
      return p && p[method] ? Promise.resolve(p[method](opts || {})) : Promise.resolve(null);
    } catch (_) { return Promise.resolve(null); }
  }
  function listen(name, event, fn) { // returns a function that stops listening
    const c = cap();
    if (!c || !isNative() || !c.addListener) return () => {};
    let handle = null, stopped = false;
    try {
      Promise.resolve(c.addListener(name, event, fn)).then((h) => { if (stopped && h && h.remove) h.remove(); else handle = h; }).catch(() => {});
    } catch (_) { return () => {}; }
    return () => { stopped = true; if (handle && handle.remove) handle.remove(); };
  }
  const ok = (v) => Promise.resolve(v);

  /* ------------------------------------------------------------ device */
  const device = {
    async info() {
      const native = await call('Device', 'getInfo');
      const screen = { width: global.screen ? global.screen.width : 0, height: global.screen ? global.screen.height : 0, pixelRatio: global.devicePixelRatio || 1 };
      if (native) return { ...native, platform: platform(), screen };
      const ua = (global.navigator && navigator.userAgent) || '';
      const os = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Mac/i.test(ua) ? 'mac' : /Windows/i.test(ua) ? 'windows' : /Linux/i.test(ua) ? 'linux' : 'unknown';
      return { platform: platform(), operatingSystem: os, osVersion: '', model: platform() === 'electron' ? 'desktop' : 'browser', manufacturer: '', isVirtual: false, webViewVersion: '', screen };
    },
    async id() { const r = await call('Device', 'getId'); return r ? r.identifier : ''; },
    async battery() {
      const r = await call('Device', 'getBatteryInfo');
      if (r) return r;
      if (global.navigator && navigator.getBattery) { try { const b = await navigator.getBattery(); return { batteryLevel: b.level, isCharging: b.charging }; } catch (_) { /* no access */ } }
      return { batteryLevel: null, isCharging: null };
    },
    async language() { const r = await call('Device', 'getLanguageCode'); return r ? r.value : ((global.navigator && navigator.language) || 'en'); },
  };

  /* ------------------------------------------------------------ haptics */
  const STYLE = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
  const NOTE = { success: 'SUCCESS', warning: 'WARNING', error: 'ERROR' };
  const buzz = (ms) => { try { if (global.navigator && navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* not allowed */ } return ok(); };
  const haptics = {
    impact(style = 'medium') { return isNative() ? call('Haptics', 'impact', { style: STYLE[style] || 'MEDIUM' }) : buzz(style === 'heavy' ? 30 : style === 'light' ? 8 : 15); },
    notification(type = 'success') { return isNative() ? call('Haptics', 'notification', { type: NOTE[type] || 'SUCCESS' }) : buzz(type === 'error' ? [20, 40, 20] : 20); },
    selection() { return isNative() ? call('Haptics', 'selectionChanged') : buzz(5); },
    vibrate(ms = 200) { return isNative() ? call('Haptics', 'vibrate', { duration: ms }) : buzz(ms); },
  };

  /* ------------------------------------------------------------ files */
  const FS = 'kreft-fs:';
  const lsGet = (k) => { try { return localStorage.getItem(FS + k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(FS + k, v); return true; } catch (_) { return false; } };
  const file = {
    // let the person choose files: pick({ accept: 'image/*', multiple: true }) → File[]
    pick(opts = {}) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = opts.accept || '*/*';
        input.multiple = Boolean(opts.multiple);
        if (opts.capture) input.setAttribute('capture', opts.capture); // 'environment' = rear camera
        input.className = 'edge-hidden-input';
        input.addEventListener('change', () => { const files = Array.from(input.files || []); input.remove(); resolve(files); });
        input.addEventListener('cancel', () => { input.remove(); resolve([]); });
        document.body.appendChild(input);
        input.click();
      });
    },
    readText(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); }); },
    readDataUrl(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); },
    // keep a file in the app's own storage (Documents folder on the phone; the browser's localStorage elsewhere, small files only)
    async write(path, data, opts = {}) {
      const native = isNative() && await call('Filesystem', 'writeFile', { path, data: String(data), directory: opts.directory || 'DOCUMENTS', encoding: opts.base64 ? undefined : 'utf8', recursive: true });
      if (native) return { uri: native.uri || path };
      return { uri: path, saved: lsSet(path, String(data)) };
    },
    async read(path, opts = {}) {
      const native = isNative() && await call('Filesystem', 'readFile', { path, directory: opts.directory || 'DOCUMENTS', encoding: opts.base64 ? undefined : 'utf8' });
      if (native) return native.data;
      return lsGet(path);
    },
    async remove(path, opts = {}) {
      if (isNative()) await call('Filesystem', 'deleteFile', { path, directory: opts.directory || 'DOCUMENTS' });
      else { try { localStorage.removeItem(FS + path); } catch (_) { /* nothing to remove */ } }
    },
    async list(path = '', opts = {}) {
      const native = isNative() && await call('Filesystem', 'readdir', { path, directory: opts.directory || 'DOCUMENTS' });
      if (native) return (native.files || []).map((f) => (typeof f === 'string' ? f : f.name));
      try { return Object.keys(localStorage).filter((k) => k.startsWith(FS + path)).map((k) => k.slice(FS.length)); } catch (_) { return []; }
    },
    // hand a generated file to the person: a download in the browser, the Documents folder + share sheet on the phone
    async save(name, data, mime = 'text/plain') {
      if (isNative()) {
        const w = await file.write(name, data);
        await system.share({ title: name, url: w.uri });
        return w;
      }
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.className = 'edge-hidden-input';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { uri: name };
    },
  };

  /* ------------------------------------------------------------ system */
  const system = {
    platform, isNative,
    isDesktop: () => platform() === 'electron',
    isWeb: () => platform() === 'web',
    async openUrl(url) {
      if (!/^(https?:|mailto:|tel:|sms:)/i.test(String(url))) return false; // never javascript: or file:
      const r = isNative() ? await call('Browser', 'open', { url }) : null;
      if (r === null) global.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },
    async share(opts = {}) {
      const native = await call('Share', 'share', { title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title });
      if (native) return true;
      if (global.navigator && navigator.share) { try { await navigator.share({ title: opts.title, text: opts.text, url: opts.url }); return true; } catch (_) { return false; } }
      return system.copy([opts.text, opts.url].filter(Boolean).join(' '));
    },
    async copy(text) {
      const native = await call('Clipboard', 'write', { string: String(text) });
      if (native !== null) return true;
      try { await navigator.clipboard.writeText(String(text)); return true; } catch (_) { return false; }
    },
    async paste() {
      const native = await call('Clipboard', 'read');
      if (native) return native.value || '';
      try { return await navigator.clipboard.readText(); } catch (_) { return ''; }
    },
    async network() {
      const native = await call('Network', 'getStatus');
      if (native) return native;
      const c = global.navigator && (navigator.connection || {});
      return { connected: global.navigator ? navigator.onLine !== false : true, connectionType: c.effectiveType || 'unknown' };
    },
    async app() {
      const native = await call('App', 'getInfo');
      return native || { name: document.title || '', id: '', build: '', version: '' };
    },
    exit() { return call('App', 'exitApp'); },
    keyboard: {
      show() { return call('Keyboard', 'show'); },
      hide() { return call('Keyboard', 'hide'); },
    },
    // statusBar.set({ color: '#111', style: 'light' | 'dark', overlay: false }): on the phone the real status bar, in a browser the address bar colour
    async statusBar(o = {}) {
      if (isNative()) {
        if (o.color) await call('StatusBar', 'setBackgroundColor', { color: o.color });
        if (o.style) await call('StatusBar', 'setStyle', { style: o.style === 'light' ? 'DARK' : 'LIGHT' }); // plugin names the style by the text colour it expects under
        if (o.overlay != null) await call('StatusBar', 'setOverlaysWebView', { overlay: Boolean(o.overlay) });
      } else if (o.color) {
        let m = document.querySelector('meta[name="theme-color"]');
        if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
        m.content = o.color;
      }
    },
    hideSplash() { return call('SplashScreen', 'hide', { fadeOutDuration: 200 }); },
  };

  /* ------------------------------------------------------------ positioning (GPS) */
  const position = {
    async get(opts = {}) {
      const native = await call('Geolocation', 'getCurrentPosition', { enableHighAccuracy: opts.accurate !== false });
      if (native) return native;
      if (!global.navigator || !navigator.geolocation) return null;
      return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
        (p) => resolve({ timestamp: p.timestamp, coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, altitude: p.coords.altitude, speed: p.coords.speed, heading: p.coords.heading } }),
        () => resolve(null), { enableHighAccuracy: opts.accurate !== false, timeout: opts.timeout || 15000 }));
    },
    // watch(fn) calls fn(position) on every move and returns a function that stops it
    watch(fn, opts = {}) {
      if (isNative()) {
        let id = null, stopped = false;
        call('Geolocation', 'watchPosition', { enableHighAccuracy: opts.accurate !== false }).then((r) => { id = r; if (stopped) call('Geolocation', 'clearWatch', { id }); });
        const off = listen('Geolocation', 'watchPosition', fn);
        return () => { stopped = true; off(); if (id) call('Geolocation', 'clearWatch', { id }); };
      }
      if (!global.navigator || !navigator.geolocation) return () => {};
      const id = navigator.geolocation.watchPosition((p) => fn({ timestamp: p.timestamp, coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy } }), () => {}, { enableHighAccuracy: opts.accurate !== false });
      return () => navigator.geolocation.clearWatch(id);
    },
  };

  /* ------------------------------------------------------------ events and the back button */
  const backStack = []; // the topmost handler gets the back button first (a sheet closes before the page goes back)
  const handlers = {};
  const web = { // events a browser has too
    pause: (fn) => { const f = () => { if (document.hidden) fn(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); },
    resume: (fn) => { const f = () => { if (!document.hidden) fn(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); },
    network: (fn) => { const f = () => system.network().then(fn); global.addEventListener('online', f); global.addEventListener('offline', f); return () => { global.removeEventListener('online', f); global.removeEventListener('offline', f); }; },
  };
  const nativeEvent = { pause: ['App', 'pause'], resume: ['App', 'resume'], network: ['Network', 'networkStatusChange'], urlOpen: ['App', 'appUrlOpen'], keyboardShow: ['Keyboard', 'keyboardWillShow'], keyboardHide: ['Keyboard', 'keyboardWillHide'] };
  // on('resume' | 'pause' | 'network' | 'urlOpen' | 'keyboardShow' | 'keyboardHide', fn) → a function that stops listening
  function on(event, fn) {
    if (isNative() && nativeEvent[event]) return listen(nativeEvent[event][0], nativeEvent[event][1], fn);
    if (web[event]) return web[event](fn);
    (handlers[event] = handlers[event] || []).push(fn);
    return () => { handlers[event] = (handlers[event] || []).filter((f) => f !== fn); };
  }
  const emit = (event, data) => (handlers[event] || []).slice().forEach((f) => { try { f(data); } catch (e) { if (global.console) console.error(e); } });
  // pushBack(fn): fn() runs when the back button is pressed; return false to let the next one (or the page) go back. Returns a remover.
  function pushBack(fn) { backStack.push(fn); return () => { const i = backStack.lastIndexOf(fn); if (i >= 0) backStack.splice(i, 1); }; }
  function handleBack() {
    for (let i = backStack.length - 1; i >= 0; i--) { if (backStack[i]() !== false) return true; }
    const r = K.currentRouter && K.currentRouter();
    const atRoot = !global.history || global.history.length <= 1 || (r && r.route && r.route.path === '/');
    if (atRoot) { system.exit(); return false; }
    global.history.back();
    return true;
  }

  /* ------------------------------------------------------------ dialogs (look the same everywhere, themed by edge.css) */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (tag === 'button' || tag === 'input') e.setAttribute('data-edge', ''); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function layer(cls) { const root = el('div', 'edge-layer ' + cls); document.body.appendChild(root); requestAnimationFrame(() => root.classList.add('on')); return root; }
  function closeLayer(root, after) { root.classList.remove('on'); setTimeout(() => { root.remove(); if (after) after(); }, 180); }
  function modal(build) {
    return new Promise((resolve) => {
      const root = layer('edge-dialog-layer');
      const box = el('div', 'edge-dialog'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      const off = pushBack(() => { done(null); return true; });
      let finished = false;
      function done(v) { if (finished) return; finished = true; off(); document.removeEventListener('keydown', key); closeLayer(root, () => resolve(v)); }
      function key(e) { if (e.key === 'Escape') done(null); }
      document.addEventListener('keydown', key);
      root.addEventListener('click', (e) => { if (e.target === root) done(null); });
      build(box, done);
      root.appendChild(box);
      const first = box.querySelector('input,button.primary,button'); if (first) setTimeout(() => first.focus(), 30);
    });
  }
  const buttons = (box, done, list) => { const row = el('div', 'edge-dialog-actions'); list.forEach((b) => { const bt = el('button', 'edge-dialog-btn ' + (b.cls || ''), b.label); bt.type = 'button'; bt.addEventListener('click', () => done(b.value())); row.appendChild(bt); }); box.appendChild(row); };
  const dialog = {
    alert(message, o = {}) { return modal((box, done) => { if (o.title) box.appendChild(el('h3', 'edge-dialog-title', o.title)); box.appendChild(el('p', 'edge-dialog-text', message)); buttons(box, done, [{ label: o.button || 'OK', cls: 'primary', value: () => true }]); }).then(() => undefined); },
    confirm(message, o = {}) { return modal((box, done) => { if (o.title) box.appendChild(el('h3', 'edge-dialog-title', o.title)); box.appendChild(el('p', 'edge-dialog-text', message)); buttons(box, done, [{ label: o.cancel || 'Cancel', value: () => false }, { label: o.ok || 'OK', cls: 'primary' + (o.danger ? ' danger' : ''), value: () => true }]); }).then((v) => v === true); },
    prompt(message, o = {}) { return modal((box, done) => { if (o.title) box.appendChild(el('h3', 'edge-dialog-title', o.title)); box.appendChild(el('p', 'edge-dialog-text', message)); const input = el('input', 'edge-dialog-input'); input.value = o.value || ''; input.placeholder = o.placeholder || ''; input.type = o.type || 'text'; input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); }); box.appendChild(input); buttons(box, done, [{ label: o.cancel || 'Cancel', value: () => null }, { label: o.ok || 'OK', cls: 'primary', value: () => input.value }]); }); },
    // actionSheet({ title, options: [{ label, value, danger }], cancel: 'Cancel' }) → the chosen value, or null
    actionSheet(o = {}) {
      return new Promise((resolve) => {
        const root = layer('edge-sheet-layer');
        const box = el('div', 'edge-action-sheet'); box.setAttribute('role', 'dialog');
        let finished = false;
        const off = pushBack(() => { done(null); return true; });
        function done(v) { if (finished) return; finished = true; off(); closeLayer(root, () => resolve(v)); }
        if (o.title) box.appendChild(el('p', 'edge-sheet-title', o.title));
        (o.options || []).forEach((opt) => { const label = typeof opt === 'string' ? opt : opt.label; const value = typeof opt === 'string' ? opt : (opt.value !== undefined ? opt.value : opt.label); const b = el('button', 'edge-sheet-btn' + (opt.danger ? ' danger' : ''), label); b.type = 'button'; b.addEventListener('click', () => done(value)); box.appendChild(b); });
        const c = el('button', 'edge-sheet-btn cancel', o.cancel || 'Cancel'); c.type = 'button'; c.addEventListener('click', () => done(null)); box.appendChild(c);
        root.addEventListener('click', (e) => { if (e.target === root) done(null); });
        root.appendChild(box);
      });
    },
    toast(message, o = {}) {
      let host = document.querySelector('.edge-toasts');
      if (!host) { host = el('div', 'edge-toasts'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
      host.classList.toggle('top', o.position === 'top');
      const t = el('div', 'edge-toast ' + (o.tone || ''), message);
      host.appendChild(t);
      requestAnimationFrame(() => t.classList.add('on'));
      setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 200); }, o.duration || 2500);
    },
  };

  /* ------------------------------------------------------------ safe area, assets */
  function safeArea() {
    const probe = el('div', 'edge-safe-probe');
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const n = (v) => parseFloat(v) || 0;
    const r = { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
    probe.remove();
    const root = document.documentElement.style;
    ['top', 'right', 'bottom', 'left'].forEach((k) => root.setProperty('--edge-safe-' + k, r[k] + 'px'));
    return r;
  }
  const asset = (p) => { try { return new URL(String(p).replace(/^\//, ''), document.baseURI).href; } catch (_) { return p; } };

  /* ------------------------------------------------------------ icons */
  // 24x24 outline paths. Add your own: Kreftjs.edgeIcons.add('logo', 'M2 2h20v20H2z')
  const paths = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
    users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-5 7-5s7 1.5 7 5M17 4.5a3.5 3.5 0 010 7M18 15c2.5.5 4 2 4 5',
    settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4', menu: 'M4 6h16M4 12h16M4 18h16', back: 'M19 12H5M11 6l-6 6 6 6', close: 'M6 6l12 12M18 6L6 18',
    plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', check: 'M5 12l5 5 9-10', 'chevron-right': 'M9 6l6 6-6 6', 'chevron-left': 'M15 6l-6 6 6 6', 'chevron-down': 'M6 9l6 6 6-6', 'chevron-up': 'M6 15l6-6 6 6',
    bell: 'M6 17v-6a6 6 0 1112 0v6l2 2H4zM10 21a2 2 0 004 0', heart: 'M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', list: 'M8 6h12M8 12h12M8 18h12M4 6h0M4 12h0M4 18h0',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5h0', warning: 'M12 3l10 18H2zM12 10v5M12 18h0', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
    share: 'M12 15V3M7 8l5-5 5 5M5 13v7h14v-7', camera: 'M4 8h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z', mail: 'M3 6h18v12H3zM3 7l9 7 9-7', lock: 'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', download: 'M12 3v12M7 10l5 5 5-5M5 21h14', upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
    refresh: 'M20 11a8 8 0 10-2 5.5M20 4v7h-7', more: 'M5 12h0M12 12h0M19 12h0', bookmark: 'M6 3h12v18l-6-4-6 4z', calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
    pin: 'M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h0', file: 'M6 3h8l4 4v14H6zM14 3v4h4', folder: 'M3 6h7l2 2h9v11H3z',
    wifi: 'M2 9a15 15 0 0120 0M5 13a10 10 0 0114 0M8.5 16.5a5 5 0 017 0M12 20h0', battery: 'M3 8h16v8H3zM21 11v2M6 11v2',
    sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5', moon: 'M20 14A8 8 0 0110 4a8 8 0 1010 10z',
    logout: 'M10 4H4v16h6M15 8l4 4-4 4M19 12H9', navigation: 'M3 11l18-8-8 18-2-8z', copy: 'M8 8h12v12H8zM4 16V4h12', link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
    play: 'M7 4l13 8-13 8z', pause: 'M7 4h4v16H7zM13 4h4v16h-4z', cart: 'M3 4h3l3 12h10l2-8H7M10 20h0M18 20h0', chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3', book: 'M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4zM9 8h6',
    phone: 'M7 3h10v18H7zM11 18h2', code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  };
  K.edgeIcons = { paths, add(name, d) { paths[name] = d; }, has: (n) => Object.prototype.hasOwnProperty.call(paths, n) };

  /* ------------------------------------------------------------ the edge store: the top bar and the bottom bar */
  // Change it anywhere: edge.setTop({ title: 'Cart', bg: '#111', color: '#fff' })   edge.setBottom({ labels: 'never' })   edge.reset()
  const defaults = () => ({
    top: { show: true, title: '', subtitle: '', back: 'auto', bg: '', color: '', border: true, height: 0, center: false, elevated: false, left: [], right: [], blur: false },
    bottom: { show: true, items: [], bg: '', color: '', active: '', indicator: 'pill', labels: 'always', border: true, height: 0, floating: false, blur: false, haptics: true },
  });
  const edge = K.store('edge', {
    ...defaults(),
    setTop(o) { Object.assign(this.top, o || {}); },
    setBottom(o) { Object.assign(this.bottom, o || {}); },
    reset() { const d = defaults(); Object.assign(this.top, d.top); Object.assign(this.bottom, { ...d.bottom, items: this.bottom.items }); },
    hideBars() { this.top.show = false; this.bottom.show = false; },
    showBars() { this.top.show = true; this.bottom.show = true; },
  });

  /* ------------------------------------------------------------ the animated splash screen */
  // The native splash (made by kreft mobile:splash) covers the first moment only. As soon as the animated #edge-splash from index.html is painted
  // under it, the native one fades away (both have the same background, so there is no flash) and the animation plays. The animated one goes by
  // itself once the app is on the screen and minTime has passed. Change it before that:
  //   Kreftjs.native.splash.set({ minTime: 1500, anim: 'zoom' })     Kreftjs.native.splash.hide()
  let hiding = null;
  const splash = {
    config: { minTime: 900, anim: '' }, // minTime: how long the animation plays at least, counted from when it appears
    set(o) { Object.assign(splash.config, o || {}); const e = document.getElementById('edge-splash'); if (e && splash.config.anim) e.setAttribute('data-anim', splash.config.anim); },
    hide() {
      if (hiding) return hiding;
      hiding = new Promise((resolve) => {
        system.hideSplash();
        const e = document.getElementById('edge-splash');
        if (!e) return resolve();
        e.classList.add('leaving');
        setTimeout(() => { e.remove(); resolve(); }, 380);
      });
      return hiding;
    },
  };
  function autoSplash() {
    const e = document.getElementById('edge-splash');
    if (!e) return;
    if (platform() === 'web' && e.getAttribute('data-web') !== 'true') { e.remove(); return; } // a browser needs no splash
    const name = e.querySelector('.edge-splash-name');
    if (name) name.textContent = (K.env && K.env.PUBLIC_APP_NAME) || '';
    // two frames later the animated splash is on the screen: now the native one may go, and the animation's minimum time starts
    const now = () => (global.performance ? performance.now() : Date.now());
    let shownAt = 0;
    const reveal = () => { shownAt = now(); system.hideSplash(); };
    if (global.requestAnimationFrame) requestAnimationFrame(() => requestAnimationFrame(reveal)); else reveal();
    const check = () => {
      const app = document.getElementById('app');
      if ((app && app.children.length > 0 && shownAt && now() - shownAt >= splash.config.minTime) || now() > 8000) splash.hide(); // never stuck: gone after 8 seconds
      else setTimeout(check, 60);
    };
    if (document.readyState === 'complete') check(); else global.addEventListener('load', () => setTimeout(check, 0));
  }

  /* ------------------------------------------------------------ start */
  const N = { platform, isNative, isDesktop: system.isDesktop, isWeb: system.isWeb, plugin: call, device, haptics, file, system, splash, position, dialog, on, emit, pushBack, back: handleBack, safeArea, asset, edge };
  K.native = N;

  function start() {
    document.documentElement.classList.add('platform-' + platform());
    safeArea();
    global.addEventListener('resize', safeArea);
    global.addEventListener('orientationchange', () => setTimeout(safeArea, 200));
    if (isNative()) listen('App', 'backButton', handleBack); // the Android back button: close a sheet first, then go back, then leave the app
    autoSplash();
    // a phone app ships its own files; a service worker left by an older build would keep serving old ones
    if (isNative() && global.navigator && navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      if (global.caches && caches.keys) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
