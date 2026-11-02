/*!
 * Som.js v3.0.0 — reactive by nature
 * The .som component language (state · derive · action · when · watch · on),
 * { } views with s-if / s-each / s-model, components, slots, router, stores,
 * share / receive, event bus and a template engine.
 * One file, no build step, no virtual DOM. MIT License.
 */
(function (global) {
  'use strict';

  /* ================================================================
   * Utils
   * ================================================================ */
  const isArray = Array.isArray;
  const isObject = (v) => v !== null && typeof v === 'object';
  const isFunction = (v) => typeof v === 'function';
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const camelize = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const hyphenate = (s) => s.replace(/\B([A-Z])/g, '-$1').toLowerCase();
  // HTML lower-cases tag and attribute names, so names are compared case- and hyphen-insensitively.
  const normKey = (s) => String(s).toLowerCase().replace(/-/g, '');
  const warn = (...a) => console.warn('[Som warn]', ...a);
  const safeCall = (fn, ctx) => {
    try {
      const r = fn.call(ctx);
      if (r && typeof r.then === 'function') r.then(null, (e) => console.error('[Som error]', e));
      return r;
    } catch (e) { console.error('[Som error]', e); }
  };
  const text = () => document.createTextNode('');
  // `som dev` turns this on: live components are tracked for hot reload and the DevTools panel
  const devMode = () => !!global.__SOM_DEV__;
  const liveInstances = new Set();
  const BAD_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const getPath = (obj, path) => String(path).split('.').reduce((o, k) => (o == null || BAD_PATH_KEYS.has(k) ? undefined : o[k]), obj);
  const looseEqual = (a, b) => {
    if (Object.is(a, b)) return true;
    if (isObject(a) && isObject(b)) {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
    }
    return !isObject(a) && !isObject(b) && String(a) === String(b);
  };

  /* ================================================================
   * Reactivity: effects, dependency tracking, reactive, ref, computed
   * ================================================================ */
  let activeEffect = null;
  let activeScope = null;
  let shouldTrack = true;
  const trackStack = [];
  function pauseTracking() { trackStack.push(shouldTrack); shouldTrack = false; }
  function resetTracking() { const last = trackStack.pop(); shouldTrack = last === undefined ? true : last; }

  let effectUid = 0;
  class ReactiveEffect {
    constructor(fn, scheduler) {
      this.id = effectUid++;
      this.fn = fn;
      this.scheduler = scheduler;
      this.deps = [];
      this.active = true;
      this.scope = activeScope;
      if (activeScope && activeScope.active) activeScope.effects.push(this);
    }
    run() {
      if (!this.active) return this.fn();
      const prevEffect = activeEffect, prevTrack = shouldTrack, prevScope = activeScope;
      cleanupEffect(this); // dependencies are re-collected on every run
      activeEffect = this;
      shouldTrack = true;
      activeScope = this.scope;
      try { return this.fn(); }
      finally { activeEffect = prevEffect; shouldTrack = prevTrack; activeScope = prevScope; }
    }
    stop() {
      if (this.active) { cleanupEffect(this); this.active = false; }
    }
  }
  function cleanupEffect(e) {
    e.deps.forEach((dep) => dep.delete(e));
    e.deps.length = 0;
  }

  const targetMap = new WeakMap(); // target -> Map(key -> Set<effect>)
  const ITERATE_KEY = Symbol('iterate');

  function track(target, key) {
    if (!shouldTrack || !activeEffect) return;
    let depsMap = targetMap.get(target);
    if (!depsMap) targetMap.set(target, (depsMap = new Map()));
    let dep = depsMap.get(key);
    if (!dep) depsMap.set(key, (dep = new Set()));
    trackDep(dep);
  }
  function trackDep(dep) {
    if (!shouldTrack || !activeEffect || dep.has(activeEffect)) return;
    dep.add(activeEffect);
    activeEffect.deps.push(dep);
  }
  function trigger(target, key, type) {
    const depsMap = targetMap.get(target);
    if (!depsMap) return;
    const effects = new Set();
    const add = (dep) => dep && dep.forEach((e) => effects.add(e));
    add(depsMap.get(key));
    if (type === 'add' || type === 'delete') add(depsMap.get(isArray(target) ? 'length' : ITERATE_KEY));
    if (isArray(target) && key === 'length') {
      depsMap.forEach((dep, k) => { if (typeof k === 'string' && /^\d+$/.test(k) && +k >= target.length) add(dep); });
    }
    triggerEffects(effects);
  }
  function triggerEffects(dep) {
    [...dep].forEach((e) => {
      if (e === activeEffect) return; // an effect never re-triggers itself
      e.scheduler ? e.scheduler() : e.run();
    });
  }

  const RAW = '__v_raw', IS_REACTIVE = '__v_isReactive', SKIP = '__v_skip';
  const reactiveMap = new WeakMap();

  // Array methods that need special handling
  const arrayInstrumentations = {};
  ['includes', 'indexOf', 'lastIndexOf'].forEach((m) => {
    arrayInstrumentations[m] = function (...args) {
      const arr = toRaw(this);
      track(arr, 'length');
      for (let i = 0; i < arr.length; i++) track(arr, String(i));
      const res = arr[m](...args);
      return res === -1 || res === false ? arr[m](...args.map(toRaw)) : res;
    };
  });
  ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].forEach((m) => {
    arrayInstrumentations[m] = function (...args) {
      pauseTracking(); // mutating methods read length; don't let the caller depend on it
      try { return Array.prototype[m].apply(this, args); } finally { resetTracking(); }
    };
  });

  const reactiveHandlers = {
    get(target, key, receiver) {
      if (key === IS_REACTIVE) return true;
      if (key === RAW) return target;
      if (isArray(target) && hasOwn(arrayInstrumentations, key)) return arrayInstrumentations[key];
      const res = Reflect.get(target, key, receiver);
      if (typeof key === 'symbol') return res;
      track(target, key);
      if (isRef(res)) return isArray(target) ? res : res.value; // auto-unwrap refs in objects
      return isObject(res) ? reactive(res) : res; // lazy deep reactivity
    },
    set(target, key, value, receiver) {
      const old = target[key];
      value = toRaw(value);
      if (!isArray(target) && isRef(old) && !isRef(value)) { old.value = value; return true; }
      const hadKey = isArray(target) && /^\d+$/.test(key) ? Number(key) < target.length : hasOwn(target, key);
      const result = Reflect.set(target, key, value, receiver);
      if (target === toRaw(receiver)) {
        if (!hadKey) trigger(target, key, 'add');
        else if (!Object.is(old, value)) trigger(target, key, 'set');
      }
      return result;
    },
    deleteProperty(target, key) {
      const hadKey = hasOwn(target, key);
      const result = Reflect.deleteProperty(target, key);
      if (hadKey && result) trigger(target, key, 'delete');
      return result;
    },
    has(target, key) {
      const result = Reflect.has(target, key);
      if (typeof key !== 'symbol') track(target, key);
      return result;
    },
    ownKeys(target) {
      track(target, isArray(target) ? 'length' : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
  };

  function reactive(target) {
    if (!isObject(target) || target[IS_REACTIVE] || target[SKIP]) return target;
    const tag = Object.prototype.toString.call(target);
    if (tag !== '[object Object]' && tag !== '[object Array]') return target; // DOM nodes, Dates, Maps…
    const existing = reactiveMap.get(target);
    if (existing) return existing;
    const proxy = new Proxy(target, reactiveHandlers);
    reactiveMap.set(target, proxy);
    return proxy;
  }
  function readonly(target) {
    if (!isObject(target)) return target;
    return new Proxy(target, {
      get(t, k, r) {
        const v = Reflect.get(t, k, r);
        return isObject(v) && typeof k !== 'symbol' && k !== RAW ? readonly(v) : v;
      },
      set(_, k) { warn(`Set operation on key "${String(k)}" failed: target is readonly.`); return true; },
      deleteProperty(_, k) { warn(`Delete operation on key "${String(k)}" failed: target is readonly.`); return true; },
    });
  }
  function shallowReadonly(target) {
    return new Proxy(target, {
      set(_, k) { warn(`Attempting to mutate prop "${String(k)}". Props are readonly.`); return true; },
      deleteProperty() { return true; },
    });
  }
  function toRaw(o) {
    const raw = o && o[RAW];
    return raw ? toRaw(raw) : o;
  }
  const isReactive = (o) => !!(o && o[IS_REACTIVE]);
  function markRaw(o) { Object.defineProperty(o, SKIP, { value: true, configurable: true }); return o; }

  class RefImpl {
    constructor(value, shallow) {
      this.__v_isRef = true;
      this.dep = new Set();
      this._shallow = shallow;
      this._raw = toRaw(value);
      this._value = shallow ? value : reactive(value);
    }
    get value() { trackDep(this.dep); return this._value; }
    set value(v) {
      const raw = toRaw(v);
      if (Object.is(raw, this._raw)) return;
      this._raw = raw;
      this._value = this._shallow ? v : reactive(v);
      triggerEffects(this.dep);
    }
  }
  class ObjectRefImpl {
    constructor(obj, key, def) { this.__v_isRef = true; this._obj = obj; this._key = key; this._def = def; }
    get value() { const v = this._obj[this._key]; return v === undefined ? this._def : v; }
    set value(v) { this._obj[this._key] = v; }
  }
  const isRef = (r) => !!(r && r.__v_isRef === true);
  const ref = (v) => (isRef(v) ? v : new RefImpl(v, false));
  const shallowRef = (v) => (isRef(v) ? v : new RefImpl(v, true));
  const unref = (r) => (isRef(r) ? r.value : r);
  const toValue = (v) => (isFunction(v) ? v() : unref(v));
  const toRef = (obj, key, def) => (isRef(obj) ? obj : isFunction(obj) ? { __v_isRef: true, get value() { return obj(); } } : key === undefined ? ref(obj) : new ObjectRefImpl(obj, key, def));
  function toRefs(obj) {
    const out = isArray(obj) ? new Array(obj.length) : {};
    for (const k in obj) out[k] = new ObjectRefImpl(obj, k);
    return out;
  }
  const triggerRef = (r) => triggerEffects(r.dep);

  class ComputedRefImpl {
    constructor(getter, setter) {
      this.__v_isRef = true;
      this.dep = new Set();
      this._dirty = true;
      this._setter = setter;
      this.effect = new ReactiveEffect(getter, () => {
        if (!this._dirty) { this._dirty = true; triggerEffects(this.dep); }
      });
    }
    get value() {
      trackDep(this.dep);
      if (this._dirty) { this._value = this.effect.run(); this._dirty = false; }
      return this._value;
    }
    set value(v) {
      this._setter ? this._setter(v) : warn('Write operation failed: computed value is readonly.');
    }
  }
  const computed = (opt) => (isFunction(opt) ? new ComputedRefImpl(opt) : new ComputedRefImpl(opt.get, opt.set));

  /* ================================================================
   * Effect scopes — everything created inside a block / component is
   * stopped together when that block or component goes away.
   * ================================================================ */
  class EffectScope {
    constructor(detached) {
      this.active = true;
      this.effects = [];
      this.cleanups = [];
      this.beforeStops = [];
      this.children = new Set();
      this.parent = detached ? null : activeScope;
      if (this.parent) this.parent.children.add(this);
    }
    run(fn) {
      const prev = activeScope;
      activeScope = this;
      try { return fn(); } finally { activeScope = prev; }
    }
    stop() {
      if (!this.active) return;
      this.active = false;
      this.beforeStops.forEach((f) => safeCall(f));
      this.children.forEach((c) => c.stop());
      this.effects.forEach((e) => e.stop());
      this.cleanups.forEach((f) => safeCall(f));
      if (this.parent) this.parent.children.delete(this);
    }
  }
  const effectScope = (detached) => new EffectScope(detached);
  const onScopeDispose = (fn) => { if (activeScope) activeScope.cleanups.push(fn); };

  /* ================================================================
   * Scheduler — batches updates into one microtask, parents first
   * ================================================================ */
  const queue = [];
  const postQueue = [];
  const resolved = Promise.resolve();
  const resolvedPromise = resolved;
  let flushPending = false;
  let currentFlush = null;

  function queueFlush() {
    if (!flushPending) { flushPending = true; currentFlush = resolved.then(flushJobs); }
  }
  // `queued` marks a job already waiting, so adding one is O(1) even with thousands of rows
  function queueJob(job) {
    if (!job.queued) { job.queued = true; queue.push(job); }
    queueFlush();
  }
  // A job tied to a node waits until that node is on the page (ready hooks, directive ready);
  // if the node's block is removed before that, the job is dropped.
  function queuePostJob(fn, node) {
    postQueue.push({ fn, node, scope: node ? activeScope : null });
    queueFlush();
  }
  function flushJobs() {
    const counts = new Map();
    try {
      while (queue.length) {
        queue.sort((a, b) => a.id - b.id);
        const jobs = queue.splice(0);
        for (const job of jobs) {
          job.queued = false;
          if (job.active === false) continue;
          const c = (counts.get(job) || 0) + 1;
          counts.set(job, c);
          if (c > 100) { warn('Maximum recursive updates exceeded.'); continue; }
          try { job.run(); } catch (e) { console.error('[Som error]', e); }
        }
      }
    } finally {
      queue.forEach((job) => { job.queued = false; }); // left over after an error
      queue.length = 0;
      flushPending = false;
      currentFlush = null;
    }
    flushPostJobs();
  }
  function flushPostJobs() {
    let ran = true;
    while (ran) {
      ran = false;
      const jobs = postQueue.splice(0);
      for (const job of jobs) {
        if (job.scope && !job.scope.active) continue; // removed before it ever appeared
        if (job.node && !job.node.isConnected) { postQueue.push(job); continue; } // not on the page yet
        ran = true;
        safeCall(job.fn);
      }
    }
  }
  const nextTick = (fn) => { const p = currentFlush || resolved; return fn ? p.then(fn) : p; };

  // Low-level synchronous effect (internal)
  function effect(fn, options = {}) {
    const e = new ReactiveEffect(fn, options.scheduler);
    if (!options.lazy) e.run();
    const runner = e.run.bind(e);
    runner.effect = e;
    return runner;
  }
  // DOM effect: runs now, then re-runs batched on the next tick
  // s-once: inside it, views are drawn once and never update.
  // s-memo="[a, b]": inside it, updates wait until a or b changes (the gate).
  // renderOwner: the component whose view is being built, for its `on update` hooks.
  let onceDepth = 0, memoGate = null, renderOwner = null;
  function renderEffect(fn) {
    if (onceDepth) {
      pauseTracking();
      try { fn(); } finally { resetTracking(); }
      return null;
    }
    const gate = memoGate, owner = renderOwner;
    const e = new ReactiveEffect(fn, () => {
      if (gate) return void gate.dirty.add(e);
      queueJob(e);
      if (owner) markUpdated(owner);
    });
    e.run();
    return e;
  }
  // `on update` runs once after a batch of changes reached the component's view
  function markUpdated(inst) {
    if (inst.updateQueued || !inst.isMounted || !inst.hooks.update.length) return;
    inst.updateQueued = true;
    queuePostJob(() => {
      inst.updateQueued = false;
      if (inst.scope.active) inst.scope.run(() => inst.hooks.update.forEach((h) => safeCall(h, inst.ctx)));
    });
  }
  const sameList = (a, b) => isArray(a) && isArray(b) ? a.length === b.length && a.every((v, i) => Object.is(v, b[i])) : Object.is(a, b);
  function compileMemo(el, scope, inst) {
    const expr = stripBrace(el.getAttribute('s-memo')) || '[]';
    el.removeAttribute('s-memo');
    const gate = { dirty: new Set() };
    let last;
    const check = { id: 0, run() {
      if (!deps.active) return;
      const now = deps.run();
      if (sameList(now, last)) return;
      last = now;
      gate.dirty.forEach((job) => { if (job.active) { queueJob(job); if (inst) markUpdated(inst); } });
      gate.dirty.clear();
    } };
    const deps = new ReactiveEffect(() => evaluate(scope, expr, el), () => queueJob(check));
    check.id = deps.id; // made before the effects it lets through, so it is checked first
    last = deps.run();
    const prev = memoGate;
    memoGate = gate;
    try { compile(el, scope, inst); } finally { memoGate = prev; }
  }

  /* ================================================================
   * watch / watchEffect
   * ================================================================ */
  function traverse(v, seen = new Set()) {
    if (!isObject(v) || seen.has(v)) return v;
    seen.add(v);
    if (isRef(v)) traverse(v.value, seen);
    else if (isArray(v)) v.forEach((x) => traverse(x, seen));
    else for (const k in v) traverse(v[k], seen);
    return v;
  }
  function doWatch(source, cb, { immediate, deep, flush = 'pre' } = {}) {
    let getter, multi = false, cleanup;
    const onCleanup = (fn) => { cleanup = fn; };
    if (isRef(source)) getter = () => source.value;
    else if (isReactive(source)) { getter = () => source; if (deep === undefined) deep = true; }
    else if (isArray(source)) {
      multi = true;
      getter = () => source.map((s) => (isRef(s) ? s.value : isReactive(s) ? traverse(s) : isFunction(s) ? s() : s));
    } else if (isFunction(source)) {
      getter = cb ? source : () => { if (cleanup) cleanup(); return source(onCleanup); };
    } else { warn('Invalid watch source:', source); getter = () => {}; }
    if (cb && deep) { const base = getter; getter = () => traverse(base()); }

    let oldValue;
    const job = () => {
      if (!e.active) return;
      if (!cb) return e.run();
      const nv = e.run();
      const changed = deep || (multi ? nv.some((v, i) => !Object.is(v, oldValue[i])) : !Object.is(nv, oldValue));
      if (changed) {
        if (cleanup) cleanup();
        try { cb(nv, oldValue, onCleanup); } catch (err) { console.error('[Som error] in watcher callback', err); }
        oldValue = nv;
      }
    };
    const runner = { id: 0, run: job, get active() { return e.active; } };
    const e = new ReactiveEffect(getter, () =>
      flush === 'sync' ? job() : flush === 'post' ? queuePostJob(job) : queueJob(runner)
    );
    runner.id = e.id;
    if (cb) {
      if (immediate) { const nv = e.run(); cb(nv, multi ? [] : undefined, onCleanup); oldValue = nv; }
      else oldValue = e.run();
    } else if (flush === 'post') queuePostJob(() => e.run());
    else e.run();
    return () => e.stop();
  }
  const watch = (source, cb, options) => doWatch(source, cb, options);
  const watchEffect = (fn, options) => doWatch(fn, null, options);

  /* ================================================================
   * Localization (i18n & l10n)
   * ================================================================ */
  const RTL_LOCALES = new Set(['ar', 'fa', 'ur', 'he', 'yi', 'ps', 'sd', 'ug', 'ckb', 'ku', 'dv', 'arc', 'syr']);
  const BAD_I18N_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  function isRtlLocale(loc) {
    if (!loc) return false;
    const lang = String(loc).toLowerCase().split(/[-_]/)[0];
    return RTL_LOCALES.has(lang);
  }

  function parseChoice(text, count, locale = 'en') {
    if (!text || typeof text !== 'string') return '';
    const n = Number(count) || 0;
    const segments = text.split('|').map((s) => s.trim());

    for (const seg of segments) {
      const exactMatch = seg.match(/^\{(\d+)\}\s*(.*)$/s);
      if (exactMatch) {
        if (Number(exactMatch[1]) === n) return exactMatch[2];
        continue;
      }
      const rangeMatch = seg.match(/^\[(\d+|\*)\s*,\s*(\d+|\*)\]\s*(.*)$/s);
      if (rangeMatch) {
        const min = rangeMatch[1] === '*' ? -Infinity : Number(rangeMatch[1]);
        const max = rangeMatch[2] === '*' ? Infinity : Number(rangeMatch[2]);
        if (n >= min && n <= max) return rangeMatch[3];
        continue;
      }
      const categoryMatch = seg.match(/^\{(zero|one|two|few|many|other)\}\s*(.*)$/is);
      if (categoryMatch) {
        let pr;
        try { pr = new Intl.PluralRules(locale).select(n); } catch (_) { pr = n === 1 ? 'one' : 'other'; }
        if (categoryMatch[1].toLowerCase() === pr) return categoryMatch[2];
        continue;
      }
    }

    if (segments.length === 2) {
      return n === 1 ? segments[0] : segments[1];
    }

    if (segments.length > 2) {
      let pr = 'other';
      try { pr = new Intl.PluralRules(locale).select(n); } catch (_) { pr = n === 1 ? 'one' : 'other'; }
      const cats = ['zero', 'one', 'two', 'few', 'many', 'other'];
      const idx = cats.indexOf(pr);
      if (idx !== -1 && idx < segments.length) return segments[idx];
      return segments[segments.length - 1];
    }

    return segments[0] || text;
  }

  function deepMergeDict(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const [k, v] of Object.entries(source)) {
      if (BAD_I18N_KEYS.has(k)) continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {};
        deepMergeDict(target[k], v);
      } else {
        target[k] = v;
      }
    }
    return target;
  }

  const initialDocLang = (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'en';
  const currentLocaleRef = ref(initialDocLang.toLowerCase());
  const fallbackLocaleRef = ref('en');
  const translationsStore = reactive({});

  function setDocAttributes(l) {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = l;
      const d = isRtlLocale(l) ? 'rtl' : 'ltr';
      document.documentElement.dir = d;
      document.documentElement.setAttribute('dir', d);
    }
  }

  function getLocale(lang) {
    if (lang === undefined) return currentLocaleRef.value;
    const clean = String(lang).toLowerCase().trim();
    if (clean && currentLocaleRef.value !== clean) {
      currentLocaleRef.value = clean;
      setDocAttributes(clean);
    }
    return clean;
  }

  function getFallbackLocale(lang) {
    if (lang === undefined) return fallbackLocaleRef.value;
    const clean = String(lang).toLowerCase().trim();
    if (clean) fallbackLocaleRef.value = clean;
    return clean;
  }

  // adds translations; it must not touch `Som`, because the page's own text (window.__SOM_LANG__) is added
  // while this file is still loading, before `Som` exists
  function addTranslations(localeOrDict, dict) {
    if (!dict && localeOrDict && typeof localeOrDict === 'object') {
      for (const [l, d] of Object.entries(localeOrDict)) addTranslations(l, d);
      return;
    }
    if (!localeOrDict) return;
    const loc = String(localeOrDict).toLowerCase().trim();
    if (!translationsStore[loc]) translationsStore[loc] = {};
    deepMergeDict(translationsStore[loc], dict);
  }
  function registerTranslations(localeOrDict, dict) {
    addTranslations(localeOrDict, dict);
    return Som;
  }

  function listLocales() {
    return Object.keys(translationsStore);
  }

  function replacePlaceholders(line, replace = {}) {
    if (typeof line !== 'string') return line;
    if (!replace || typeof replace !== 'object') return line;
    let out = line;
    for (const [key, value] of Object.entries(replace)) {
      if (value == null) continue;
      const strVal = String(value);
      const upperKey = key.toUpperCase();
      const upperVal = strVal.toUpperCase();
      const ucfirstKey = key.charAt(0).toUpperCase() + key.slice(1);
      const ucfirstVal = strVal.charAt(0).toUpperCase() + strVal.slice(1);

      out = out
        .split(':' + key).join(strVal)
        .split(':' + upperKey).join(upperVal)
        .split(':' + ucfirstKey).join(ucfirstVal);
    }
    return out;
  }

  function getTranslation(key, replace = {}, locale = currentLocaleRef.value) {
    const loc = String(locale || currentLocaleRef.value).toLowerCase();
    const fallback = String(fallbackLocaleRef.value).toLowerCase();
    const strKey = String(key || '');

    const lookup = (storeLoc, k) => {
      const dict = translationsStore[storeLoc];
      if (!dict || typeof dict !== 'object') return undefined;
      // 1. Direct exact key match (JSON translation strings, e.g. __('Sign In') or __('auth.failed'))
      if (dict[k] !== undefined && !BAD_I18N_KEYS.has(k)) return dict[k];
      // 2. Group and nested dot path match: 'auth.failed' -> dict['auth']['failed']
      const parts = k.split('.');
      let cur = dict;
      for (const p of parts) {
        if (!p || BAD_I18N_KEYS.has(p) || cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
      }
      return cur;
    };

    let text = lookup(loc, strKey);
    if (text === undefined && loc !== fallback) text = lookup(fallback, strKey);
    if (text === undefined) return key;
    if (typeof text !== 'string') return text;

    return replacePlaceholders(text, replace);
  }

  function hasTranslation(key, locale = currentLocaleRef.value) {
    return getTranslation(key, {}, locale) !== key;
  }

  function choiceTranslation(key, number, replace = {}, locale = currentLocaleRef.value) {
    const raw = getTranslation(key, {}, locale);
    const chosen = parseChoice(raw, number, locale);
    const fullReplace = { count: number, ...replace };
    return replacePlaceholders(chosen, fullReplace);
  }

  if (typeof window !== 'undefined' && window.__SOM_LANG__) {
    addTranslations(window.__SOM_LANG__);
  }

  function formatNumber(n, options, locale = currentLocaleRef.value) {
    return new Intl.NumberFormat(locale, options).format(n);
  }

  function formatCurrency(amount, currency = 'USD', locale = currentLocaleRef.value) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  }

  function formatDate(date, options, locale = currentLocaleRef.value) {
    return new Intl.DateTimeFormat(locale, options).format(date instanceof Date ? date : new Date(date));
  }

  /* ================================================================
   * Expressions
   * ================================================================ */
  // compiled expressions, kept for reuse; the oldest are dropped past FN_CACHE_MAX, so apps that
  // build many different templates (Som.render, the Template engine page) don't grow forever
  const fnCache = new Map();
  const FN_CACHE_MAX = 3000;
  // `som build` fills this with ready-made functions, so built apps never need eval (strict CSP)
  const precompiled = Object.create(null);
  const FORBIDDEN_EXP_RE = /(?:^|[^$\w])(?:constructor|__proto__|prototype)(?:[^$\w]|$)/;
  function compileFn(code, params = '__s') {
    if (FORBIDDEN_EXP_RE.test(code)) {
      throw new Error(`Forbidden expression access: prototype or constructor poisoning attempt blocked.`);
    }
    const key = params + '\u0000' + code;
    let fn = fnCache.get(key);
    if (fn) return fn;
    fn = precompiled[key];
    if (!fn) {
      try {
        fn = new Function(...params.split(','), code);
      } catch (e) {
        const stripped = stripTypeScript(code);
        if (stripped !== code) fn = new Function(...params.split(','), stripped);
        else throw e;
      }
    }
    fnCache.set(key, fn);
    if (fnCache.size > FN_CACHE_MAX) fnCache.delete(fnCache.keys().next().value);
    return fn;
  }
  const simpleIdentifierPathRE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
  function evaluate(scope, expr, el) {
    if (!expr) return undefined;
    const trimmed = String(expr).trim();
    // Fast path: Zero-eval, strictly CSP-safe AST path lookup (e.g. user.name, title, count)
    if (simpleIdentifierPathRE.test(trimmed)) {
      if (trimmed === 'true') return true;
      if (trimmed === 'false') return false;
      if (trimmed === 'null') return null;
      if (trimmed === 'undefined') return undefined;
      const parts = trimmed.split('.');
      let cur = scope;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p === 'constructor' || p === '__proto__' || p === 'prototype') return undefined;
        if (cur == null) return undefined;
        cur = isRef(cur[p]) ? cur[p].value : cur[p];
      }
      return cur;
    }
    try { return compileFn(`with($s){return(${expr})}`, '$s')(scope); }
    catch (e) { warn(`Error evaluating "${expr}":`, e.message, el || ''); }
  }
  const simplePathRE = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*|\[[^\[\]]+\])*$/;
  const fnExpRE = /^\s*(?:async\s+)?(?:\([^)]*?\)|[\w$]+)\s*=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/;
  // DOM events: @click={add} calls add() with no arguments (use $event to get the event).
  // Component events: @remove={remove} calls remove(…) with the data the child sent.
  function invokeHandler(scope, expr, args, passArgs) {
    if (!expr || !expr.trim()) return;
    try {
      if (simplePathRE.test(expr.trim()) || fnExpRE.test(expr)) {
        const fn = compileFn(`with($s){return(${expr})}`, '$s')(scope);
        if (isFunction(fn)) return passArgs || fnExpRE.test(expr) ? fn(...args) : fn();
        return;
      }
      return compileFn(`with($s){${expr}}`, '$s,$event,$args')(scope, args[0], args);
    } catch (e) { warn(`Error in handler "${expr}":`, e); }
  }
  function assign(scope, expr, value) {
    if (!expr) return;
    const trimmed = String(expr).trim();
    // Zero-eval fast path for simple and dotted assignments (e.g. name, user.name, title)
    if (simpleIdentifierPathRE.test(trimmed)) {
      const parts = trimmed.split('.');
      let cur = scope;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (p === 'constructor' || p === '__proto__' || p === 'prototype') return;
        if (cur == null) return;
        cur = isRef(cur[p]) ? cur[p].value : cur[p];
      }
      const last = parts[parts.length - 1];
      if (last === 'constructor' || last === '__proto__' || last === 'prototype') return;
      if (cur != null) {
        if (isRef(cur[last])) cur[last].value = value;
        else cur[last] = value;
        return;
      }
    }
    try { compileFn(`with($s){${expr}=$v}`, '$s,$v')(scope, value); }
    catch (e) { warn(`Cannot assign to "${expr}":`, e.message); }
  }
  function toDisplayString(v) {
    if (isRef(v)) v = v.value;
    if (v == null) return '';
    if (isArray(v) || (isObject(v) && v.toString === Object.prototype.toString)) {
      try { return JSON.stringify(v, null, 2); } catch (_) { return String(v); }
    }
    return String(v);
  }

  function slug(text, sep = '-') {
    const escapedSep = String(sep).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(text ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, sep)
      .replace(new RegExp(`^${escapedSep}+|${escapedSep}+$`, 'g'), '');
  }

  /* ------------------------------------------------------------------ SEO */
  // The router replaces the page's SEO on every navigation; Som.seo() / useSeo() from a component adds to it.
  let seoState = {};
  function applySEO(seo = {}, replace = true) {
    if (typeof document === 'undefined') return;
    const next = typeof seo === 'string' ? { title: seo } : (seo || {});
    const merged = { ...seoState, ...next };
    for (const k of ['og', 'openGraph', 'twitter']) if (seoState[k] && next[k]) merged[k] = { ...seoState[k], ...next[k] };
    const data = seoState = replace ? next : merged;
    if (data.title) document.title = data.title;

    // forget what the previous page set, so a page without a description or canonical does not keep the last one:
    // tags made here go away, tags that came with index.html (or the prerendered page) get their own content back
    document.head.querySelectorAll('[data-som-seo]').forEach((el) => {
      if (el.hasAttribute('data-som-ssr')) { el.removeAttribute('data-som-ssr'); return; } // set by the server for this very page: kept until the next navigation
      const attr = el.localName === 'link' ? 'href' : 'content';
      if (el.localName !== 'script' && el.hasAttribute('data-som-orig')) {
        el.setAttribute(attr, el.getAttribute('data-som-orig'));
        el.removeAttribute('data-som-orig');
        el.removeAttribute('data-som-seo');
      } else {
        el.remove();
      }
    });

    // <html lang dir>: a page can set them (a page in another language); the next page gets the old ones back
    const root = document.documentElement;
    for (const a of ['lang', 'dir']) {
      const mark = `data-som-orig-${a}`;
      if (root.hasAttribute(mark)) {
        const was = root.getAttribute(mark);
        if (was) root.setAttribute(a, was); else root.removeAttribute(a);
        root.removeAttribute(mark);
      }
      if (data[a]) {
        root.setAttribute(mark, root.getAttribute(a) || '');
        root.setAttribute(a, String(data[a]));
      }
    }

    const claim = (el, attr) => { // marks a tag as set by the current page, remembering the content it had before
      if (!el.hasAttribute('data-som-seo') && el.hasAttribute(attr)) el.setAttribute('data-som-orig', el.getAttribute(attr));
      el.setAttribute('data-som-seo', '');
    };

    const setMeta = (attr, name, content) => {
      if (content == null || content === '') return;
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      claim(el, 'content');
      el.setAttribute('content', String(content));
    };

    const setLink = (rel, href) => {
      if (!href) return;
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      claim(el, 'href');
      el.setAttribute('href', String(href));
    };

    if (data.description) setMeta('name', 'description', data.description);
    if (data.keywords) setMeta('name', 'keywords', Array.isArray(data.keywords) ? data.keywords.join(', ') : data.keywords);
    if (data.robots) setMeta('name', 'robots', data.robots);
    if (data.author) setMeta('name', 'author', data.author);
    if (data.canonical) setLink('canonical', data.canonical);

    // the same page in other languages: alternates: { en: '/en/about', ar: '/ar/about', 'x-default': '/about' }
    // (or [{ hreflang, href }]); each address should list all the others, itself included
    const alts = Array.isArray(data.alternates) ? data.alternates : Object.entries(data.alternates || {}).map(([hreflang, href]) => ({ hreflang, href }));
    for (const { hreflang, href } of alts) {
      if (!hreflang || !href) continue;
      const abs = typeof window !== 'undefined' ? new URL(String(href), window.location.href).href : String(href);
      let el = [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')].find((l) => l.getAttribute('hreflang') === hreflang);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'alternate');
        el.setAttribute('hreflang', hreflang);
        document.head.appendChild(el);
      }
      claim(el, 'href');
      el.setAttribute('href', abs);
    }

    // OpenGraph
    const og = data.og || data.openGraph || {};
    const ogTitle = og.title || data.title;
    const ogDesc = og.description || data.description;
    const ogImage = og.image || data.image;
    const ogUrl = og.url || data.canonical || (typeof window !== 'undefined' ? window.location.href.split('#')[0] : '');
    const ogType = og.type || 'website';
    const ogSite = og.siteName || og.site_name || data.siteName || data.site_name;

    if (ogTitle) setMeta('property', 'og:title', ogTitle);
    if (ogDesc) setMeta('property', 'og:description', ogDesc);
    if (ogImage) setMeta('property', 'og:image', ogImage);
    if (ogUrl) setMeta('property', 'og:url', ogUrl);
    if (ogType) setMeta('property', 'og:type', ogType);
    if (ogSite) setMeta('property', 'og:site_name', ogSite);

    // Twitter Card
    const tw = data.twitter || {};
    const twCard = tw.card || (ogImage ? 'summary_large_image' : 'summary');
    const twTitle = tw.title || ogTitle;
    const twDesc = tw.description || ogDesc;
    const twImage = tw.image || ogImage;
    if (twCard) setMeta('name', 'twitter:card', twCard);
    if (twTitle) setMeta('name', 'twitter:title', twTitle);
    if (twDesc) setMeta('name', 'twitter:description', twDesc);
    if (twImage) setMeta('name', 'twitter:image', twImage);
    if (tw.site) setMeta('name', 'twitter:site', tw.site);
    if (tw.creator) setMeta('name', 'twitter:creator', tw.creator);

    // JSON-LD structured data
    if (data.schema || data.jsonLd) {
      const schemaData = data.schema || data.jsonLd;
      let el = document.querySelector('script[type="application/ld+json"][data-som-seo]');
      if (!el) {
        el = document.createElement('script');
        el.type = 'application/ld+json';
        el.setAttribute('data-som-seo', '');
        document.head.appendChild(el);
      }
      el.textContent = typeof schemaData === 'string' ? schemaData : JSON.stringify(schemaData);
    }
  }

  // Scope for s-each / slot locals: local names first, then the parent scope
  function createChildScope(parent, locals) {
    return new Proxy(locals, {
      has: (t, k) => k in t || k in parent,
      get: (t, k) => (typeof k === 'symbol' ? undefined : k in t ? t[k] : parent[k]),
      set: (t, k, v) => { if (k in t) t[k] = v; else parent[k] = v; return true; },
    });
  }
  // Case-insensitive view of an object (HTML lower-cases attribute names)
  function ciProxy(obj) {
    const find = (t, k) => {
      if (k in t) return k;
      const n = normKey(k);
      for (const key in t) if (normKey(key) === n) return key;
      return undefined;
    };
    return new Proxy(obj, {
      get(t, k) {
        if (typeof k === 'symbol') return t[k];
        const real = find(t, k);
        return real === undefined ? undefined : t[real];
      },
      has(t, k) { return typeof k === 'string' ? find(t, k) !== undefined : k in t; },
    });
  }

  /* ================================================================
   * Compiler — walks real DOM, binds each directive to an effect
   * ================================================================ */
  function compileNodes(parent, nodes, scope, inst) {
    for (const n of nodes) if (n.parentNode === parent) compile(n, scope, inst);
  }

  function compile(node, scope, inst) {
    if (node.nodeType === 3) return compileText(node, scope);
    if (node.nodeType !== 1) return;
    const el = node;
    if (el.hasAttribute('s-skip')) return el.removeAttribute('s-skip');
    if (el.hasAttribute('s-once')) {
      el.removeAttribute('s-once');
      onceDepth++;
      try { return compile(el, scope, inst); } finally { onceDepth--; }
    }
    if (el.hasAttribute('s-if')) return compileIf(el, scope, inst); // s-if is checked before s-each
    if (el.hasAttribute('s-elif') || el.hasAttribute('s-else')) {
      warn('s-elif / s-else has no s-if right before it.', el);
      return el.remove();
    }
    if (el.hasAttribute('s-each') || el.hasAttribute('s-for')) {
      if (!el.hasAttribute('s-each')) {
        el.setAttribute('s-each', el.getAttribute('s-for'));
        el.removeAttribute('s-for');
      }
      return compileFor(el, scope, inst);
    }
    if (el.hasAttribute('s-empty')) {
      warn('s-empty / {empty} needs an s-each / {for} right before it.', el);
      return el.remove();
    }
    if (el.hasAttribute('s-memo')) return compileMemo(el, scope, inst); // after s-each, so each item has its own
    const tag = el.tagName.toLowerCase();
    if (tag === 'slot') return compileSlot(el, scope, inst);
    if (tag === 'som-component') return compileDynamic(el, scope, inst);
    if (tag === 'som-view') return compileView(el, scope, inst);
    if (tag === 'som-portal') return compileTeleport(el, scope, inst);
    if (tag === 'som-section') return compileSection(el, scope, inst);
    if (tag === 'som-yield') return compileYield(el, scope, inst);
    if (tag === 'som-wait') return compileWait(el, scope, inst);
    if (tag === 'template') {
      return unwrap(el, scope, inst);
    }
    const def = resolveComponent(tag, inst);
    if (def) return mountComponent(el, def, scope, inst);
    compileElement(el, scope, inst);
  }

  /* ---------- { expr } interpolation ---------- */
  // "Hi {name}!" → [{ text: 'Hi ' }, { expr: 'name' }, { text: '!' }]; write \{ for a literal brace
  function splitInterp(str) {
    const parts = [];
    let buf = '', i = 0;
    while (i < str.length) {
      const c = str[i];
      if (c === '\\' && str[i + 1] === '{') { buf += '{'; i += 2; continue; }
      if (c === '{') {
        let end = -1;
        try { end = matchBrace(str, i); } catch (_) { /* a lone brace is just text */ }
        if (end < 0) { buf += c; i++; continue; }
        let expr = str.slice(i + 1, end - 1).trim();
        const inner = exactBrace(expr);
        if (inner != null) expr = inner; // {{ x }} reads the same as { x }
        if (!expr) { buf += str.slice(i, end); i = end; continue; }
        if (buf) parts.push({ text: buf });
        buf = '';
        parts.push({ expr });
        i = end;
        continue;
      }
      buf += c;
      i++;
    }
    if (buf) parts.push({ text: buf });
    return parts;
  }
  // "{ expr }" → "expr"; anything else → null
  function exactBrace(v) {
    const t = (v || '').trim();
    if (t[0] !== '{') return null;
    try { return matchBrace(t, 0) === t.length ? t.slice(1, -1).trim() : null; } catch (_) { return null; }
  }
  const stripBrace = (v) => { const e = exactBrace(v); return e != null ? e : v; };
  // "btn {active ? 'on' : ''}" → "`btn ${…}`"; null when there is nothing to interpolate
  function interpToExpr(str) {
    const parts = splitInterp(str);
    if (!parts.some((p) => p.expr != null)) return null;
    return '`' + parts.map((p) => (p.expr != null
      ? '${(' + p.expr + ') ?? ""}'
      : p.text.replace(/[`\\]/g, '\\$&').replace(/\$\{/g, '\\${'))).join('') + '`';
  }

  function compileText(node, scope) {
    const tpl = node.textContent;
    if (!tpl.includes('{')) return;
    const parts = splitInterp(tpl);
    if (!parts.some((p) => p.expr != null)) {
      const plain = parts.map((p) => p.text).join('');
      if (plain !== tpl) node.textContent = plain;
      return;
    }
    const code = `with($s){return ${parts.map((p) => (p.expr != null ? `$d(${p.expr})` : JSON.stringify(p.text))).join('+')}}`;
    renderEffect(() => {
      try { node.textContent = compileFn(code, '$s,$d')(scope, toDisplayString); }
      catch (e) { warn(`Error in "${tpl.trim()}":`, e.message); }
    });
  }

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const UNESC_MAP = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&apos;': "'", '&nbsp;': ' ', '&colon;': ':', '&tab;': '\t', '&newline;': '\n' };
  function escapeHtml(s) {
    return s == null ? '' : String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }
  function decodeEntities(s) {
    return String(s == null ? '' : s)
      .replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => { const c = parseInt(h, 16); return Number.isNaN(c) ? '' : String.fromCodePoint(Math.min(c, 0x10ffff)); })
      .replace(/&#(\d+);?/g, (_, d) => { const c = parseInt(d, 10); return Number.isNaN(c) ? '' : String.fromCodePoint(Math.min(c, 0x10ffff)); })
      .replace(/&(?:amp|lt|gt|quot|#39|#039|apos|nbsp|colon|tab|newline);/gi, (m) => UNESC_MAP[m.toLowerCase()] || m);
  }
  function stripTags(html) {
    if (html == null) return '';
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function isUnsafeAttrUrl(val) {
    const clean = decodeEntities(val).trim().replace(/[\x00-\x20\s]/g, '');
    if (/^(?:javascript|vbscript|data|file|blob):/i.test(clean)) {
      return !/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(clean);
    }
    return false;
  }
  // Elements that are removed with everything inside them, and the attributes checked as addresses.
  const DROP_TAGS = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'base', 'meta', 'link', 'svg', 'math', 'noscript', 'template', 'portal', 'param']);
  const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'data', 'background', 'ping', 'cite', 'longdesc', 'manifest', 'codebase']);
  function sanitizeNode(parent) {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === 8) { parent.removeChild(child); continue; } // comment
      if (child.nodeType !== 1) continue;
      if (DROP_TAGS.has(child.localName)) { parent.removeChild(child); continue; }
      for (const attr of [...child.attributes]) {
        const n = attr.name.toLowerCase();
        if (n.startsWith('on') || n === 'srcdoc' || n === 'is') { child.removeAttribute(attr.name); continue; }
        if (URL_ATTRS.has(n)) { if (isUnsafeAttrUrl(attr.value)) child.setAttribute(attr.name, '#'); continue; }
        if (n === 'srcset' && /(?:^|[\s,])(?:javascript|vbscript|data|file|blob):/i.test(decodeEntities(attr.value).replace(/[\x00-\x20]/g, ' '))) { child.removeAttribute(attr.name); continue; }
        if (n === 'style' && /url\s*\(|expression|javascript|@import|behavior|binding/i.test(decodeEntities(attr.value))) child.removeAttribute(attr.name);
      }
      sanitizeNode(child);
    }
  }
  // The browser itself parses the HTML in an inert document (nothing loads or runs there), so the
  // result is judged on what the browser sees, not on what a pattern thinks the text looks like.
  function cleanHtmlDom(html) {
    const doc = document.implementation.createHTMLDocument('');
    const box = doc.createElement('div');
    box.innerHTML = html;
    sanitizeNode(box);
    return box.innerHTML;
  }

  function cleanHtml(raw) {
    if (raw == null) return '';
    let html = String(raw);
    if (typeof document !== 'undefined' && document.implementation && document.implementation.createHTMLDocument) {
      try { return cleanHtmlDom(html); } catch (_) { /* fall through to the text-based cleaner below */ }
    }
    let prev;
    const blockRegex = /<(script|style|iframe|object|embed|applet|form|svg|math|noscript|template)[\s\S]*?<\/\1>/gi;
    const dangerousTagRegex = /<\/?(?:script|style|iframe|object|embed|applet|form|base|meta|link|svg|math|noscript|template)\b[^>]*>/gi;
    do {
      prev = html;
      html = html
        .replace(blockRegex, '')
        .replace(dangerousTagRegex, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    } while (html !== prev);

    return html
      // an attribute can follow a closing quote with no space (<img src="x"onerror=…>): keep that character, drop the handler
      .replace(/([\s/"'`])on[a-z0-9_-]+\s*=\s*(['"])[\s\S]*?\2/gi, '$1')
      .replace(/([\s/"'`])on[a-z0-9_-]+\s*=\s*[^>\s]+/gi, '$1')
      .replace(/\b(href|src|action|formaction|xlink:href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi, (m, attr, q1, q2, uq) => {
        const val = q1 !== undefined ? q1 : (q2 !== undefined ? q2 : (uq || ''));
        return isUnsafeAttrUrl(val) ? `${attr}="#"` : m;
      });
  }

  function compileElement(el, scope, inst) {
    let model = null, textExpr = null, htmlExpr = null, shown = false;
    const anim = readAnimate(el);
    for (let { name, value } of [...el.attributes]) {
      if (name[0] === ':' || name === 's-bind' || name.startsWith('s-bind:')) {
        el.removeAttribute(name);
        const arg = name[0] === ':' ? name.slice(1) : name.slice(7);
        if (!arg) renderEffect(() => { const o = evaluate(scope, value, el) || {}; for (const k in o) setAttr(el, k, o[k]); });
        else bindAttr(el, arg, value, scope);
      } else if (name[0] === '@' || name.startsWith('s-on:') || /^s-(click|submit|change|input|keydown|keyup)$/.test(name)) {
        el.removeAttribute(name);
        const ev = name[0] === '@' ? name.slice(1) : name.startsWith('s-on:') ? name.slice(5) : name.slice(2);
        bindEvent(el, ev, stripBrace(value), scope);
      } else if (name === 's-ref') {
        el.removeAttribute(name);
        setRef(inst, value, el);
      } else if (name.startsWith('s-')) {
        el.removeAttribute(name);
        value = stripBrace(value);
        const [full, ...mods] = name.slice(2).split('.');
        const [dir, arg] = full.split(':');
        if (dir === 'model') model = { expr: value, mods };
        else if (dir === 'show' || dir === 'modal' || dir === 'dialog') { shown = true; bindShow(el, value, scope, anim); }
        else if (dir === 'text') textExpr = value;
        else if (dir === 'html') htmlExpr = value;
        else if (dir === 'cloak') { /* removed once compiled */ }
        else bindCustomDirective(el, dir, arg, mods, value, scope, inst);
      } else if (value.includes('{') && !name.startsWith('on')) {
        // title={expr} keeps the value as is; class="btn {x}" builds a string
        const expr = exactBrace(value) ?? interpToExpr(value);
        if (expr != null) { el.removeAttribute(name); bindAttr(el, name, expr, scope); }
      }
    }
    if (textExpr != null) renderEffect(() => { el.textContent = toDisplayString(evaluate(scope, textExpr, el)); });
    else if (htmlExpr != null) renderEffect(() => { const h = evaluate(scope, htmlExpr, el); el.innerHTML = h == null ? '' : cleanHtml(h); });
    else if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') compileNodes(el, [...el.childNodes], scope, inst);
    if (model) bindModel(el, model.expr, model.mods, scope); // after children, so <option>s exist
    if (anim && !shown) queuePostJob(() => animate(el, anim.name, 'in'), el); // plays when the element appears
  }

  function unwrap(el, scope, inst) {
    const parent = el.parentNode;
    const src = el.tagName === 'TEMPLATE' ? el.content : el;
    const kids = [...src.childNodes];
    kids.forEach((k) => parent.insertBefore(k, el));
    el.remove();
    compileNodes(parent, kids, scope, inst);
  }

  /* ---------- attribute / class / style binding ---------- */
  function normalizeClass(v) {
    if (!v) return '';
    if (typeof v === 'string') return v.trim();
    if (isArray(v)) return v.map(normalizeClass).filter(Boolean).join(' ');
    if (isObject(v)) return Object.keys(v).filter((k) => v[k]).join(' ');
    return String(v);
  }
  function normalizeStyle(v) {
    if (!v) return {};
    if (typeof v === 'string') {
      const o = {};
      v.split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim(); });
      return o;
    }
    if (isArray(v)) return Object.assign({}, ...v.map(normalizeStyle));
    return v;
  }
  // Several sources (static, :class, fallthrough attrs) can each own a "part" of class/style
  function setClassPart(el, id, value) {
    const p = el._cls || (el._cls = { base: el.getAttribute('class') || '', parts: {} });
    p.parts[id] = normalizeClass(value);
    const cls = [p.base, ...Object.values(p.parts)].filter(Boolean).join(' ');
    cls ? el.setAttribute('class', cls) : el.removeAttribute('class');
  }
  function initStyle(el) {
    return el._sty || (el._sty = { base: el.getAttribute('style') || '', parts: {} });
  }
  function setStylePart(el, id, value) {
    initStyle(el).parts[id] = normalizeStyle(value);
    renderStyle(el);
  }
  function renderStyle(el) {
    const p = el._sty;
    el.setAttribute('style', p.base);
    for (const id in p.parts) {
      const o = p.parts[id];
      for (const k in o) {
        const v = o[k];
        if (k.startsWith('--')) el.style.setProperty(k, v == null ? '' : v);
        else el.style[camelize(k)] = v == null ? '' : v;
      }
    }
    if (el._vshowHidden) el.style.display = 'none';
    if (!el.getAttribute('style')) el.removeAttribute('style');
  }
  const VALUE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'];
  const svgCase = { viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio' };
  const DANGEROUS_URI_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'data', 'background']);
  const BLOCKED_DYNAMIC_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'applet', 'style', 'base', 'meta', 'link']);
  function setAttr(el, key, val) {
    if (BAD_PATH_KEYS.has(key) || /^on[a-z]/i.test(String(key))) return;
    if (key === 'class') return setClassPart(el, 'spread', val);
    if (key === 'style') return setStylePart(el, 'spread', val);
    if (key === 'value' && VALUE_TAGS.includes(el.tagName)) {
      el._value = val;
      const s = val == null ? '' : String(val);
      if (el.value !== s) el.value = s;
      return;
    }
    if (key === 'innerHTML') { el.innerHTML = val == null ? '' : cleanHtml(val); return; }
    if (key === 'textContent') { el.textContent = val == null ? '' : val; return; }
    const lowerKey = String(key).toLowerCase();
    if (lowerKey === 'srcdoc') {
      if (val == null || val === false) el.removeAttribute(key);
      else el.setAttribute('srcdoc', cleanHtml(val));
      return;
    }
    if (DANGEROUS_URI_ATTRS.has(lowerKey)) {
      const s = String(val == null ? '' : val).trim();
      if (isUnsafeAttrUrl(s)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[Som.js Security Warning] Blocked dangerous URI in attribute "${key}".`);
        }
        el.removeAttribute(key);
        return;
      }
    }
    if (typeof val === 'boolean' && key in el && !key.startsWith('aria-') && !key.startsWith('data-')) {
      el[key] = val;
      if (!val) el.removeAttribute(key);
      return;
    }
    if (el.namespaceURI === 'http://www.w3.org/2000/svg' && svgCase[key]) key = svgCase[key];
    if (val == null || val === false) el.removeAttribute(key);
    else el.setAttribute(key, val === true ? '' : String(val));
  }
  function bindAttr(el, key, expr, scope) {
    key = key.split('.')[0];
    if (key === 'key') return;
    if (key === 'class') return renderEffect(() => setClassPart(el, 'bind', evaluate(scope, expr, el)));
    if (key === 'style') return renderEffect(() => setStylePart(el, 'bind', evaluate(scope, expr, el)));
    renderEffect(() => setAttr(el, key, evaluate(scope, expr, el)));
  }
  function bindShow(el, expr, scope, anim) {
    initStyle(el);
    const isDialog = el && el.tagName === 'DIALOG';
    if (isDialog) {
      el.addEventListener('close', () => {
        try { assign(scope, expr, false); } catch (_) {}
      });
    }
    let first = true, last;
    renderEffect(() => {
      const show = !!evaluate(scope, expr, el);
      const hide = !show;
      if (hide === last) return;
      last = hide;
      if (isDialog) {
        if (show) {
          if (!el.open) {
            try {
              if (typeof el.showModal === 'function') el.showModal();
              else el.open = true;
            } catch (_) { el.open = true; }
          }
        } else {
          if (el.open) {
            try {
              if (typeof el.close === 'function') el.close();
              else el.open = false;
            } catch (_) { el.open = false; }
          }
        }
      }
      const play = anim && (!first || anim.first);
      first = false;
      if (!play) { el._vshowHidden = hide; return renderStyle(el); }
      if (hide) animate(el, anim.name, 'out', () => { el._vshowHidden = true; renderStyle(el); });
      else {
        el._vshowHidden = false;
        renderStyle(el);
        queuePostJob(() => animate(el, anim.name, 'in'), el);
      }
    });
  }

  /* ---------- events ---------- */
  const keyAliases = {
    enter: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', space: ' ',
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    delete: ['Delete', 'Backspace'], backspace: 'Backspace',
  };
  const systemMods = ['ctrl', 'shift', 'alt', 'meta'];
  const flowMods = ['prevent', 'stop', 'self', 'once', 'capture', 'passive', 'exact'];
  const mouseButtons = { left: 0, middle: 1, right: 2 };
  function bindEvent(el, raw, expr, scope) {
    const [type, ...mods] = raw.split('.');
    const keyMods = mods.filter((m) => !flowMods.includes(m) && !systemMods.includes(m));
    const handler = (e) => {
      if (mods.includes('self') && e.target !== e.currentTarget) return;
      for (const m of systemMods) if (mods.includes(m) && !e[m + 'Key']) return;
      if (mods.includes('exact') && systemMods.some((m) => !mods.includes(m) && e[m + 'Key'])) return;
      if (keyMods.length) {
        if (typeof e.key === 'string') {
          const ok = keyMods.some((m) => {
            const k = keyAliases[m];
            return k ? [].concat(k).includes(e.key) : hyphenate(e.key) === m || e.key.toLowerCase() === m;
          });
          if (!ok) return;
        } else if ('button' in e && !keyMods.some((m) => mouseButtons[m] === e.button)) return;
      }
      if (mods.includes('prevent')) e.preventDefault();
      if (mods.includes('stop')) e.stopPropagation();
      invokeHandler(scope, expr, [e]);
    };
    el.addEventListener(type, handler, {
      capture: mods.includes('capture'), passive: mods.includes('passive'), once: mods.includes('once'),
    });
  }

  /* ---------- s-model on native elements ---------- */
  const toNumber = (v) => { const n = parseFloat(v); return isNaN(n) ? v : n; };
  const valueOf = (el) => ('_value' in el ? el._value : el.value);
  function bindModel(el, expr, mods, scope) {
    const tag = el.tagName;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const get = () => evaluate(scope, expr, el);
    const set = (v) => assign(scope, expr, v);
    const cast = (v) => (mods.includes('number') ? toNumber(v) : v);

    if (type === 'checkbox') {
      renderEffect(() => {
        const m = get();
        el.checked = isArray(m) ? m.some((x) => looseEqual(x, valueOf(el))) : !!m;
      });
      el.addEventListener('change', () => {
        const m = get();
        if (isArray(m)) {
          const v = cast(valueOf(el));
          const i = m.findIndex((x) => looseEqual(x, v));
          if (el.checked && i < 0) m.push(v);
          else if (!el.checked && i > -1) m.splice(i, 1);
        } else set(el.checked);
      });
    } else if (type === 'radio') {
      renderEffect(() => { el.checked = looseEqual(get(), valueOf(el)); });
      el.addEventListener('change', () => { if (el.checked) set(cast(valueOf(el))); });
    } else if (tag === 'SELECT') {
      const sync = () => {
        const m = get();
        [...el.options].forEach((o) => {
          o.selected = el.multiple ? isArray(m) && m.some((x) => looseEqual(x, valueOf(o))) : looseEqual(m, valueOf(o));
        });
      };
      renderEffect(sync);
      if (typeof MutationObserver !== 'undefined') {
        // options rendered by s-each may change later
        const mo = new MutationObserver(() => { pauseTracking(); try { sync(); } finally { resetTracking(); } });
        mo.observe(el, { childList: true, subtree: true });
        onScopeDispose(() => mo.disconnect());
      }
      el.addEventListener('change', () => {
        const sel = [...el.options].filter((o) => o.selected).map((o) => cast(valueOf(o)));
        set(el.multiple ? sel : sel[0]);
      });
    } else {
      const isNumber = mods.includes('number') || type === 'number';
      renderEffect(() => {
        const v = get();
        if (isNumber && el.value !== '' && toNumber(el.value) === v) return; // don't fight the user while typing "1."
        const s = v == null ? '' : String(v);
        if (el.value !== s) el.value = s;
      });
      el.addEventListener(mods.includes('lazy') ? 'change' : 'input', (e) => {
        if (e.isComposing) return; // IME input in progress
        let v = el.value;
        if (mods.includes('trim')) v = v.trim();
        if (isNumber) v = toNumber(v);
        set(v);
      });
      el.addEventListener('compositionend', () => el.dispatchEvent(new Event('input')));
      if (mods.includes('trim')) el.addEventListener('change', () => { el.value = el.value.trim(); });
    }
  }

  /* ---------- custom directives ---------- */
  function resolveFrom(map, name) {
    if (!map) return null;
    const n = normKey(name);
    for (const k in map) if (normKey(k) === n) return map[k];
    return null;
  }
  function bindCustomDirective(el, name, arg, mods, expr, scope, inst) {
    const d = resolveFrom(inst.def.directives, name) || inst.appContext.directives[normKey(name)];
    if (!d) return warn(`Unknown directive: s-${name}`);
    const dir = isFunction(d) ? { ready: d, update: d } : d; // hooks: ready(el, binding), update, destroy
    const binding = {
      arg, modifiers: Object.fromEntries(mods.map((m) => [m, true])), instance: inst.ctx, value: undefined, oldValue: undefined,
    };
    let state = 0; // 0 = new, 1 = mount queued, 2 = mounted
    renderEffect(() => {
      binding.oldValue = binding.value;
      binding.value = expr ? evaluate(scope, expr, el) : undefined;
      if (state === 0) {
        state = 1;
        queuePostJob(() => { state = 2; if (dir.ready) dir.ready(el, binding); }, el);
      } else if (state === 2 && dir.update) dir.update(el, binding);
    });
    onScopeDispose(() => { if (dir.destroy) dir.destroy(el, binding); });
  }

  /* ---------- template refs ---------- */
  function setRef(inst, name, value) {
    if (!inst) return;
    const setupRaw = toRaw(inst.setupState);
    // fills a matching `state box = null` (or a signal) with the element
    if (hasOwn(setupRaw, name)) isRef(setupRaw[name]) ? (setupRaw[name].value = value) : (inst.setupState[name] = value);
    inst.refs[name] = value;
    onScopeDispose(() => {
      if (inst.refs[name] === value) delete inst.refs[name];
      if (hasOwn(setupRaw, name)) {
        if (isRef(setupRaw[name])) { if (setupRaw[name].value === value) setupRaw[name].value = null; }
        else if (setupRaw[name] === value) inst.setupState[name] = null;
      }
    });
  }

  /* ---------- blocks: a range of DOM nodes + their effect scope ---------- */
  function removeRange(start, end) {
    let n = start;
    while (n) {
      const next = n.nextSibling;
      n.remove();
      if (n === end) break;
      n = next;
    }
  }
  function mountBlock(parent, before, raw, scope, inst, custom) {
    const start = text(), end = text();
    const frag = document.createDocumentFragment();
    const content = raw.nodeType === 11 ? raw.cloneNode(true) : raw.tagName === 'TEMPLATE' ? raw.content.cloneNode(true) : raw.cloneNode(true);
    const nodes = content.nodeType === 11 ? [...content.childNodes] : [content];
    frag.appendChild(start);
    nodes.forEach((n) => frag.appendChild(n));
    frag.appendChild(end);
    const blockScope = new EffectScope();
    blockScope.run(() => {
      pauseTracking();
      const prevOwner = renderOwner;
      renderOwner = inst || null;
      try { custom ? custom(nodes[0]) : compileNodes(frag, nodes, scope, inst); }
      finally { resetTracking(); renderOwner = prevOwner; }
    });
    parent.insertBefore(frag, before);
    if (start.isConnected) flushPostJobs();
    return {
      start, end,
      remove() { blockScope.stop(); removeRange(start, end); },
      // stop now; with an animation, the nodes stay until their out-animation ends
      leave(anim, done) {
        blockScope.stop();
        animateRange(start, end, anim, 'out', () => { removeRange(start, end); if (done) done(); });
      },
      move(p, b) {
        const stop = end.nextSibling;
        let n = start;
        while (n && n !== stop) { const next = n.nextSibling; p.insertBefore(n, b); n = next; }
      },
    };
  }

  /* ---------- s-if / s-elif / s-else ---------- */
  function compileIf(el, scope, inst) {
    const anchor = text();
    el.parentNode.insertBefore(anchor, el);
    const branches = [{ cond: stripBrace(el.getAttribute('s-if')), el }];
    el.removeAttribute('s-if');
    let n = el.nextSibling;
    while (n) {
      if ((n.nodeType === 3 && !n.textContent.trim()) || n.nodeType === 8) { n = n.nextSibling; continue; }
      if (n.nodeType !== 1) break;
      const next = n.nextSibling;
      if (n.hasAttribute('s-elif')) {
        branches.push({ cond: stripBrace(n.getAttribute('s-elif')), el: n });
        n.removeAttribute('s-elif');
        n.remove();
        n = next;
      } else if (n.hasAttribute('s-else')) {
        branches.push({ cond: null, el: n });
        n.removeAttribute('s-else');
        n.remove();
        break;
      } else break;
    }
    el.remove();
    const anim = readAnimate(el);
    branches.forEach((b) => readAnimate(b.el));

    let current = -1, block = null, first = true, gen = 0;
    const owner = activeScope;
    renderEffect(() => {
      const idx = branches.findIndex((b) => b.cond == null || evaluate(scope, b.cond, b.el));
      if (idx === current) return;
      current = idx;
      const my = ++gen, playIn = anim && (!first || anim.first);
      first = false;
      const enter = () => {
        if (my !== gen || (owner && !owner.active)) return;
        const mount = () => mountBlock(anchor.parentNode, anchor, branches[idx].el, scope, inst);
        block = idx > -1 ? (owner ? owner.run(mount) : mount()) : null;
        if (block && playIn) animateRange(block.start, block.end, anim, 'in');
      };
      const old = block;
      block = null;
      if (old && anim) old.leave(anim, anim.after ? enter : null);
      else if (old) old.remove();
      if (!(old && anim && anim.after)) enter();
    });
  }

  /* ---------- s-each (keyed with s-key) ---------- */
  const forAliasRE = /^\s*(?:\(([^)]*)\)|([\w$]+))\s+(?:in|of)\s+([\s\S]+)$/;
  function toEntries(src) {
    if (src == null) return [];
    if (isRef(src)) src = src.value;
    if (typeof src === 'number') return Array.from({ length: src }, (_, i) => ({ value: i + 1 }));
    if (typeof src === 'string') return [...src].map((value) => ({ value }));
    if (isArray(src)) return src.map((value) => ({ value }));
    if (src[Symbol.iterator]) return Array.from(src, (value) => ({ value }));
    return Object.keys(src).map((key) => ({ value: src[key], key, isObj: true }));
  }
  function compileFor(el, scope, inst) {
    const expr = stripBrace(el.getAttribute('s-each'));
    el.removeAttribute('s-each');
    const m = expr.match(forAliasRE);
    if (!m) { warn(`Invalid s-each expression: "${expr}"`); return el.remove(); }
    const aliases = (m[1] || m[2]).split(',').map((s) => s.trim()).filter(Boolean);
    const source = m[3].trim();
    const keyExpr = el.hasAttribute('s-key') ? stripBrace(el.getAttribute('s-key')) : null;
    el.removeAttribute('s-key');

    // an s-empty element right after it ({empty} in a {for} block) shows when the list is empty
    let emptyTpl = null;
    for (let n = el.nextSibling; n; n = n.nextSibling) {
      if ((n.nodeType === 3 && !n.textContent.trim()) || n.nodeType === 8) continue;
      if (n.nodeType === 1 && n.hasAttribute('s-empty')) {
        n.removeAttribute('s-empty');
        n.remove();
        emptyTpl = n;
      }
      break;
    }

    const anchor = text();
    el.parentNode.insertBefore(anchor, el);
    el.remove();
    const anim = readAnimate(el);

    let blocks = [];
    let emptyBlock = null, first = true;
    renderEffect(() => {
      const playIn = anim && (!first || anim.first);
      first = false;
      const before0 = anim ? new Map(blocks.map((b) => [b, firstEl(b.block)]).filter((x) => x[1]).map(([b, n]) => [b, n.getBoundingClientRect()])) : null;
      const entries = toEntries(evaluate(scope, source, el));
      if (emptyTpl) {
        if (!entries.length && !emptyBlock) emptyBlock = mountBlock(anchor.parentNode, anchor, emptyTpl, scope, inst);
        else if (entries.length && emptyBlock) { emptyBlock.remove(); emptyBlock = null; }
      }
      const parent = anchor.parentNode;
      const old = new Map();
      blocks.forEach((b) => old.set(b.key, b));
      const next = [];
      const seen = new Set();

      entries.forEach((en, i) => {
        const locals = { [aliases[0]]: en.value };
        if (aliases[1]) locals[aliases[1]] = en.isObj ? en.key : i;
        if (aliases[2]) locals[aliases[2]] = i;
        let key = keyExpr ? evaluate(createChildScope(scope, locals), keyExpr, el) : i;
        if (seen.has(key)) { warn(`Duplicate s-key values in s-each: ${String(key)}`); key = { dup: i }; }
        seen.add(key);
        let b = old.get(key);
        if (b) { old.delete(key); Object.assign(b.locals, locals); } // reuse block, update its locals
        else b = { key, locals: reactive(locals), block: null };
        next.push(b);
      });

      old.forEach((b) => (anim ? b.block.leave(anim) : b.block.remove()));
      // place blocks from the end; only move the ones that are out of order
      let before = anchor;
      for (let i = next.length - 1; i >= 0; i--) {
        const b = next[i];
        if (!b.block) {
          b.block = mountBlock(parent, before, el, createChildScope(scope, b.locals), inst);
          if (playIn) animateRange(b.block.start, b.block.end, anim, 'in');
        } else if (b.block.end.nextSibling !== before) b.block.move(parent, before);
        before = b.block.start;
      }
      blocks = next;
      if (before0 && before0.size) playMoves(before0, anim);
    });
  }

  /* ---------- <slot> ---------- */
  function buildSlotLocals(pattern, props) {
    pattern = (pattern || '').trim();
    if (!pattern) return null;
    const locals = {};
    if (pattern[0] === '{') {
      pattern.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean).forEach((part) => {
        const [lhs, dflt] = part.split('=').map((s) => s.trim());
        const [from, to] = lhs.split(':').map((s) => s.trim());
        Object.defineProperty(locals, to || from, {
          enumerable: true,
          get: () => {
            const v = props[from];
            return v === undefined && dflt !== undefined ? compileFn(`return (${dflt})`, '')() : v;
          },
        });
      });
    } else Object.defineProperty(locals, pattern, { enumerable: true, get: () => props });
    return locals;
  }
  function compileSlot(el, scope, inst) {
    const name = el.getAttribute('name') || 'default';
    const slot = inst && inst.slots[normKey(name)];
    const anchor = text();
    el.parentNode.insertBefore(anchor, el);
    el.remove();

    if (!slot) { // fallback content
      const frag = document.createDocumentFragment();
      [...el.childNodes].forEach((n) => frag.appendChild(n));
      mountBlock(anchor.parentNode, anchor, frag, scope, inst);
      return;
    }
    const slotProps = reactive({});
    for (const { name: an, value } of [...el.attributes]) {
      if (an === 'name') continue;
      if (an[0] === ':' || an.startsWith('s-bind:')) {
        const k = camelize(an[0] === ':' ? an.slice(1) : an.slice(7));
        renderEffect(() => { slotProps[k] = evaluate(scope, value, el); });
      } else if (an === 's-bind') {
        renderEffect(() => Object.assign(slotProps, evaluate(scope, value, el) || {}));
      } else if (value.includes('{') && (exactBrace(value) ?? interpToExpr(value)) != null) {
        const expr = exactBrace(value) ?? interpToExpr(value);
        renderEffect(() => { slotProps[camelize(an)] = evaluate(scope, expr, el); });
      } else slotProps[camelize(an)] = value;
    }
    const locals = buildSlotLocals(slot.pattern, ciProxy(slotProps));
    const slotScope = locals ? createChildScope(slot.scope, locals) : slot.scope;
    mountBlock(anchor.parentNode, anchor, slot.tpl, slotScope, slot.inst); // compiled in the parent's scope
  }

  /* ---------- s-animate="fade": CSS classes while things come and go ----------
   *   coming in:  fade-in-from → fade-in-to   (fade-in stays on the whole time)
   *   going out:  fade-out-from → fade-out-to (fade-out stays on the whole time)
   *   a list item that moves gets fade-move.  Ready-made: fade, slide, scale, pop.
   * --------------------------------------------------------------------------- */
  const PRESET_CSS = [
    '.fade-in,.fade-out{transition:opacity .25s ease}',
    '.fade-in-from,.fade-out-to{opacity:0}',
    '.slide-in,.slide-out{transition:opacity .25s ease,transform .25s ease}',
    '.slide-in-from,.slide-out-to{opacity:0;transform:translateY(14px)}',
    '.scale-in,.scale-out{transition:opacity .2s ease,transform .2s ease}',
    '.scale-in-from,.scale-out-to{opacity:0;transform:scale(.9)}',
    '.pop-in{animation:som-pop .35s cubic-bezier(.3,1.6,.6,1)}',
    '.pop-out{transition:opacity .15s ease,transform .15s ease}.pop-out-to{opacity:0;transform:scale(.8)}',
    '@keyframes som-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}',
    '.fade-move,.slide-move,.scale-move,.pop-move{transition:transform .3s ease}',
  ].join('\n');
  let presetsAdded = false;
  function addPresets() {
    if (presetsAdded || typeof document === 'undefined') return;
    presetsAdded = true;
    if (document.querySelector('[data-som-presets]')) return; // `som build` put them in app.css
    const st = document.createElement('style');
    st.setAttribute('data-som-presets', '');
    st.textContent = PRESET_CSS;
    document.head.insertBefore(st, document.head.firstChild); // first, so your own CSS wins
  }
  function readAnimate(el) {
    for (const { name, value } of [...el.attributes]) {
      if (name !== 's-animate' && !name.startsWith('s-animate.')) continue;
      el.removeAttribute(name);
      const mods = name.split('.').slice(1);
      addPresets();
      return { name: (stripBrace(value) || '').trim() || 'fade', first: mods.includes('first'), after: mods.includes('after') };
    }
    return null;
  }
  const raf = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
  // the longest transition or animation on an element, in ms
  function animTime(el) {
    if (typeof getComputedStyle !== 'function') return 0;
    const cs = getComputedStyle(el);
    const list = (v) => String(v || '0s').split(',').map((x) => (parseFloat(x) || 0) * (/ms\s*$/.test(x) ? 1 : 1000));
    const longest = (d, l) => { const D = list(d), L = list(l); return Math.max(0, ...D.map((x, i) => x + (L[i % L.length] || 0))); };
    return Math.max(longest(cs.transitionDuration, cs.transitionDelay), longest(cs.animationDuration, cs.animationDelay));
  }
  function animate(el, name, dir, done) {
    if (el._somAnim) el._somAnim(); // stop what was playing
    const c = (x) => `${name}-${dir}${x}`;
    const cl = el.classList;
    let over = false, timer = null;
    const finish = (cancelled) => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      cl.remove(c(''), c('-from'), c('-to'));
      el._somAnim = null;
      el.dispatchEvent(new CustomEvent(`animate-${dir}-end`, { bubbles: false }));
      if (!cancelled && done) done();
    };
    el._somAnim = () => finish(true);
    cl.add(c(''), c('-from'));
    el.dispatchEvent(new CustomEvent(`animate-${dir}`, { bubbles: false }));
    raf(() => raf(() => {
      if (over) return;
      cl.remove(c('-from'));
      cl.add(c('-to'));
      const ms = animTime(el);
      if (!ms) return finish();
      timer = setTimeout(() => finish(), ms + 30);
    }));
  }
  function rangeEls(start, end) {
    const out = [];
    for (let n = start; n && n !== end; n = n.nextSibling) if (n.nodeType === 1) out.push(n);
    return out;
  }
  const firstEl = (block) => block && rangeEls(block.start, block.end)[0];
  // animate every element of a block; `done` runs when the last one ends
  function animateRange(start, end, anim, dir, done) {
    const els = anim ? rangeEls(start, end) : [];
    if (!els.length) return done && done();
    let left = els.length;
    const one = () => { if (--left === 0 && done) done(); };
    els.forEach((n) => (dir === 'in' ? queuePostJob(() => animate(n, anim.name, 'in', one), n) : animate(n, anim.name, 'out', one)));
  }
  // list items that changed place slide from their old spot (name-move class)
  function playMoves(before, anim) {
    before.forEach((old, b) => {
      const n = firstEl(b.block);
      if (!n || !n.isConnected || !n.getBoundingClientRect) return;
      const now = n.getBoundingClientRect();
      const dx = old.left - now.left, dy = old.top - now.top;
      if (!dx && !dy) return;
      const cls = anim.name + '-move';
      n.classList.remove(cls);
      n.style.transitionDuration = '0s';
      n.style.transform = `translate(${dx}px, ${dy}px)`;
      void n.offsetHeight; // apply the jump back first
      n.classList.add(cls);
      n.style.transitionDuration = '';
      n.style.transform = '';
      clearTimeout(n._somMove);
      n._somMove = setTimeout(() => n.classList.remove(cls), animTime(n) + 30);
    });
  }

  /* ---------- keep: pages and components that are put away instead of removed ---------- */
  let currentKeep = null; // the kept entry being built right now (its components get on show / on hide)
  function keepHooks(ctx, type) {
    if (!ctx || ctx.visible === (type === 'show')) return;
    ctx.visible = type === 'show';
    ctx.insts.forEach((i) => { if (i.isMounted) i.scope.run(() => i.hooks[type].forEach((h) => safeCall(h, i.ctx))); });
  }
  // shows one thing at a time in front of `anchor`: used by <som-component :is> and <som-view>
  function makeSwitch(anchor, { anim, keep, max }) {
    const owner = activeScope;
    const cache = new Map();
    let cur = null, gen = 0, first = true;
    const putAway = (entry, then) => {
      if (entry.ctx) {
        keepHooks(entry.ctx, 'hide');
        const away = () => { entry.block.move(entry.frag, null); if (then) then(); };
        anim ? animateRange(entry.block.start, entry.block.end, anim, 'out', away) : away();
      } else if (anim) entry.block.leave(anim, then);
      else { entry.block.remove(); if (then) then(); }
    };
    return {
      show(key, mount) {
        const my = ++gen, playIn = anim && (!first || anim.first);
        first = false;
        const enter = () => {
          if (my !== gen || (owner && !owner.active) || key == null) return;
          let entry = keep ? cache.get(key) : null;
          if (entry) { // back from the cache, exactly as it was left
            cache.delete(key);
            cache.set(key, entry);
            entry.block.move(anchor.parentNode, anchor);
            keepHooks(entry.ctx, 'show');
            flushPostJobs();
          } else {
            const ctx = keep ? { insts: new Set(), visible: true } : null;
            const prev = currentKeep;
            currentKeep = ctx || currentKeep;
            try { entry = { key, ctx, block: owner ? owner.run(mount) : mount(), frag: ctx && document.createDocumentFragment() }; }
            finally { currentKeep = prev; }
            if (keep) {
              cache.set(key, entry);
              if (max && cache.size > max) { // the one used longest ago goes
                const [oldKey, oldest] = cache.entries().next().value;
                cache.delete(oldKey);
                oldest.block.remove();
              }
            }
          }
          cur = entry;
          if (playIn) animateRange(entry.block.start, entry.block.end, anim, 'in');
        };
        const old = cur;
        cur = null;
        if (old && anim && anim.after) putAway(old, enter);
        else { if (old) putAway(old); enter(); }
      },
    };
  }
  function readSwitchOptions(el) {
    const anim = readAnimate(el);
    let keep = false, max = 0;
    if (el.hasAttribute('keep')) {
      keep = true;
      max = parseInt(el.getAttribute('keep'), 10) || 0; // keep="5": at most 5 kept
      el.removeAttribute('keep');
    }
    return { anim, keep, max };
  }

  /* ---------- <som-component :is> ---------- */
  function compileDynamic(el, scope, inst) {
    const isExpr = el.getAttribute(':is') || el.getAttribute('s-bind:is');
    const staticIs = el.getAttribute('is');
    ['is', ':is', 's-bind:is'].forEach((a) => el.removeAttribute(a));
    const options = readSwitchOptions(el);
    const anchor = text();
    el.parentNode.insertBefore(anchor, el);
    el.remove();
    const sw = makeSwitch(anchor, options);
    let cur;
    renderEffect(() => {
      const is = isExpr ? evaluate(scope, isExpr, el) : staticIs;
      if (is === cur) return;
      cur = is;
      if (!is) return sw.show(null);
      const def = typeof is === 'string' ? (isSomUrl(is) ? somComponent(is) : resolveComponent(is, inst)) : is;
      sw.show(def || is, () => {
        if (def) return mountBlock(anchor.parentNode, anchor, el, scope, inst, (node) => mountComponent(node, def, scope, inst));
        const tag = String(is || '').trim();
        if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(tag) || BLOCKED_DYNAMIC_TAGS.has(tag.toLowerCase())) {
          warn(`Blocked invalid or unsafe dynamic tag "<${tag}>" in <som-component>.`);
          return null;
        }
        const clone = document.createElement(tag);
        for (const { name, value } of [...el.attributes]) clone.setAttribute(name, value);
        for (const child of [...el.childNodes]) clone.appendChild(child.cloneNode(true));
        return mountBlock(anchor.parentNode, anchor, clone, scope, inst);
      });
    });
  }

  /* ---------- <som-view>: the page for the current route (nested views show child routes) ----------
   * Layouts: the page is shown inside a layout component, in its <slot>.
   *   Som.router({ layout: 'app', routes })            every page uses layouts/app.som
   *   { path: '/admin', component: …, layout: 'admin' }  this route (and its children) use layouts/admin.som
   *   layout admin                                       in a page's .som file: this page uses it
   *   layout none / layout: false                        no layout
   * Moving between pages with the same layout keeps the layout on the page (its state stays).
   * ------------------------------------------------------------------------------------------- */
  const NO_LAYOUT = { __noLayout: true };
  const pageGates = new Map();
  let gateUid = 0;
  function layoutDef(router, spec) {
    if (spec == null || spec === false || spec === 'none' || spec === '') return NO_LAYOUT;
    if (typeof spec !== 'string') return spec; // a component object
    const named = router.__layouts && router.__layouts[spec];
    if (named) return typeof named === 'string' ? somComponent(named) : named;
    return somComponent(isSomUrl(spec) ? spec : 'layouts/' + spec + '.som');
  }
  function compileView(el, scope, inst) {
    const router = inst && inst.provides[ROUTER_KEY];
    const anchor = text();
    el.parentNode.insertBefore(anchor, el);
    const pageOnly = el.hasAttribute('s-page');
    const gate = pageGates.get(el.getAttribute('s-page')); // the top view's choice of page, once its layout is known
    el.removeAttribute('s-page');
    el.remove();
    if (!router) return warn('<som-view> needs a router: app.use(Som.router({ routes }))');
    let depth = 0, inLayout = false;
    for (let i = inst; i; i = i.parent) {
      if (i.isLayout) inLayout = true;
      if (i.viewDepth != null) { depth = i.viewDepth + 1; break; }
    }
    const level = gate || (() => router.__levels.value[depth]);
    if (pageOnly || inLayout || depth > 0) return showPages(el, anchor, scope, inst, level, depth);

    // the top <som-view>: pick the layout first, then show the page inside it
    const outer = makeSwitch(anchor, { anim: null, keep: false, max: 0 });
    const loaded = ref(0), approved = shallowRef(null), gateId = String(++gateUid);
    pageGates.set(gateId, () => approved.value);
    onScopeDispose(() => pageGates.delete(gateId));
    let cur, first = true;
    renderEffect(() => {
      loaded.value;
      const lv = level();
      if (!lv) { cur = null; approved.value = null; return outer.show(null); }
      let spec = lv.layout; // from the route
      if (spec === undefined) {
        const def = lv.component;
        const d = def && def.__loader ? def.__resolved : def;
        if (def && def.__loader && def.__failed && router.__errors && !lv.isError) { // came back to a page that can't load
          const err = def.__failedError;
          return router.abort(500, err && err.message);
        }
        if (def && def.__loader && !d && !def.__failed) { // the page isn't loaded yet: its file may say which layout it wants
          const p = loadDef(def).then(() => { loaded.value++; }, (e) => {
            def.__failed = true;
            def.__failedError = e;
            if (router.__errors) { console.error('[Som error] the page could not be loaded:', e); return router.abort(500, e && e.message); } // errors/500.som
            loaded.value++; // the page reports its own error
          });
          if (first) waitFor(p);
          return;
        }
        spec = d && d.layout !== undefined ? d.layout : router.__layout;
      }
      first = false;
      const layout = layoutDef(router, spec);
      approved.value = lv;
      if (layout === cur) return;
      cur = layout;
      const page = el.cloneNode(true);
      page.setAttribute('s-page', gateId);
      if (layout === NO_LAYOUT) return outer.show(layout, () => mountBlock(anchor.parentNode, anchor, page, scope, inst));
      const host = document.createElement('som-layout');
      host.appendChild(page); // the page becomes the layout's <slot>
      outer.show(layout, () => mountBlock(anchor.parentNode, anchor, host, scope, inst, (node) =>
        mountComponent(node, layout, scope, inst, { isLayout: true })));
    });
  }
  function showPages(el, anchor, scope, inst, level, depth) {
    const sw = makeSwitch(anchor, readSwitchOptions(el));
    let cur;
    renderEffect(() => {
      const lv = level();
      const def = lv ? lv.component : null;
      if (def === cur) return;
      cur = def;
      if (!def) return sw.show(null);
      sw.show(def, () => mountBlock(anchor.parentNode, anchor, el, scope, inst, (node) =>
        mountComponent(node, def, scope, inst, { viewDepth: depth, liveProps: () => (level() || {}).props })));
    });
  }

  /* ---------- sections & yields ----------
   *   in a page:    <som-section name="actions"><button>New</button></som-section>
   *   in a layout:  <som-yield name="actions">shown when the page has no such section</som-yield>
   * The section stays part of the page (its values, events and styles), shown where the layout says.
   * ------------------------------------------------------------------------------------------- */
  const sections = reactive({});
  function compileSection(el, scope, inst) {
    const name = el.getAttribute('name') || 'default';
    const tpl = document.createDocumentFragment();
    [...el.childNodes].forEach((n) => tpl.appendChild(n));
    el.remove();
    const entry = markRaw({ tpl, scope, inst, owner: activeScope });
    sections[name] = [...(sections[name] || []), entry];
    onScopeDispose(() => { sections[name] = (sections[name] || []).filter((e) => e !== entry); });
  }
  function compileYield(el, scope, inst) {
    const name = el.getAttribute('name') || 'default';
    const anchor = text();
    el.parentNode.insertBefore(anchor, el);
    const fallback = document.createDocumentFragment();
    [...el.childNodes].forEach((n) => fallback.appendChild(n));
    el.remove();
    let cur, block = null;
    renderEffect(() => {
      const list = sections[name] || [];
      const top = list[list.length - 1] || null; // the newest page wins
      if (top === cur && block) return;
      cur = top;
      if (block) block.remove();
      const mount = () => (top
        ? mountBlock(anchor.parentNode, anchor, top.tpl, top.scope, top.inst)
        : mountBlock(anchor.parentNode, anchor, fallback, scope, inst));
      block = top && top.owner ? top.owner.run(mount) : mount();
    });
    onScopeDispose(() => { if (block) block.remove(); });
  }

  /* ---------- <som-wait>: show something else until everything inside has loaded ----------
   *   <som-wait>
   *     <UserList />                          (its .som file, `load` data, async `on start`)
   *     <p s-waiting>Loading…</p>
   *     <p s-failed="error">Could not load: {error.message}</p>
   *   </som-wait>
   * ------------------------------------------------------------------------------------- */
  let currentWait = null, setupWaits = null;
  function waitFor(p) {
    const w = currentWait;
    if (!w || !p || !isFunction(p.then)) return p;
    if (setupWaits) setupWaits.push(p);
    w.pending++;
    p.then(() => w.settle(), (e) => w.settle(e || new Error('failed')));
    return p;
  }
  function compileWait(el, scope, inst) {
    const anchor = text();
    el.parentNode.insertBefore(anchor, el);
    el.remove();
    let waitingTpl = null, failedTpl = null, failedName = 'error';
    const content = document.createDocumentFragment();
    [...el.childNodes].forEach((n) => {
      if (n.nodeType === 1 && n.hasAttribute('s-waiting')) { n.removeAttribute('s-waiting'); waitingTpl = n; }
      else if (n.nodeType === 1 && n.hasAttribute('s-failed')) {
        failedName = n.getAttribute('s-failed') || 'error';
        n.removeAttribute('s-failed');
        failedTpl = n;
      } else content.appendChild(n);
    });
    const owner = activeScope;
    let waiting = null, over = false, block = null;
    const finish = () => {
      if (over || (owner && !owner.active)) return;
      over = true;
      if (waiting) waiting.remove();
      if (w.error && failedTpl) {
        block.remove();
        const show = () => mountBlock(anchor.parentNode, anchor, failedTpl, createChildScope(scope, { [failedName]: w.error }), inst);
        owner ? owner.run(show) : show();
      } else {
        if (w.error) console.error('[Som error] inside <som-wait>', w.error);
        block.move(anchor.parentNode, anchor);
        flushPostJobs();
      }
    };
    const w = {
      pending: 0, error: null, showsErrors: !!failedTpl,
      settle(e) {
        w.pending--;
        if (e && !w.error) w.error = e;
        resolvedPromise.then(() => { if (w.error || w.pending <= 0) finish(); });
      },
    };
    const holder = document.createDocumentFragment(); // built off the page, put in when ready
    const prev = currentWait;
    currentWait = w;
    try { block = mountBlock(holder, null, content, scope, inst); } finally { currentWait = prev; }
    if (!w.pending) return finish();
    if (waitingTpl) waiting = mountBlock(anchor.parentNode, anchor, waitingTpl, scope, inst);
  }

  /* ---------- <som-portal to="body"> ---------- */
  function compileTeleport(el, scope, inst) {
    const to = el.getAttribute('to');
    const target = to && document.querySelector(to);
    const frag = document.createDocumentFragment();
    [...el.childNodes].forEach((n) => frag.appendChild(n));
    el.remove();
    if (!target) return warn(`Teleport target "${to}" not found.`);
    const b = mountBlock(target, null, frag, scope, inst);
    onScopeDispose(() => removeRange(b.start, b.end));
  }

  /* ================================================================
   * Components
   * ================================================================ */
  let compUid = 0;
  let currentInstance = null;
  const getCurrentInstance = () => currentInstance;

  function resolveComponent(name, inst) {
    if (!inst) return null;
    return resolveFrom(inst.def.components, name) || inst.appContext.components[normKey(name)] || null;
  }
  function normalizePropsOptions(raw) {
    const out = {};
    if (!raw) return out;
    if (isArray(raw)) raw.forEach((k) => (out[camelize(k)] = {}));
    else for (const k in raw) {
      const o = raw[k];
      out[camelize(k)] = isFunction(o) || isArray(o) ? { type: o } : o || {};
    }
    return out;
  }
  const hasType = (opt, T) => opt.type === T || (isArray(opt.type) && opt.type.includes(T));
  function resolvePropValue(opt, value, present) {
    if (value === undefined && hasOwn(opt, 'default')) {
      const d = opt.default;
      value = isFunction(d) && !hasType(opt, Function) ? d() : d;
    }
    if (hasType(opt, Boolean)) {
      if (!present && value === undefined) value = false;
      else if (value === '' && !hasType(opt, String)) value = true; // <my-comp disabled>
    }
    return value;
  }

  const VOID_RE = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
  // the HTML parser doesn't understand <my-comp />, so expand it to <my-comp></my-comp>
  const expandSelfClosing = (html) =>
    html.replace(
      /<([A-Za-z][\w-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/>/g,
      (m, tag, attrs) => (VOID_RE.test(tag) ? m : `<${tag}${attrs}></${tag}>`)
    );
  // disabled={count === 0} → disabled="{count === 0}" (HTML can't parse spaces in unquoted values)
  const SVG_TAGS = /^(svg|path|circle|rect|line|polyline|polygon|ellipse|g|use|text|tspan|stop|lineargradient|radialgradient|mask|clippath|pattern|symbol|image|foreignobject)$/;
  function quoteBraceAttrs(html) {
    let out = '', i = 0;
    while (i < html.length) {
      const lt = html.indexOf('<', i);
      if (lt < 0) { out += html.slice(i); break; }
      out += html.slice(i, lt + 1);
      i = lt + 1;
      if (!/[A-Za-z]/.test(html[i] || '')) continue; // not a tag: text, comment, </close>
      while (i < html.length && html[i] !== '>') { // inside a start tag
        const c = html[i];
        if (c === '"' || c === "'") {
          const e = html.indexOf(c, i + 1);
          const end = e < 0 ? html.length : e + 1;
          out += html.slice(i, end);
          i = end;
          continue;
        }
        if (c === '=' && html[i + 1] === '{') {
          let end = -1;
          try { end = matchBrace(html, i + 1); } catch (_) { /* leave it */ }
          if (end > 0) {
            // SVG attributes the browser checks while it reads the page (d, points, viewBox…) get the expression as
            // :name="…" instead, so `{…}` never sits in them, even for a moment (no "Expected moveto" errors)
            const tag = (out.slice(out.lastIndexOf('<') + 1).match(/^[\w-]+/) || [''])[0].toLowerCase();
            const svgAttr = SVG_TAGS.test(tag) && /(\s)(d|points|viewBox|transform|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|offset|fill|stroke|stroke-width|stroke-dasharray|pathLength)$/.test(out);
            if (svgAttr) {
              out = out.replace(/(\s)([\w-]+)$/, (m, sp, name) => `${sp}:${name}`);
              out += '="' + html.slice(i + 2, end - 1).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
            } else out += '="' + html.slice(i + 1, end).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
            i = end;
            continue;
          }
        }
        out += c;
        i++;
      }
    }
    return out;
  }
  /* {for user in users key user.id} … {empty} … {/for}  →  <template s-each> … <template s-empty> */
  const escAttr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  function expandBlocks(html) {
    if (!/\{\s*(?:for\b|\/for\s*\}|empty\s*\})/.test(html)) return html;
    let out = '', i = 0;
    const open = [];
    const line = (at) => html.slice(0, at).split('\n').length;
    while (i < html.length) {
      const c = html[i];
      if (c === '\\' && html[i + 1] === '{') { out += '\\{'; i += 2; continue; }
      if (c === '{') {
        const head = /^\{\s*(\/for|empty|for)\b/.exec(html.slice(i, i + 16));
        let end = -1;
        if (head) { try { end = matchBrace(html, i); } catch (_) { end = -1; } }
        if (head && end > 0) {
          const inner = html.slice(i + 1, end - 1).trim();
          if (inner === '/for') {
            if (!open.length) throw new SyntaxError(`{/for} without a {for} (line ${line(i)})`);
            open.pop();
            out += '</template>';
            i = end;
            continue;
          }
          if (inner === 'empty') {
            const top = open[open.length - 1];
            if (!top || top.empty) throw new SyntaxError(`{empty} must be inside a {for} … {/for} (line ${line(i)})`);
            top.empty = true;
            out += '</template><template s-empty>';
            i = end;
            continue;
          }
          if (/^for\s/.test(inner) || /^for\(/.test(inner)) {
            let body = inner.slice(3).trim();
            let animAttr = ''; // {for item in list key item.id animate slide}
            const am = body.match(/\s+animate(\.[\w.]+)?\s+([\w-]+)\s*$/);
            if (am) { body = body.slice(0, am.index); animAttr = ` s-animate${am[1] || ''}="${am[2]}"`; }
            const km = body.match(/^([\s\S]+?\s(?:in|of)\s[\s\S]+?)\s+key\s+([\s\S]+)$/);
            const loop = km ? km[1] : body;
            if (!forAliasRE.test(loop)) throw new SyntaxError(`Write a loop like {for user in users} (line ${line(i)})`);
            open.push({ empty: false });
            out += `<template s-each="${escAttr(loop)}"${km ? ` s-key="${escAttr(km[2])}"` : ''}${animAttr}>`;
            i = end;
            continue;
          }
        }
      }
      out += c;
      i++;
    }
    if (open.length) throw new SyntaxError('A {for} block is missing its {/for}');
    return out;
  }
  function getTemplate(def) {
    if (def.__tpl) return def.__tpl;
    let src = def.template;
    if (src == null) { warn('Component is missing a template.', def); src = ''; }
    if (src[0] === '#') {
      const n = document.querySelector(src);
      src = n ? (n.tagName === 'TEMPLATE' ? n.innerHTML : n.textContent) : '';
    }
    const t = document.createElement('template');
    t.innerHTML = quoteBraceAttrs(expandBlocks(expandSelfClosing(src)));
    if (def.__scopeId) markScope(t.content, def.__scopeId); // <style scoped>
    return (def.__tpl = t.content);
  }

  const publicGetters = {
    $el: (i) => i.getEl(),
    $props: (i) => i.props,
    $attrs: (i) => i.attrs,
    $slots: (i) => ciProxy(i.slots),
    $refs: (i) => i.refs,
    $send: (i) => i.emit,
    send: (i) => i.emit,
    $parent: (i) => i.parent && i.parent.ctx,
    $root: (i) => i.root.ctx,
    $tick: () => nextTick,
    $bus: () => bus,
    $store: () => stores,
    env: () => Som.env, // PUBLIC_ values from .env, in views and scripts: {env.PUBLIC_APP_NAME}
    abort: () => abortPage, // abort(404): the error page for this address
    $env: () => Som.env,
    $watch: (i) => (src, cb, o) =>
      i.scope.run(() => doWatch(typeof src === 'string' ? () => getPath(i.ctx, src) : src.bind(i.ctx), cb.bind(i.ctx), o)),
    $t: () => getTranslation,
    $trans: () => getTranslation,
    $__: () => getTranslation,
    $choice: () => choiceTranslation,
    $trans_choice: () => choiceTranslation,
    $locale: () => getLocale,
    $dir: () => (loc) => (isRtlLocale(loc || currentLocaleRef.value) ? 'rtl' : 'ltr'),
  };

  // The object templates (and `this` in Options API) read from
  function createCtx(inst) {
    const globals = inst.appContext.config.globals;
    const find = (k) => [inst.setupState, inst.data, inst.opts].find((s) => hasOwn(toRaw(s), k));
    return new Proxy({}, {
      get(_, k) {
        if (typeof k === 'symbol') return undefined;
        const s = find(k);
        if (s) return s[k];
        if (hasOwn(inst.propsOptions, k)) return inst.props[k];
        if (hasOwn(publicGetters, k)) return publicGetters[k](inst);
        if (hasOwn(globals, k)) return globals[k];
        if (hasOwn(Som, k)) return Som[k];
        return undefined;
      },
      set(_, k, v) {
        const s = find(k);
        if (s) s[k] = v;
        else if (hasOwn(inst.propsOptions, k)) warn(`Attempting to mutate prop "${k}". Props are readonly.`);
        else inst.data[k] = v;
        return true;
      },
      has(_, k) {
        return typeof k === 'string' &&
          (!!find(k) || hasOwn(inst.propsOptions, k) || hasOwn(publicGetters, k) || hasOwn(globals, k) || hasOwn(Som, k));
      },
    });
  }

  function setupComponent(inst) {
    const { def, ctx } = inst;
    if (def.init) {
      const res = def.init(shallowReadonly(inst.props), {
        send: inst.emit, attrs: inst.attrs, slots: ciProxy(inst.slots), expose: (o) => { inst.exposed = o || {}; },
      });
      if (isObject(res)) inst.setupState = isReactive(res) ? res : reactive(res);
    }
    const opts = toRaw(inst.opts);
    // receive: ['theme'] or { color: 'theme' } or { color: { from: 'theme', fallback: 'light' } }
    if (def.receive) {
      const list = isArray(def.receive)
        ? def.receive.map((k) => [k, { from: k }])
        : Object.entries(def.receive).map(([k, v]) => [k, isObject(v) ? v : { from: v }]);
      list.forEach(([k, o]) => { opts[k] = receive(o.from || k, o.fallback); });
    }
    // Plain values = state, getters = derived values, functions = methods
    for (const k of Object.keys(def)) {
      if (RESERVED_KEYS.has(k) || k.startsWith('__')) continue;
      const d = Object.getOwnPropertyDescriptor(def, k);
      if (d.get) {
        opts[k] = computed({ get: () => d.get.call(ctx), set: d.set ? (v) => d.set.call(ctx, v) : undefined });
      } else if (isFunction(d.value)) {
        opts[k] = d.value.bind(ctx);
      } else {
        toRaw(inst.data)[k] = cloneState(d.value); // each instance gets its own copy; stores stay shared
      }
    }
    if (def.watch) for (const key in def.watch) {
      [].concat(def.watch[key]).forEach((w) => {
        const h = typeof w === 'string' ? ctx[w]
          : isFunction(w) ? w.bind(ctx)
          : typeof w.handler === 'string' ? ctx[w.handler] : w.handler.bind(ctx);
        doWatch(() => getPath(ctx, key), h, isObject(w) ? w : {});
      });
    }
    if (def.share) {
      const p = isFunction(def.share) ? def.share.call(ctx) : def.share;
      Reflect.ownKeys(p).forEach((k) => { inst.provides[k] = p[k]; });
    }
    if (def.saved) {
      [].concat(def.saved).forEach((k) => {
        const key = `${def.__name || 'app'}.${k}`;
        if (storage.has(key)) ctx[k] = storage.get(key);
        keepSaved(() => ctx[k], (v) => { ctx[k] = v; }, key);
      });
    }
    if (def.start) waitFor(safeCall(def.start, ctx)); // an async start() is waited for by <som-wait>
    ['ready', 'destroy', 'destroyed', 'update', 'show', 'hide'].forEach((h) => { if (def[h]) inst.hooks[h].push(def[h]); });
  }

  const RESERVED_KEYS = new Set([
    'template', 'templateUrl', 'saved', 'props', 'events', 'components', 'directives', 'init',
    'watch', 'share', 'receive', 'start', 'ready', 'destroy', 'destroyed', 'passAttrs', 'update', 'show', 'hide',
  ]);
  function cloneState(v) {
    if (!isObject(v) || isReactive(v) || isRef(v) || v[SKIP]) return v; // reactive stores are shared on purpose
    try { return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)); }
    catch (_) { return v; }
  }

  function mountComponent(el, def, parentScope, parentInst, options = {}) {
    if (typeof def === 'string') def = somComponent(def); // 'components/Card.som'
    if (def.__loader && def.__resolved) def = def.__resolved;
    if (isFunction(def)) def = { init: def };
    if (def.__loader || (def.templateUrl && !def.__tpl)) {
      // async component or template file: show nothing, load, then mount in the same place
      const anchor = text();
      el.parentNode.insertBefore(anchor, el);
      el.remove();
      const owner = activeScope, waitCtx = currentWait, keepCtx = currentKeep;
      const loading = loadDef(def).then((resolved) => {
        if (!anchor.parentNode || (owner && !owner.active)) return;
        const run = () => mountBlock(anchor.parentNode, anchor, el, parentScope, parentInst,
          (node) => mountComponent(node, resolved, parentScope, parentInst, options));
        const pw = currentWait, pk = currentKeep;
        currentWait = waitCtx; // a <som-wait> or `keep` around it still counts once it has loaded
        currentKeep = keepCtx;
        try { owner ? owner.run(run) : run(); } finally { currentWait = pw; currentKeep = pk; }
      });
      waitFor(loading);
      loading.catch((e) => console.error('[Som error] failed to load component', e));
      return null;
    }
    const appContext = parentInst ? parentInst.appContext : options.appContext;
    const parent = el.parentNode;
    const start = text(), end = text();
    parent.insertBefore(start, el);

    const propsOptions = def.__props || (def.__props = normalizePropsOptions(def.props));
    const propNorm = {};
    for (const k in propsOptions) propNorm[normKey(k)] = k;

    const props = reactive({});
    const attrs = reactive({});
    const listeners = [];
    const staticProps = {}, dynamicProps = [], dynamicAttrs = [];
    let refName = null, showExpr = null, spreadExpr = null;

    // ----- read attributes from the component tag -----
    for (let { name, value } of [...el.attributes]) {
      if (name === 's-ref') { refName = value; continue; }
      if (name[0] === '@' || name.startsWith('s-')) value = stripBrace(value);
      if (name === 's-slot' || name.startsWith('s-slot:') || name === 's-cloak') continue;
      if (name === 's-show') { showExpr = value; continue; }
      if (name.startsWith('s-model')) {
        const arg = name.split('.')[0].split(':')[1] || 'modelValue';
        dynamicProps.push([propNorm[normKey(arg)] || camelize(arg), value]);
        listeners.push({ norm: normKey('update:' + arg), handler: (v) => assign(parentScope, value, v) });
        continue;
      }
      if (name[0] === '@' || name.startsWith('s-on:')) {
        const raw = name[0] === '@' ? name.slice(1) : name.slice(5);
        listeners.push({ raw, expr: value, norm: normKey(raw.split('.')[0]), handler: (...args) => invokeHandler(parentScope, value, args, true) });
        continue;
      }
      if (name === 's-bind') { spreadExpr = value; continue; }
      let key = name, dynamic = false;
      if (name[0] === ':') { key = name.slice(1); dynamic = true; }
      else if (name.startsWith('s-bind:')) { key = name.slice(7); dynamic = true; }
      else if (name.startsWith('s-')) { warn(`Directive "${name}" is not supported on components.`); continue; }
      else if (value.includes('{')) { // title={expr} or title="Hi {name}"
        const expr = exactBrace(value) ?? interpToExpr(value);
        if (expr != null) { value = expr; dynamic = true; }
      }
      key = key.split('.')[0];
      if (key === 'key') continue;
      const pk = propNorm[normKey(key)];
      if (pk) dynamic ? dynamicProps.push([pk, value]) : (staticProps[pk] = value);
      else if (dynamic) dynamicAttrs.push([key, value]);
      else attrs[key] = value;
    }

    // ----- props -----
    const extra = options.props || {};
    for (const k in propsOptions) {
      if (dynamicProps.some((d) => d[0] === k)) continue;
      const opt = propsOptions[k];
      let v, present = false;
      if (hasOwn(staticProps, k)) {
        v = staticProps[k];
        present = true;
        if (hasType(opt, Number) && v !== '' && !isNaN(v)) v = Number(v);
      } else if (hasOwn(extra, k)) { v = extra[k]; present = true; }
      props[k] = resolvePropValue(opt, v, present);
      if (opt.required && !present) warn(`Missing required prop: "${k}"`);
    }
    for (const k in extra) if (!hasOwn(propsOptions, k)) attrs[k] = extra[k];
    dynamicProps.forEach(([k, expr]) => {
      if (!hasOwn(propsOptions, k)) return void dynamicAttrs.push([k, expr]);
      renderEffect(() => { props[k] = resolvePropValue(propsOptions[k], evaluate(parentScope, expr, el), true); });
    });
    dynamicAttrs.forEach(([k, expr]) => renderEffect(() => { attrs[k] = evaluate(parentScope, expr, el); }));
    if (options.liveProps) renderEffect(() => { // props that follow the route (<som-view>)
      const o = options.liveProps() || {};
      for (const k in o) { const pk = propNorm[normKey(k)]; if (pk) props[pk] = resolvePropValue(propsOptions[pk], o[k], true); else attrs[k] = o[k]; }
    });
    if (spreadExpr) renderEffect(() => {
      const o = evaluate(parentScope, spreadExpr, el) || {};
      for (const k in o) { const pk = propNorm[normKey(k)]; if (pk) props[pk] = o[k]; else attrs[k] = o[k]; }
    });

    // ----- slots: children of the component tag, compiled later in the parent's scope -----
    const slots = {};
    const defaultFrag = document.createDocumentFragment();
    let hasDefault = false, ownPattern;
    for (const a of el.attributes) if (a.name === 's-slot' || a.name === 's-slot:default') ownPattern = a.value;
    [...el.childNodes].forEach((n) => {
      if (n.nodeType === 1 && n.tagName === 'TEMPLATE') {
        const sa = [...n.attributes].find((a) => a.name === 's-slot' || a.name.startsWith('s-slot:'));
        if (sa) {
          const sname = sa.name.slice(7) || 'default';
          slots[normKey(sname)] = { tpl: n.content, pattern: sa.value, scope: parentScope, inst: parentInst };
          return;
        }
      }
      if (n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim())) hasDefault = true;
      defaultFrag.appendChild(n);
    });
    if (hasDefault && !slots.default) slots.default = { tpl: defaultFrag, pattern: ownPattern, scope: parentScope, inst: parentInst };

    // ----- instance -----
    const inst = {
      uid: compUid++, def, parent: parentInst, appContext, props, attrs, slots, listeners, propsOptions,
      refs: {}, exposed: null, isMounted: false,
      provides: Object.create(parentInst ? parentInst.provides : appContext.provides),
      hooks: { ready: [], destroy: [], destroyed: [], update: [], show: [], hide: [] },
      setupState: reactive({}), data: reactive({}), opts: reactive({}),
    };
    inst.root = parentInst ? parentInst.root : inst;
    if (options.viewDepth != null) inst.viewDepth = options.viewDepth;
    if (options.isLayout) inst.isLayout = true;
    inst.keep = currentKeep || (parentInst && parentInst.keep) || null;
    if (inst.keep) inst.keep.insts.add(inst);
    if (devMode()) {
      liveInstances.add(inst);
      inst.hot = { el: el.cloneNode(true), parentScope, options, owner: activeScope, start: () => start, end: () => end };
    }
    const emitsList = def.events ? (isArray(def.events) ? def.events : Object.keys(def.events)).map(normKey) : null;
    inst.emit = (event, ...args) => {
      const n = normKey(event);
      listeners.forEach((l) => { if (l.norm === n) l.handler(...args); });
    };
    inst.getEl = () => {
      for (let n = start.nextSibling; n && n !== end; n = n.nextSibling) if (n.nodeType === 1) return n;
      return null;
    };
    inst.ctx = createCtx(inst);
    inst.scope = new EffectScope();
    inst.scope.beforeStops.push(() => inst.hooks.destroy.forEach((h) => safeCall(h, inst.ctx)));
    inst.scope.cleanups.push(() => {
      inst.isMounted = false;
      if (inst.keep) inst.keep.insts.delete(inst);
      liveInstances.delete(inst);
      inst.hooks.destroyed.forEach((h) => safeCall(h, inst.ctx));
    });

    // inside <som-wait>, a component whose `load` / async `on start` is still running draws its view
    // only once they are done (like an async setup), so the view never sees half-loaded data
    const setupDone = [];
    const buildView = () => {
      const f = getTemplate(def).cloneNode(true);
      pauseTracking();
      const prevOwner = renderOwner;
      renderOwner = inst;
      try { compileNodes(f, [...f.childNodes], inst.ctx, inst); } finally { resetTracking(); renderOwner = prevOwner; }

      // attribute fallthrough: class / style / id / native listeners land on the single root element
      const roots = [...f.childNodes].filter((n) => n.nodeType === 1);
      const native = listeners.filter((l) => l.raw && (!emitsList || !emitsList.includes(l.norm)));
      if (roots.length === 1) {
        const root = roots[0];
        if (def.passAttrs !== false) applyFallthrough(root, attrs, 'a' + inst.uid);
        native.forEach((l) => bindEvent(root, l.raw, l.expr, parentScope));
        if (showExpr) bindShow(root, showExpr, parentScope);
      } else if (roots.length > 1 && def.passAttrs !== false && Object.keys(toRaw(attrs)).length) {
        warn('Extraneous non-props attributes were passed to a component with multiple root nodes.');
      }
      return f;
    };
    const frag = inst.scope.run(() => {
      const prev = currentInstance, prevWaits = setupWaits;
      currentInstance = inst;
      setupWaits = currentWait ? setupDone : null;
      try { setupComponent(inst); }
      catch (e) { console.error('[Som error] while creating component', def.__name || '', e); }
      finally { currentInstance = prev; setupWaits = prevWaits; }
      return setupDone.length ? document.createDocumentFragment() : buildView();
    });

    parent.insertBefore(frag, el);
    parent.insertBefore(end, el);
    el.remove();
    if (refName && parentInst) setRef(parentInst, refName, inst.exposed ? reactive(inst.exposed) : inst.ctx);
    const mountedJob = () => {
      inst.isMounted = true;
      // run inside the component's scope, so watchers and bus listeners made here are removed with it
      inst.scope.run(() => {
        inst.hooks.ready.forEach((h) => safeCall(h, inst.ctx));
        if (inst.keep) inst.hooks.show.forEach((h) => safeCall(h, inst.ctx)); // a kept one is shown the first time too
      });
    };
    if (setupDone.length) {
      const waitCtx = currentWait, keepCtx = currentKeep;
      waitFor(Promise.all(setupDone).then(() => {
        if (!inst.scope.active) return;
        const pw = currentWait, pk = currentKeep;
        currentWait = waitCtx; // components inside the view still count for the same <som-wait>
        currentKeep = keepCtx;
        try {
          end.parentNode.insertBefore(inst.scope.run(buildView), end);
          inst.scope.run(() => queuePostJob(mountedJob, start));
        } finally { currentWait = pw; currentKeep = pk; }
      }, () => { /* failed: the <som-wait> shows its s-failed part */ }));
      return inst;
    }
    inst.scope.run(() => queuePostJob(mountedJob, start)); // waits until the component is on the page
    if (start.isConnected) flushPostJobs();
    return inst;
  }

  function applyFallthrough(root, attrs, id) {
    const applied = new Set();
    renderEffect(() => {
      const keys = Object.keys(attrs);
      applied.forEach((k) => { if (!keys.includes(k)) { root.removeAttribute(k); applied.delete(k); } });
      setClassPart(root, id, attrs.class);
      setStylePart(root, id, attrs.style);
      keys.forEach((k) => {
        if (k !== 'class' && k !== 'style') { setAttr(root, k, attrs[k]); applied.add(k); }
      });
    });
  }

  /* ---------- share / receive / lifecycle (inside init) ---------- */
  function share(key, value) {
    if (!currentInstance) return warn('share() can only be used inside init().');
    currentInstance.provides[key] = value;
  }
  function receive(key, fallback) {
    const inst = currentInstance;
    if (!inst) return warn('receive() can only be used inside init().');
    const provides = inst.parent ? inst.parent.provides : inst.appContext.provides;
    if (key in provides) return provides[key];
    if (arguments.length > 1) return fallback;
    warn(`Nothing was shared with the key "${String(key)}".`);
  }
  const hook = (type, label) => (fn) => {
    if (currentInstance) currentInstance.hooks[type].push(fn);
    else warn(`${label}() can only be used inside init().`);
  };
  const onReady = hook('ready', 'onReady');
  const onDestroy = hook('destroy', 'onDestroy');
  const onDestroyed = hook('destroyed', 'onDestroyed');
  const onUpdate = hook('update', 'onUpdate');
  const onShow = hook('show', 'onShow'); // a kept page or component comes back (see `keep`)
  const onHide = hook('hide', 'onHide'); // … or is put away
  // Modern Vue/composition aliases
  const onMounted = onReady;
  const onUnmounted = onDestroyed;
  const onBeforeUnmount = onDestroy;
  const onUpdated = onUpdate;

  // Auto-cleaning timer helpers to prevent background memory leaks on navigation
  function useInterval(fn, ms = 1000) {
    const id = setInterval(fn, ms);
    if (activeScope) activeScope.cleanups.push(() => clearInterval(id));
    return () => clearInterval(id);
  }
  function useTimeout(fn, ms = 0) {
    const id = setTimeout(fn, ms);
    if (activeScope) activeScope.cleanups.push(() => clearTimeout(id));
    return () => clearTimeout(id);
  }

  // Inactivity watchdog for dashboards: tracks user interaction (mouse, touch, keyboard)
  // and auto-redirects to login upon session expiration
  function useInactivityTimer(options = {}) {
    const cfg = typeof options === 'number' ? { timeout: options } : (options || {});
    const envVal = typeof env !== 'undefined' && env && (env.PUBLIC_SESSION_TIMEOUT || env.SESSION_TIMEOUT);
    const timeoutMs = (cfg.timeout != null ? cfg.timeout : (envVal ? Number(envVal) * 60000 : 15 * 60000));
    const warningMs = cfg.warningTime != null ? cfg.warningTime : ((typeof env !== 'undefined' && env && env.PUBLIC_SESSION_WARNING) ? Number(env.PUBLIC_SESSION_WARNING) * 60000 : 0);
    const rawRedirect = String(cfg.redirect || '/login?reason=inactive');
    const redirectUrl = /^\/(?!\/)/.test(rawRedirect) ? rawRedirect : '/login?reason=inactive';
    const events = cfg.events || ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

    let timer = null;
    let warningTimer = null;

    function reset() {
      if (timer) clearTimeout(timer);
      if (warningTimer) clearTimeout(warningTimer);

      if (warningMs > 0 && warningMs < timeoutMs && typeof cfg.onWarning === 'function') {
        warningTimer = setTimeout(() => {
          cfg.onWarning({ remainingMs: warningMs, remainingMinutes: Math.round(warningMs / 60000) });
        }, timeoutMs - warningMs);
      }

      timer = setTimeout(() => {
        if (typeof cfg.onTimeout === 'function') {
          cfg.onTimeout();
        } else if (typeof window !== 'undefined') {
          if (typeof Som !== 'undefined' && Som.currentRouter && Som.currentRouter()) {
            Som.currentRouter().go(redirectUrl);
          } else {
            window.location.href = redirectUrl;
          }
        }
      }, timeoutMs);
    }

    function stop() {
      if (timer) clearTimeout(timer);
      if (warningTimer) clearTimeout(warningTimer);
      if (typeof window !== 'undefined') {
        events.forEach((evt) => window.removeEventListener(evt, reset, { passive: true }));
      }
    }

    if (typeof window !== 'undefined') {
      events.forEach((evt) => window.addEventListener(evt, reset, { passive: true }));
    }
    reset();

    if (activeScope) activeScope.cleanups.push(stop);

    return { reset, stop, timeoutMs };
  }

  /* ================================================================
   * Som.app — create an application
   * ================================================================ */
  function createApp(rootComponent = {}, rootProps) {
    const context = {
      components: Object.create(null),
      directives: Object.create(null),
      provides: Object.create(null),
      config: { globals: {} },
    };
    let appScope = null, container = null, rootInst = null;
    const app = {
      version: VERSION,
      globals: context.config.globals,
      component(name, def) {
        if (!def) return context.components[normKey(name)];
        if (isObject(def) && !def.__label && !def.__loader) def.__label = name; // shown in DevTools
        context.components[normKey(name)] = def;
        return app;
      },
      directive(name, def) {
        if (!def) return context.directives[normKey(name)];
        context.directives[normKey(name)] = def;
        return app;
      },
      share(key, value) { context.provides[key] = value; return app; },
      use(plugin, ...opts) {
        (isFunction(plugin) ? plugin : plugin.install)(app, ...opts);
        return app;
      },
      mount(target) {
        container = typeof target === 'string' ? document.querySelector(target) : target;
        if (!container) return warn(`Failed to mount app: "${target}" not found.`);
        if (rootInst) return warn('App has already been mounted.');
        // copy with descriptors so getters stay getters (computed)
        let def = rootComponent; // a .som path like 'App.som', or an object
        let source = container.innerHTML;
        if (container.hasAttribute('data-som-ssg')) { // a page made by `som build --prerender`: its first view came ready
          const t = document.querySelector('template[data-som-ssg-source]');
          source = t ? t.innerHTML : '';
          container.removeAttribute('data-som-ssg');
        }
        if (typeof def !== 'string') {
          def = Object.defineProperties({}, Object.getOwnPropertyDescriptors(rootComponent));
          if (!def.template) def.template = source; // in-DOM template
        }
        container.innerHTML = '';
        container.removeAttribute('s-cloak');
        const placeholder = document.createElement('div');
        container.appendChild(placeholder);
        appScope = new EffectScope(true);
        appScope.run(() => {
          rootInst = mountComponent(placeholder, def, null, null, { appContext: context, props: rootProps });
        });
        flushPostJobs();
        if (!rootInst) return undefined; // root uses templateUrl: it mounts when the file arrives
        return rootInst.exposed ? reactive(rootInst.exposed) : rootInst.ctx;
      },
      unmount() {
        if (appScope) appScope.stop();
        if (container) container.innerHTML = '';
        rootInst = null;
      },
    };
    return app;
  }

  /* ================================================================
   * state & shared stores — no .value, getters are derived values
   *   const cart = Som.store({
   *     items: [],
   *     get total() { return this.items.reduce((s, i) => s + i.price, 0) },
   *     add(item) { this.items.push(item) },
   *   })
   * ================================================================ */
  function state(obj = {}) {
    if (isArray(obj) || isReactive(obj)) return reactive(obj);
    const raw = {};
    const proxy = reactive(raw);
    for (const k of Object.keys(obj)) {
      const d = Object.getOwnPropertyDescriptor(obj, k);
      if (d.get) raw[k] = computed({ get: () => d.get.call(proxy), set: d.set ? (v) => d.set.call(proxy, v) : undefined });
      else if (isFunction(d.value)) raw[k] = d.value.bind(proxy);
      else raw[k] = d.value;
    }
    return proxy;
  }
  // Named stores: Som.store('cart', { … }) once, then Som.store('cart') or $store.cart anywhere.
  // Som.store('cart', { … }, { saved: true }) keeps its data in localStorage across reloads.
  const stores = reactive({});
  function store(name, obj, options = {}) {
    if (typeof name !== 'string') return state(name);
    if (obj !== undefined) {
      stores[name] = isReactive(obj) ? obj : state(obj);
      addStoreTools(stores[name], name);
      if (options.saved) {
        const fields = options.saved === true ? dataKeys(obj) : [].concat(options.saved);
        keepFields(stores[name], fields, 'store.' + name);
      }
    } else if (!(name in toRaw(stores))) warn(`Store "${name}" does not exist yet.`);
    return stores[name];
  }
  // every store gets $reset(), $patch() and $watch() (hidden: not saved, not looped over)
  const storeLog = [];
  function addStoreTools(st, name) {
    const raw = toRaw(st);
    if (hasOwn(raw, '$reset')) return;
    const fields = dataKeys(st);
    const initial = cloneState(Object.fromEntries(fields.map((k) => [k, raw[k]])));
    const hide = (k, v) => Object.defineProperty(raw, k, { value: v, enumerable: false, configurable: true });
    hide('$name', name);
    hide('$reset', () => { const fresh = cloneState(initial); fields.forEach((k) => { st[k] = fresh[k]; }); });
    hide('$patch', (change) => {
      if (isFunction(change)) change(st);
      else if (isObject(change)) Object.keys(change).forEach((k) => { st[k] = change[k]; });
    });
    hide('$watch', (fn) => doWatch(() => Object.fromEntries(fields.map((k) => [k, st[k]])), (now) => fn(now, st), { deep: true }));
    // functions become logged actions (for the DevTools panel's timeline)
    Object.keys(raw).forEach((k) => {
      if (!isFunction(raw[k]) || k[0] === '$') return;
      const fn = raw[k];
      raw[k] = function (...args) {
        if (devMode()) { storeLog.push({ store: name, action: k, args, at: Date.now() }); if (storeLog.length > 200) storeLog.shift(); }
        return fn.apply(this, args);
      };
    });
  }
  // plain values of an object (not getters, not functions)
  function dataKeys(obj) {
    return Object.keys(isReactive(obj) ? toRaw(obj) : obj).filter((k) => {
      const d = Object.getOwnPropertyDescriptor(isReactive(obj) ? toRaw(obj) : obj, k);
      return !d.get && !isFunction(d.value) && !isRef(d.value);
    });
  }

  /* ================================================================
   * Saved data — kept in localStorage, so it survives a page reload
   *   .som:  saved todos = []            (key: "<Component>.todos")
   *          saved theme = 'dark' as 'settings.theme'
   *   JS:    const theme = Som.saved('theme', 'dark')   → a signal
   *          Som.storage.get / set / remove / clear
   * Values are stored as JSON under "som:<key>". Changes in another tab show up here too.
   * ================================================================ */
  const STORAGE_PREFIX = 'som:';
  const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } };
  const storage = {
    has(key) { const s = ls(); try { return !!s && s.getItem(STORAGE_PREFIX + key) !== null; } catch (_) { return false; } },
    get(key, fallback) {
      const s = ls();
      try {
        const v = s && s.getItem(STORAGE_PREFIX + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (_) { return fallback; }
    },
    set(key, value) {
      const s = ls();
      if (!s) return;
      try { s.setItem(STORAGE_PREFIX + key, JSON.stringify(value === undefined ? null : value)); }
      catch (e) { warn(`Could not save "${key}" (storage full or blocked):`, e.message); }
    },
    remove(key) { const s = ls(); try { s && s.removeItem(STORAGE_PREFIX + key); } catch (_) { /* blocked */ } },
    clear() { // removes only what Som saved
      const s = ls();
      if (!s) return;
      try { Object.keys(s).filter((k) => k.startsWith(STORAGE_PREFIX)).forEach((k) => s.removeItem(k)); } catch (_) { /* blocked */ }
    },
    keys() { const s = ls(); try { return s ? Object.keys(s).filter((k) => k.startsWith(STORAGE_PREFIX)).map((k) => k.slice(STORAGE_PREFIX.length)) : []; } catch (_) { return []; } },
  };
  // save `get()` whenever it changes (deeply); load changes made in other tabs
  function keepSaved(get, set, key) {
    doWatch(get, (v) => storage.set(key, v), { deep: true });
    if (typeof window !== 'undefined' && window.addEventListener) {
      const onStorage = (e) => {
        if (e.key !== STORAGE_PREFIX + key || e.newValue == null) return;
        try { set(JSON.parse(e.newValue)); } catch (_) { /* not JSON */ }
      };
      window.addEventListener('storage', onStorage);
      onScopeDispose(() => window.removeEventListener('storage', onStorage));
    }
  }
  // several fields of one reactive object, saved together under one key
  function keepFields(obj, fields, key) {
    const stored = storage.get(key);
    if (isObject(stored)) fields.forEach((f) => { if (hasOwn(stored, f)) obj[f] = stored[f]; });
    keepSaved(
      () => Object.fromEntries(fields.map((f) => [f, obj[f]])),
      (v) => { if (isObject(v)) fields.forEach((f) => { if (hasOwn(v, f)) obj[f] = v[f]; }); },
      key
    );
  }
  function saved(key, initial) {
    const r = ref(storage.has(key) ? storage.get(key) : isFunction(initial) ? initial() : initial);
    keepSaved(() => r.value, (v) => { r.value = v; }, key);
    return r;
  }

  /* ================================================================
   * API client — every HTTP action, JSON in and out
   *   const users = await Som.api.get('/api/users', { query: { page: 2 } })
   *   await Som.api.post('/api/users', { name: 'Maxamuud Xussen' })
   *   await Som.api.put('/api/users/1', user)      .patch(…)   .delete('/api/users/1')
   *   Som.api.setup({ base: '/api', token: () => Som.storage.get('token') })
   *   const github = Som.api.create({ base: 'https://api.github.com' })
   * Auth headers: sends X-CSRF-TOKEN (from <meta name="csrf-token">), X-XSRF-TOKEN (cookie),
   * X-Requested-With and Accept: application/json. A failed request throws an ApiError
   * with .status, .data and .errors (validation errors).
   * ================================================================ */
  class ApiError extends Error {
    constructor(message, status, data, response) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
      this.errors = (data && data.errors) || null;
      this.response = response || null;
    }
  }
  const isBodyAsIs = (b) => typeof b === 'string' ||
    (typeof FormData !== 'undefined' && b instanceof FormData) ||
    (typeof Blob !== 'undefined' && b instanceof Blob) ||
    (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) ||
    (typeof ArrayBuffer !== 'undefined' && (b instanceof ArrayBuffer || ArrayBuffer.isView(b)));
  function joinUrl(base, url) {
    if (!base || /^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
    return base.replace(/\/+$/, '') + '/' + String(url).replace(/^\/+/, '');
  }
  function createApi(defaults = {}) {
    let config = { base: '', headers: {}, timeout: 30000, credentials: 'same-origin', ...defaults };
    const hooks = { before: [], after: [], error: [] };
    const addHook = (type) => (fn) => { hooks[type].push(fn); return () => hooks[type].splice(hooks[type].indexOf(fn), 1); };

    async function request(method, url, body, opts = {}) {
      const o = { ...config, ...opts, headers: { ...config.headers, ...(opts.headers || {}) } };
      let full = joinUrl(o.base, url);
      if (o.query) {
        const qs = stringifyQuery(o.query);
        if (qs) full += (full.includes('?') ? '&' : '?') + qs.slice(1);
      }
      // Auth headers and your token only go to your own site (or to this client's own `base`),
      // never to someone else's API: that would leak the token and trigger extra CORS checks
      let sameOrigin = true, baseOrigin = false;
      try {
        const baseURI = (typeof document !== 'undefined' && document.baseURI) || (typeof location !== 'undefined' && location.href) || 'http://localhost/';
        const targetOrigin = new URL(full, baseURI).origin;
        sameOrigin = typeof location === 'undefined' || targetOrigin === location.origin;
        if (o.base && /^https?:\/\//i.test(o.base)) {
          baseOrigin = targetOrigin === new URL(o.base, baseURI).origin;
        }
      } catch (_) { sameOrigin = false; }
      const trusted = sameOrigin || baseOrigin;
      const headers = { Accept: 'application/json' };
      if (sameOrigin) headers['X-Requested-With'] = 'XMLHttpRequest';
      if (sameOrigin && method !== 'GET' && method !== 'HEAD' && typeof document !== 'undefined') {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) headers['X-CSRF-TOKEN'] = meta.getAttribute('content');
        const xsrf = (document.cookie || '').match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
        if (xsrf) headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrf[1]);
      }
      const token = isFunction(o.token) ? o.token() : o.token;
      if (token && trusted) headers.Authorization = 'Bearer ' + token;
      let payload = body;
      if (body != null && !isBodyAsIs(body)) {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
      Object.assign(headers, o.headers);

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      let timedOut = false;
      const timer = controller && o.timeout ? setTimeout(() => { timedOut = true; controller.abort(); }, o.timeout) : null;
      if (controller && o.signal) {
        if (o.signal.aborted) controller.abort();
        else o.signal.addEventListener('abort', () => controller.abort());
      }
      // If called inside an active component lifecycle/effect, automatically cancel the request on unmount
      if (controller && activeScope) {
        activeScope.cleanups.push(() => controller.abort());
      }

      let req = { method, url: full, headers, body: payload, credentials: o.credentials, signal: controller ? controller.signal : undefined };
      for (const h of hooks.before) req = (await h(req)) || req;

      const fail = async (err) => {
        for (const h of hooks.error) { try { await h(err); } catch (_) { /* a hook must not hide the error */ } }
        throw err;
      };
      let res;
      try {
        res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, credentials: req.credentials, signal: req.signal });
      } catch (e) {
        clearTimeout(timer);
        const msg = timedOut ? `Request timed out after ${o.timeout} ms` : e && e.name === 'AbortError' ? 'Request was cancelled' : 'Network error: ' + (e && e.message);
        return fail(new ApiError(msg, 0, null, null));
      }
      clearTimeout(timer);

      const type = (res.headers && res.headers.get('content-type')) || '';
      let data = null;
      if (res.status !== 204 && method !== 'HEAD') {
        const textBody = await res.text();
        if (textBody) {
          if (/json/i.test(type)) { try { data = JSON.parse(textBody); } catch (_) { data = textBody; } }
          else data = textBody;
        }
      }
      if (!res.ok) {
        const msg = (data && typeof data === 'object' && data.message) || `${res.status} ${res.statusText || 'Request failed'}`;
        return fail(new ApiError(msg, res.status, data, res));
      }
      let result = o.full ? { data, status: res.status, headers: res.headers, response: res } : data;
      for (const h of hooks.after) { const r = await h(result, res); if (r !== undefined) result = r; }
      return result;
    }

    const api = {
      get: (url, opts) => request('GET', url, undefined, opts),
      delete: (url, opts = {}) => request('DELETE', url, opts.body, opts),
      head: (url, opts) => request('HEAD', url, undefined, opts),
      post: (url, body, opts) => request('POST', url, body, opts),
      put: (url, body, opts) => request('PUT', url, body, opts),
      patch: (url, body, opts) => request('PATCH', url, body, opts),
      request: (method, url, opts = {}) => request(String(method).toUpperCase(), url, opts.body, opts),
      setup(opts = {}) {
        config = { ...config, ...opts, headers: { ...config.headers, ...(opts.headers || {}) } };
        return api;
      },
      create: (opts = {}) => createApi({ ...config, ...opts, headers: { ...config.headers, ...(opts.headers || {}) } }),
      before: addHook('before'),
      after: addHook('after'),
      onError: addHook('error'),
      get config() { return { ...config }; },
    };
    return api;
  }
  const api = createApi();

  /* ================================================================
   * load — data from an async function, with loading and error built in
   *   .som:  load users = api.get('/api/users')
   *   JS:    const users = Som.resource(() => Som.api.get('/api/users'))
   *   →  users.data · users.loading · users.error · users.loaded · users.reload()
   * It loads again by itself when a value it reads changes:  load user = api.get('/api/users/' + id)
   * ================================================================ */
  function resource(fn, options = {}) {
    const r = reactive({ data: options.initial === undefined ? null : options.initial, loading: false, error: null, loaded: false });
    let run = 0, quietFirst = !!(currentWait && currentWait.showsErrors);
    const start = (promise) => {
      const id = ++run;
      r.loading = true;
      r.error = null;
      return Promise.resolve(promise).then(
        (d) => {
          if (id !== run) return d;
          r.data = d;
          r.loaded = true;
          r.loading = false;
          return d;
        },
        (e) => {
          if (id !== run) return undefined;
          r.error = e;
          r.loading = false;
          // a <som-wait> with s-failed already shows the first failure on the page: no console warning for it
          if (!quietFirst) warn('load failed:', e && e.message ? e.message : e);
          quietFirst = false;
          return undefined;
        }
      );
    };
    const call = () => {
      let p;
      try { p = fn(); } catch (e) { p = Promise.reject(e); }
      return p;
    };
    r.reload = markRaw(() => {
      pauseTracking();
      try { return start(call()); } finally { resetTracking(); }
    });
    let first = true;
    doWatch(() => {
      const p = call(); // values read here (like an id) are tracked: when they change, it loads again
      pauseTracking();
      try { const done = start(p); if (first && currentWait) waitFor(done.then(() => { if (r.error) throw r.error; })); /* a failed load shows s-failed */ first = false; } finally { resetTracking(); }
    }, null);
    return r;
  }

  /* ================================================================
   * Event bus — talk between any components
   *   Som.bus.on('saved', fn) · Som.bus.send('saved', data)
   *   Listeners added inside a component are removed automatically on unmount.
   * ================================================================ */
  function createBus() {
    const map = new Map();
    const b = {
      on(name, fn) {
        if (!map.has(name)) map.set(name, new Set());
        map.get(name).add(fn);
        const off = () => b.off(name, fn);
        if (activeScope) onScopeDispose(off);
        return off;
      },
      once(name, fn) {
        const off = b.on(name, (...args) => { off(); fn(...args); });
        return off;
      },
      off(name, fn) {
        const set = map.get(name);
        if (set) fn ? set.delete(fn) : set.clear();
      },
      send(name, ...args) {
        if (devMode() && b === bus) { busLog.push({ name, args, at: Date.now() }); if (busLog.length > 200) busLog.shift(); }
        [...(map.get(name) || [])].forEach((fn) => {
          try { fn(...args); } catch (e) { console.error('[Som error] in bus listener', e); }
        });
      },
    };
    return b;
  }
  const bus = createBus();

  /* ================================================================
   * Async components & template files
   *   Som.lazy(() => import('./User.js'))
   *   { templateUrl: '/views/user.html', ... }
   * ================================================================ */
  const lazy = (loader) => ({ __loader: isFunction(loader) ? loader : loader.loader });
  function loadDef(def) {
    if (def.__loading) return def.__loading;
    return (def.__loading = (async () => {
      let d = def;
      if (def.__loader) {
        const m = await def.__loader();
        d = m && m.default ? m.default : m;
        def.__resolved = d;
      }
      if (typeof d === 'string') d = def.__resolved = await loadSom(d);
      if (d.templateUrl && !d.__tpl) {
        const res = await fetch(d.templateUrl);
        if (!res.ok) throw new Error(`Could not load template "${d.templateUrl}" (${res.status})`);
        d.template = await res.text();
        getTemplate(d);
      }
      return d;
    })());
  }

  /* ================================================================
   * The .som language
   *
   *   prop start = 0
   *   state count = start
   *   derive double = count * 2
   *   action add(n = 1) { count += n }
   *   when count > 10 { alert('Big!') }
   *   watch count { console.log(old, '→', value) }
   *   on ready { … }
   *
   *   <view>
   *     <button @click={add}>{count} × 2 = {double}</button>
   *   </view>
   *
   *   <style scoped> button { color: red } </style>
   *
   * Load with app.component('Counter', 'components/Counter.som'),
   * a route { path: '/', component: 'pages/Home.som' } or Som.load(url).
   * ================================================================ */
  const isSomUrl = (s) => /\.som(?:[?#].*)?$/i.test(s);
  const somCache = new Map();
  function somComponent(url) {
    const abs = new URL(url, document.baseURI).href;
    if (!somCache.has(abs)) somCache.set(abs, lazy(() => loadSom(abs)));
    return somCache.get(abs);
  }
  // files of a protected area (like the admin panel in backend/admin) are only sent to a signed-in user:
  // they go with the same token as the API (Som.api.setup({ token })), and only to your own site
  function fileHeaders(abs) {
    try { if (typeof location === 'undefined' || new URL(abs).origin !== location.origin) return {}; } catch (_) { return {}; }
    const t = api.config.token;
    const token = isFunction(t) ? t() : t;
    return token ? { Authorization: 'Bearer ' + token } : {};
  }
  async function loadSom(url) {
    const abs = new URL(url, document.baseURI).href;
    const res = await fetch(abs, { headers: fileHeaders(abs) });
    if (!res.ok) throw new Error(`Could not load "${url}" (${res.status})`);
    return compileSom(await res.text(), abs);
  }
  const hashString = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

  /* ---------- a small scanner that understands strings, comments and brackets ---------- */
  // the .som script part may hold regular expressions like /["']/g; views never do ({/for} must stay a block)
  let scanScript = false;
  const REGEX_BEFORE = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await))\s*$/;
  function skipLiteral(src, i) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); return e < 0 ? src.length : e; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); return e < 0 ? src.length : e + 2; }
    if (c === '/' && scanScript && REGEX_BEFORE.test(src.slice(Math.max(0, i - 12), i))) {
      let j = i + 1, inClass = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) { j++; while (/[a-z]/i.test(src[j] || '')) j++; return j; }
        j++;
      }
      return -1; // not a regex after all (a lone /): read it as normal code
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      return j + 1;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') j += 2;
        else if (src[j] === '$' && src[j + 1] === '{') j = matchBrace(src, j + 1);
        else j++;
      }
      return j + 1;
    }
    return -1;
  }
  // returns the index just after the bracket that closes the one at `i`
  function matchBrace(src, i) {
    let depth = 0;
    for (let j = i; j < src.length;) {
      const k = skipLiteral(src, j);
      if (k >= 0) { j = k; continue; }
      const c = src[j];
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') { depth--; if (depth === 0) return j + 1; }
      j++;
    }
    throw new SyntaxError(`Missing closing bracket for "${src[i]}"`);
  }
  // end of a one-line statement: a newline or ";" outside brackets and strings
  function readExpr(src, i) {
    let j = i;
    while (j < src.length) {
      if (src[j] === '/' && src[j + 1] === '/') return j;
      const k = skipLiteral(src, j);
      if (k >= 0) { j = k; continue; }
      const c = src[j];
      if (c === '(' || c === '[' || c === '{') { j = matchBrace(src, j); continue; }
      if (c === '\n' || c === ';') return j;
      j++;
    }
    return j;
  }
  // index of the "{" that opens a block, skipping (…) and […]
  function findBlock(src, i) {
    let j = i;
    while (j < src.length) {
      const k = skipLiteral(src, j);
      if (k >= 0) { j = k; continue; }
      const c = src[j];
      if (c === '(' || c === '[') { j = matchBrace(src, j); continue; }
      if (c === '{') return j;
      if (c === '\n' && !src.slice(i, j).trim()) { j++; continue; }
      j++;
    }
    throw new SyntaxError('Expected "{"');
  }
  const lineOf = (src, i) => src.slice(0, i).split('\n').length;
  const IDENT = /^[A-Za-z_$][\w$]*$/;

  /* ---------- TypeScript Support: Zero-Dependency Type Stripper ---------- */
  // Finds the top-level assignment `=` in a declaration (outside brackets and `<...>` type generics after `:`)
  function findTopLevelEq(text) {
    let depth = 0, angle = 0, seenColon = false;
    for (let i = 0; i < text.length; i++) {
      const k = skipLiteral(text, i);
      if (k >= 0) { i = k - 1; continue; }
      const c = text[i], prev = text[i - 1], next = text[i + 1];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth > 0) depth--; }
      else if (c === ':' && depth === 0 && angle === 0) seenColon = true;
      else if (seenColon && depth === 0 && c === '<' && prev !== '<' && next !== '=') angle++;
      else if (seenColon && depth === 0 && c === '>' && prev !== '=' && prev !== '-' && angle > 0) angle--;
      else if (c === '=' && depth === 0 && angle === 0 && prev !== '=' && prev !== '!' && prev !== '<' && prev !== '>' && next !== '=' && next !== '>') {
        return i;
      }
    }
    return -1;
  }

  // Splits a parameter list by top-level `,` and removes TypeScript parameter modifiers & type annotations
  function stripTsParams(paramsInner) {
    if (!paramsInner || !paramsInner.trim()) return paramsInner;
    const parts = [];
    let start = 0, depth = 0, angle = 0, seenColon = false;
    for (let i = 0; i < paramsInner.length; i++) {
      const k = skipLiteral(paramsInner, i);
      if (k >= 0) { i = k - 1; continue; }
      const c = paramsInner[i], prev = paramsInner[i - 1], next = paramsInner[i + 1];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth > 0) depth--; }
      else if (c === ':' && depth === 0 && angle === 0) seenColon = true;
      else if (seenColon && depth === 0 && c === '<' && prev !== '<' && next !== '=') angle++;
      else if (seenColon && depth === 0 && c === '>' && prev !== '=' && prev !== '-' && angle > 0) angle--;
      else if (c === ',' && depth === 0 && angle === 0) {
        parts.push(paramsInner.slice(start, i));
        start = i + 1;
        seenColon = false;
      }
    }
    parts.push(paramsInner.slice(start));

    const cleaned = [];
    for (const rawParam of parts) {
      if (!rawParam.trim()) continue;
      const lead = (rawParam.match(/^\s*/) || [''])[0];
      let p = rawParam.trim().replace(/^(?:(?:public|private|protected|readonly|override)\s+)+/, '');
      if (/^this\s*:/.test(p)) continue; // TypeScript fake `this` parameter
      const eq = findTopLevelEq(p);
      const lhs = eq < 0 ? p : p.slice(0, eq).trim();
      const rhs = eq < 0 ? null : stripTypeScript(p.slice(eq + 1).trim());
      // Find first `:` at depth 0 on `lhs` (outside `{...}` and `[...]` destructuring)
      let colonIdx = -1, d = 0;
      for (let i = 0; i < lhs.length; i++) {
        const k = skipLiteral(lhs, i);
        if (k >= 0) { i = k - 1; continue; }
        const c = lhs[i];
        if (c === '(' || c === '[' || c === '{') d++;
        else if (c === ')' || c === ']' || c === '}') { if (d > 0) d--; }
        else if (c === ':' && d === 0) { colonIdx = i; break; }
      }
      const binding = (colonIdx < 0 ? lhs : lhs.slice(0, colonIdx)).replace(/\?\s*$/, '').trim();
      cleaned.push(lead + (rhs != null ? `${binding} = ${rhs}` : binding));
    }
    return cleaned.join(',');
  }

  // Strips TypeScript types, interfaces, type aliases, enums, generics, and `as` assertions from JS/TS code
  function stripTypeScript(src) {
    if (!src || typeof src !== 'string') return src;
    // Fast bail-out if no TypeScript constructs can possibly be present
    if (!/[:<>!]|interface\b|type\b|enum\b|\bas\b|\bsatisfies\b|\bdeclare\b|\bpublic\b|\bprivate\b|\bprotected\b|\breadonly\b/.test(src)) {
      return src;
    }
    const prevScan = scanScript;
    scanScript = true;
    try {
      const lits = [];
      const mask = (str) => {
        let out = '', i = 0;
        while (i < str.length) {
          const c = str[i], n = str[i + 1];
          if (c === '/' && (n === '/' || n === '*')) {
            const end = skipLiteral(str, i);
            out += str.slice(i, end).replace(/[^\n]/g, ' ');
            i = end;
            continue;
          }
          if (c === '`') {
            let tpl = '`', j = i + 1;
            while (j < str.length && str[j] !== '`') {
              if (str[j] === '\\') { tpl += str.slice(j, j + 2); j += 2; }
              else if (str[j] === '$' && str[j + 1] === '{') {
                const close = matchBrace(str, j + 1);
                tpl += '${' + stripTypeScript(str.slice(j + 2, close - 1)) + '}';
                j = close;
              } else { tpl += str[j++]; }
            }
            if (j < str.length) { tpl += '`'; j++; }
            const id = lits.length;
            lits.push(tpl);
            out += `__SOM_LIT_${id}__`;
            i = j;
            continue;
          }
          const k = skipLiteral(str, i);
          if (k >= 0) {
            const id = lits.length;
            lits.push(str.slice(i, k));
            out += `__SOM_LIT_${id}__`;
            i = k;
            continue;
          }
          out += str[i++];
        }
        return out;
      };

      let code = mask(src);

      // 1. Remove `import type ...` and inline `type` specifiers in `import { type X, Y }`
      code = code.replace(/^[ \t]*import\s+type\s+[^\n;]+(?:;|$)/gm, (m) => m.replace(/[^\n]/g, ' '));
      code = code.replace(/\bimport\s*\{([^}]*)\}\s*from\s*(__SOM_LIT_\d+__)/g, (m, specs, fromLit) => {
        const items = specs.split(',').map((s) => s.trim()).filter(Boolean);
        const kept = items.filter((s) => !/^type\s+[A-Za-z_$*]/.test(s));
        if (kept.length === items.length) return m;
        if (kept.length === 0) return m.replace(/[^\n]/g, ' ');
        return `import { ${kept.join(', ')} } from ${fromLit}`;
      });
      code = code.replace(/\bexport\s+type\s*\{[^}]*\}(?:\s*from\s*__SOM_LIT_\d+__)?[ \t]*;?/g, (m) => m.replace(/[^\n]/g, ' '));

      // 2. Remove `declare ...` statements
      code = code.replace(/^[ \t]*(?:export\s+)?declare\s+(?:const|let|var|function|class|abstract|global|module|namespace)\b[\s\S]*?(?:;|\n|$)/gm, (m) => m.replace(/[^\n]/g, ' '));

      // 3. Remove `(export)? interface Name ... { ... }`
      const ifaceRe = /(?:^|[;\n{])[ \t]*(?:export\s+)?(?:declare\s+)?interface\s+[A-Za-z_$][\w$]*/g;
      let im;
      while ((im = ifaceRe.exec(code)) !== null) {
        const startOffset = /^[;\n{]/.test(im[0]) ? im.index + 1 : im.index;
        let open = -1, angle = 0;
        for (let k = im.index + im[0].length; k < code.length; k++) {
          if (code[k] === '<') angle++;
          else if (code[k] === '>' && angle > 0) angle--;
          else if (code[k] === '{' && angle === 0) { open = k; break; }
        }
        if (open < 0) break;
        let close;
        try { close = matchBrace(code, open); } catch (_) { break; }
        const blank = code.slice(startOffset, close).replace(/[^\n]/g, ' ');
        code = code.slice(0, startOffset) + blank + code.slice(close);
        ifaceRe.lastIndex = startOffset + blank.length;
      }

      // 4. Remove `(export)? type Name<...> = ...`
      const typeRe = /(?:^|[;\n{])[ \t]*(?:export\s+)?(?:declare\s+)?type\s+[A-Za-z_$][\w$]*\s*(?:<[\s\S]*?>)?\s*=(?!=)/g;
      let tm;
      while ((tm = typeRe.exec(code)) !== null) {
        const startOffset = /^[;\n{]/.test(tm[0]) ? tm.index + 1 : tm.index;
        let k = tm.index + tm[0].length, depth = 0, angle = 0;
        while (k < code.length) {
          const c = code[k], next = code[k + 1], prev = code[k - 1];
          if (c === '(' || c === '[' || c === '{') depth++;
          else if (c === ')' || c === ']' || c === '}') { if (depth > 0) depth--; }
          else if (c === '<' && prev !== '<' && next !== '=') angle++;
          else if (c === '>' && prev !== '=' && prev !== '-' && angle > 0) angle--;
          else if (depth === 0 && angle === 0) {
            if (c === ';') { k++; break; }
            if (c === '\n') {
              const rest = code.slice(k + 1).match(/^[ \t]*([|&?:])/);
              if (!rest) break;
            }
          }
          k++;
        }
        const blank = code.slice(startOffset, k).replace(/[^\n]/g, ' ');
        code = code.slice(0, startOffset) + blank + code.slice(k);
        typeRe.lastIndex = startOffset + blank.length;
      }

      // 5. Transform `(export)? (const)? enum Name { ... }` into a runtime object
      code = code.replace(/\b(export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)\s*\{([^{}]*)\}/g, (_, exp, name, body) => {
        const members = body.split(',').map((s) => s.trim()).filter(Boolean);
        let nextVal = 0;
        const assigns = members.map((m) => {
          const eq = m.indexOf('=');
          if (eq < 0) {
            const k = m.trim();
            const v = nextVal++;
            return `$e[$e[${JSON.stringify(k)}] = ${v}] = ${JSON.stringify(k)};`;
          }
          const k = m.slice(0, eq).trim();
          const v = m.slice(eq + 1).trim();
          if (/^-?\d+$/.test(v)) {
            nextVal = Number(v) + 1;
            return `$e[$e[${JSON.stringify(k)}] = ${v}] = ${JSON.stringify(k)};`;
          }
          return `$e[${JSON.stringify(k)}] = ${v};`;
        });
        return `${exp || ''}const ${name} = (function () { const $e = {}; ${assigns.join(' ')} return $e; })()`;
      });

      // 6. Strip class generics & `implements ...`
      code = code.replace(/\b(class\s+[A-Za-z_$][\w$]*)\s*<[^{>;]+>/g, '$1');
      code = code.replace(/\b(extends\s+[A-Za-z_$][\w$.]*)\s*<[^{>;]+>/g, '$1');
      code = code.replace(/\bimplements\s+[A-Za-z_$][\w$.,\s<>]*?(?=\{)/g, '');

      // 7. Strip function generics `function name<T>(...)` and arrow generics `async <T>(...) =>`
      code = code.replace(/\b(function(?:\s*\*)?(?:\s+[A-Za-z_$][\w$]*)?)\s*<[^()>;]+>\s*\(/g, '$1(');
      code = code.replace(/(\basync\s+)<([A-Za-z_$][\w$]*(?:\s+extends\s+[^>()]+)?(?:\s*,\s*[A-Za-z_$][\w$]*(?:\s+extends\s+[^>()]+)?)*\s*,?)>\s*\(/g, '$1(');

      // 8. Strip generic call type arguments `fn<Type>(...)` or `new Map<K, V>(...)`
      // Only when `<` immediately follows an identifier and `>` is immediately followed by `(`
      const genCallRe = /([A-Za-z_$][\w$]*)<([A-Za-z_$[\]{}\w$.,\s|&?:<>()-]+)>\(/g;
      code = code.replace(genCallRe, (m, fnName, typeInner) => {
        if (fnName === 'if' || fnName === 'for' || fnName === 'while' || fnName === 'switch' || fnName === 'return') return m;
        if (/&&|\|\||===|!==|[+*/]/.test(typeInner)) return m;
        let bal = 0;
        for (let k = 0; k < typeInner.length; k++) {
          if (typeInner[k] === '<') bal++;
          else if (typeInner[k] === '>') { bal--; if (bal < 0) return m; }
        }
        return bal === 0 ? `${fnName}(` : m;
      });

      // 9. Strip parameter types and return types on functions, methods, and arrow functions
      const NON_FN_KW = new Set(['if', 'for', 'while', 'switch', 'with', 'return', 'typeof', 'instanceof', 'delete', 'void', 'throw', 'await', 'yield', 'case', 'new', 'super']);
      let pIdx = 0;
      while (pIdx < code.length) {
        const open = code.indexOf('(', pIdx);
        if (open < 0) break;
        let close;
        try { close = matchBrace(code, open); } catch (_) { pIdx = open + 1; continue; }
        const before = code.slice(Math.max(0, open - 80), open);
        const prevWordMatch = before.match(/([A-Za-z_$][\w$]*)\s*$/);
        const prevWord = prevWordMatch ? prevWordMatch[1] : '';
        const afterParen = code.slice(close);

        // Check if followed by `=>` or `: ReturnType =>`
        let isArrow = false, isFnBody = false, retEnd = close;
        const directArrow = afterParen.match(/^\s*=>/);
        const directBrace = afterParen.match(/^\s*\{/);
        if (directArrow) {
          isArrow = true;
        } else if (directBrace && !NON_FN_KW.has(prevWord) && (/\bfunction\b/.test(before) || prevWord === 'catch' || /^[A-Za-z_$][\w$]*$/.test(prevWord))) {
          isFnBody = true;
        } else if (/^\s*:/.test(afterParen) && !NON_FN_KW.has(prevWord)) {
          // Scan potential `: ReturnType` up to `=>` or `{`
          let k = close + afterParen.indexOf(':') + 1, d = 0, a = 0;
          while (k < code.length) {
            const ch = code[k], nx = code[k + 1], pr = code[k - 1];
            if (ch === '(' || ch === '[' || ch === '{') {
              if (ch === '{' && d === 0 && a === 0 && (/\bfunction\b/.test(before) || /^[A-Za-z_$][\w$]*$/.test(prevWord))) {
                const typeSlice = code.slice(close + afterParen.indexOf(':') + 1, k).trim();
                if (typeSlice && !/[;=\n]/.test(typeSlice)) { isFnBody = true; retEnd = k; break; }
              }
              d++;
            } else if (ch === ')' || ch === ']' || ch === '}') {
              if (d === 0) break;
              d--;
            } else if (ch === '<' && pr !== '<' && nx !== '=') a++;
            else if (ch === '>' && pr !== '=' && pr !== '-' && a > 0) a--;
            else if (d === 0 && a === 0) {
              if (ch === '=' && nx === '>') { isArrow = true; retEnd = k; break; }
              if (ch === ';' || ch === '\n' || (ch === '=' && nx !== '>')) break;
            }
            k++;
          }
        }

        if (isArrow || isFnBody) {
          const inner = code.slice(open + 1, close - 1);
          const strippedInner = (/:|\b(?:public|private|protected|readonly|override|this)\b|\?\s*(?:,|$|=)/.test(inner))
            ? stripTsParams(inner)
            : inner;
          const retBlank = retEnd > close ? code.slice(close, retEnd).replace(/[^\n]/g, '') : '';
          const replacement = '(' + strippedInner + ')' + retBlank;
          code = code.slice(0, open) + replacement + code.slice(retEnd);
          pIdx = open + replacement.length;
        } else {
          pIdx = open + 1;
        }
      }

      // 10. Strip variable type annotations: `const x: Type = ...`, `let count: number;`
      const varRe = /\b(const|let|var)\s+([A-Za-z_$][\w$]*|\{[^{}]*\}|\[[^[\]]*\])\s*!?\s*:\s*/g;
      let vm;
      while ((vm = varRe.exec(code)) !== null) {
        const cPos = code.indexOf(':', vm.index + vm[1].length + vm[2].length);
        if (cPos < 0) continue;
        let k = cPos + 1, d = 0, a = 0;
        while (k < code.length) {
          const ch = code[k], nx = code[k + 1], pr = code[k - 1];
          if (ch === '(' || ch === '[' || ch === '{') d++;
          else if (ch === ')' || ch === ']' || ch === '}') { if (d === 0) break; d--; }
          else if (ch === '<' && pr !== '<' && nx !== '=') a++;
          else if (ch === '>' && pr !== '=' && pr !== '-' && a > 0) a--;
          else if (d === 0 && a === 0) {
            if ((ch === '=' && nx !== '>' && nx !== '=') || ch === ';' || ch === ',' || ch === '\n') break;
            if ((ch === 'o' && nx === 'f' || ch === 'i' && nx === 'n') && /\s/.test(pr) && /\s/.test(code[k + 2] || '')) break;
          }
          k++;
        }
        const bangPos = code[cPos - 1] === '!' ? cPos - 1 : cPos;
        const blank = code.slice(bangPos, k).replace(/[^\n]/g, '');
        code = code.slice(0, bangPos) + blank + code.slice(k);
        varRe.lastIndex = bangPos + blank.length;
      }

      // 11. Strip class member access modifiers (`public`, `private`, `protected`, `readonly`, `override`)
      code = code.replace(/(^[ \t]*)(?:(?:public|private|protected|readonly|override)\s+)+(?=(?:static\s+|async\s+)?[A-Za-z_$][\w$]*\s*[(<:;=])/gm, '$1');
      // Strip class field type annotations: `  propName?: Type = val` or `  propName: Type;` (never object literal `key: val,` or `key: () =>`)
      code = code.replace(/(^[ \t]*(?:static\s+)?[A-Za-z_$][\w$]*)\s*(?:[?!]\s*:\s*[A-Za-z_$[][^=,;\n{}]*(?=\s*(?:=(?![>=])|;|\n))|:\s*[A-Za-z_$[][^=,;\n{}]*(?=\s*(?:=(?![>=])|;)))/gm, '$1');

      // 12. Strip `as Type` and `satisfies Type` assertions (outside `import { a as b }` / `export { a as b }`)
      for (let pass = 0; pass < 2; pass++) {
        code = code.replace(/([A-Za-z0-9_$)\]}])\s+\b(?:as|satisfies)\s+(?:const\b|unknown\b|any\b|never\b|[A-Za-z_$][\w$.]*(?:\s*<[^>;\n]*>)?(?:\[\])*(?:\s*[|&]\s*[A-Za-z_$][\w$.]*(?:\s*<[^>;\n]*>)?(?:\[\])*)*)/g, '$1');
      }

      // 13. Strip non-null assertions `expr!.prop`, `expr![i]`, `expr!)` (but never `!=` or `!==`)
      code = code.replace(/([A-Za-z0-9_$)\]])!(?!=)(\s*(?:\.|\[|\(|,|;|\)|\}|:|\?|\+|-|\*|\/|%|&|\||\n|$))/g, '$1$2');

      // Restore masked literals
      return code.replace(/__SOM_LIT_(\d+)__/g, (_, id) => lits[Number(id)]);
    } finally {
      scanScript = prevScan;
    }
  }

  /* ---------- the compiler: .som source → component definition ---------- */
  function parseSomScript(src, url) {
    scanScript = true;
    try { return parseSomScriptInner(src, url); } finally { scanScript = false; }
  }
  function parseSomScriptInner(src, url) {
    const out = [], imports = [], props = {}, events = [];
    const kw = /(prop|state|derive|derived|action|when|watch|on|use|share|receive|event|import|saved|load|layout|interface|type)(?![\w$])/y;
    let layout;
    // `saved` and `load` are keywords when followed by `name =` or `name: Type =`, so `load(…)` stays a normal call
    const declares = (at, word) => {
      const rest = src.slice(at + word.length, at + 300);
      const m = rest.match(/^\s+([A-Za-z_$][\w$]*)\s*([:=])/);
      if (!m) return false;
      if (m[2] === '=') return rest[m.index + m[0].length] !== '=';
      return findTopLevelEq(rest.slice(m.index)) > 0;
    };
    const fail = (i, msg) => { throw new SyntaxError(`${msg} (${url.split('/').pop()}, line ${lineOf(src, i)})`); };
    const nameValue = (i, end, keyword) => {
      const text = src.slice(i, end).trim();
      const eq = findTopLevelEq(text);
      const lhs = (eq < 0 ? text : text.slice(0, eq)).trim();
      const colon = lhs.indexOf(':');
      const name = (colon < 0 ? lhs : lhs.slice(0, colon)).replace(/\?\s*$/, '').trim();
      if (!IDENT.test(name)) fail(i, `"${keyword}" needs a name, like: ${keyword} count = 0`);
      const rawVal = eq < 0 ? null : text.slice(eq + 1).trim();
      return { name, value: rawVal == null ? null : stripTypeScript(rawVal) };
    };
    // move past a statement's end: skip its ";" or newline, but not a "//" comment that follows it
    const after = (end) => (src[end] === ';' || src[end] === '\n' ? end + 1 : end);
    const block = (i) => { const open = findBlock(src, i); const close = matchBrace(src, open); return { head: src.slice(i, open).trim(), body: src.slice(open + 1, close - 1), end: close }; };

    let i = 0;
    while (i < src.length) {
      if (/\s/.test(src[i])) { i++; continue; }
      if (src[i] === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipLiteral(src, i); continue; }
      if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i); i = e < 0 ? src.length : e + 3; continue; }
      kw.lastIndex = i;
      let m = kw.exec(src);
      if (m && (m[1] === 'saved' || m[1] === 'load') && !declares(i, m[1])) m = null;
      if (m && (m[1] === 'watch' || m[1] === 'when') && /^\w+\s*\(/.test(src.slice(i))) m = null;
      if (m && m[1] === 'interface' && !/^interface\s+[A-Za-z_$][\w$]*/.test(src.slice(i, i + 120))) m = null;
      if (m && m[1] === 'type' && !/^type\s+[A-Za-z_$][\w$]*(?:\s*<[^>]*>)?\s*=(?!=)/.test(src.slice(i, i + 160))) m = null;
      // `layout admin` / `layout 'layouts/admin.som'` / `layout none`: only like that, so `layout = …` stays code
      const lm = m && m[1] === 'layout' && src.slice(i).match(/^layout[ \t]+(?:(['"])([^'"\n]+)\1|([\w./-]+))[ \t]*;?[ \t]*(?=\n|$|\/\/)/);
      if (m && m[1] === 'layout' && !lm) m = null;
      if (lm) { layout = lm[2] || lm[3]; if (layout === 'none' || layout === 'false') layout = false; i += lm[0].length; continue; }
      if (!m) {
        const end = readExpr(src, i);
        const stmt = stripTypeScript(src.slice(i, end)).trim();
        if (stmt) out.push(stmt + ';');
        i = after(end);
        continue;
      }
      const word = m[1];
      let j = i + word.length;
      try {
        if (word === 'interface') {
          const open = findBlock(src, j);
          const close = matchBrace(src, open);
          i = after(close);
          continue;
        }
        if (word === 'type') {
          let k = j + src.slice(j).indexOf('=') + 1, depth = 0, angle = 0;
          while (k < src.length) {
            const lit = skipLiteral(src, k);
            if (lit >= 0) { k = lit; continue; }
            const c = src[k], nx = src[k + 1], pr = src[k - 1];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') { if (depth > 0) depth--; }
            else if (c === '<' && pr !== '<' && nx !== '=') angle++;
            else if (c === '>' && pr !== '=' && pr !== '-' && angle > 0) angle--;
            else if (depth === 0 && angle === 0) {
              if (c === ';') { k++; break; }
              if (c === '\n') {
                const cont = src.slice(k + 1).match(/^[ \t]*([|&?:])/);
                if (!cont) break;
              }
            }
            k++;
          }
          i = after(k);
          continue;
        }
        if (word === 'import') {
          const end = readExpr(src, i);
          const rawImport = src.slice(i, end).trim();
          if (!/^import\s+type\b/.test(rawImport)) {
            const cleanedImport = stripTypeScript(rawImport).trim();
            if (cleanedImport) imports.push(cleanedImport);
          }
          i = after(end);
          continue;
        }
        if (word === 'prop' || word === 'event' || word === 'use') {
          const end = readExpr(src, j);
          const text = src.slice(j, end).trim();
          const eq = findTopLevelEq(text);
          if (word === 'prop' && eq > 0) {
            const { name, value } = nameValue(j, end, 'prop');
            props[name] = value;
          } else if (word === 'use' && eq > 0) { // use mouse = trackMouse() or use mouse: MousePos = trackMouse()
            const { name, value } = nameValue(j, end, 'use');
            out.push(`$h.use(${JSON.stringify(name)}, () => (${value}));`);
          } else if ((word === 'prop' || word === 'event') && text.includes(':')) {
            // Typed prop or event without default: `prop user: User | null` or `event save: (u: User) => void`
            const colon = text.indexOf(':');
            const name = text.slice(0, colon).replace(/\?\s*$/, '').trim();
            if (!IDENT.test(name) && word !== 'event') fail(j, `Invalid name "${name}"`);
            if (word === 'prop') props[name] = null;
            else events.push(name);
          } else {
            text.split(',').map((s) => s.trim()).filter(Boolean).forEach((rawN) => {
              const n = rawN.split(':')[0].replace(/\?\s*$/, '').trim();
              if (!IDENT.test(n) && word !== 'event') fail(j, `Invalid name "${n}"`);
              if (word === 'prop') props[n] = null;
              else if (word === 'event') events.push(n);
              else out.push(`$h.use(${JSON.stringify(n)});`);
            });
          }
          i = after(end); continue;
        }
        if (word === 'state' || word === 'derive' || word === 'derived' || word === 'share' || word === 'receive') {
          const end = readExpr(src, j);
          const { name, value } = nameValue(j, end, word);
          if (value == null && word !== 'receive') fail(j, `"${word} ${name}" needs a value, like: ${word} ${name} = 0`);
          const fn = `() => (${value == null ? 'undefined' : value})`;
          const normWord = word === 'derived' ? 'derive' : word;
          out.push(word === 'receive'
            ? `$h.receive(${JSON.stringify(name)}, ${fn}, ${value != null});`
            : `$h.${normWord}(${JSON.stringify(name)}, ${fn});`);
          i = after(end); continue;
        }
        if (word === 'saved') {
          const end = readExpr(src, j);
          const rawText = src.slice(j, end).trim();
          const eq = findTopLevelEq(rawText);
          const lhs = (eq < 0 ? rawText : rawText.slice(0, eq)).trim();
          const colon = lhs.indexOf(':');
          const name = (colon < 0 ? lhs : lhs.slice(0, colon)).replace(/\?\s*$/, '').trim();
          if (!IDENT.test(name)) fail(j, `"saved" needs a name, like: saved count = 0`);
          const rawVal = eq < 0 ? null : rawText.slice(eq + 1).trim();
          if (rawVal == null) fail(j, `"saved ${name}" needs a value, like: saved ${name} = []`);
          const km = rawVal.match(/^([\s\S]*?)\s+as\s+(['"])([^'"]+)\2\s*$/);
          const cleanVal = stripTypeScript(km ? km[1] : rawVal);
          out.push(`$h.saved(${JSON.stringify(name)}, () => (${cleanVal}), ${km ? JSON.stringify(km[3]) : 'null'});`);
          i = after(end); continue;
        }
        if (word === 'load') {
          const end = readExpr(src, j);
          const { name, value } = nameValue(j, end, 'load');
          if (value == null) fail(j, `"load ${name}" needs something to load, like: load ${name} = api.get('/api/${name}')`);
          out.push(`$h.load(${JSON.stringify(name)}, () => (${value}));`);
          i = after(end); continue;
        }
        if (word === 'action') {
          const { head, body, end } = block(j);
          const cleanHead = head.replace(/^(async\s+)?(function\s+)?/, '').trim();
          const nameMatch = cleanHead.match(/^([A-Za-z_$][\w$]*)/);
          if (!nameMatch) fail(j, 'Write an action like: action save(item) { … }');
          const actName = nameMatch[1];
          let restHead = cleanHead.slice(actName.length).trim();
          // Skip optional generic `<T, U>` before `(`
          if (restHead.startsWith('<')) {
            let a = 0, k = 0;
            while (k < restHead.length) {
              if (restHead[k] === '<') a++;
              else if (restHead[k] === '>') { a--; if (a === 0) { k++; break; } }
              k++;
            }
            restHead = restHead.slice(k).trim();
          }
          let paramsCode = '()';
          if (restHead.startsWith('(')) {
            const pClose = matchBrace(restHead, 0);
            const inner = restHead.slice(1, pClose - 1);
            paramsCode = '(' + stripTsParams(inner) + ')';
          } else if (restHead) {
            fail(j, 'Write an action like: action save(item) { … }');
          }
          const cleanBody = stripTypeScript(body);
          const isAsync = /\basync\b/.test(head) || /\bawait\b/.test(cleanBody) ? 'async ' : '';
          out.push(`$h.action(${JSON.stringify(actName)}, ${isAsync}function ${actName}${paramsCode} {${cleanBody}\n});`);
          i = end; continue;
        }
        if (word === 'when' || word === 'watch') {
          const { head, body, end } = block(j);
          if (!head) fail(j, `"${word}" needs something to check, like: ${word} count > 5 { … }`);
          const cleanHead = stripTypeScript(head);
          const cleanBody = stripTypeScript(body);
          const isAsync = /\bawait\b/.test(cleanBody) ? 'async ' : '';
          out.push(`$h.${word}(() => (${cleanHead}), ${isAsync}function (value, old) {${cleanBody}\n});`);
          i = end; continue;
        }
        if (word === 'on') {
          const { head, body, end } = block(j);
          const cleanBody = stripTypeScript(body);
          const isAsync = /\bawait\b/.test(cleanBody) ? 'async ' : '';
          out.push(`$h.on(${JSON.stringify(head)}, ${isAsync}function () {${cleanBody}\n});`);
          i = end; continue;
        }
      } catch (e) {
        if (e instanceof SyntaxError && /line \d+\)$/.test(e.message)) throw e;
        fail(i, e.message);
      }
    }
    return { code: out.join('\n'), imports, props, events, layout };
  }

  // a CSS file imported by a .som file: one <link> for the whole page, before the components' own styles
  function addStylesheet(href) {
    if (typeof document === 'undefined') return;
    const full = new URL(href, document.baseURI).href;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === full)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = full;
    link.setAttribute('data-som-import', '');
    const first = document.head.querySelector('style[data-som], link[data-som-presets]');
    document.head.insertBefore(link, first);
  }

  // load `import` lines once per file; .som imports become local components
  async function resolveImports(list, url) {
    const values = {}, components = {};
    for (const stmt of list) {
      const m = stmt.match(/^import\s+(?:([\s\S]+?)\s+from\s+)?(['"])(.+?)\2/);
      if (!m) { warn(`Can't read import: ${stmt}`); continue; }
      const [, what, , spec] = m;
      if (/^som(\.js)?$/.test(spec)) continue; // Som's own functions are always available
      const abs = /^\.{0,2}\//.test(spec) ? new URL(spec, url).href : spec;
      if (isSomUrl(spec)) {
        if (what && IDENT.test(what.trim())) components[what.trim()] = somComponent(abs);
        continue;
      }
      if (/\.css(?:[?#].*)?$/i.test(spec)) { // import 'bootstrap/dist/css/bootstrap.min.css' or './theme.css'
        addStylesheet(abs === spec ? Som.__npmBase + spec : abs);
        continue;
      }
      const mod = await Som.__import(abs); // one place to load modules (som build uses it too)
      if (!what) continue;
      what.split(/,(?![^{]*\})/).map((s) => s.trim()).forEach((part) => {
        if (part.startsWith('* as ')) values[part.slice(5).trim()] = mod;
        else if (part[0] === '{') {
          part.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean).forEach((p) => {
            const [from, to] = p.split(/\s+as\s+/);
            values[(to || from).trim()] = mod[from.trim()];
          });
        } else values[part] = mod.default;
      });
    }
    return { values, components };
  }

  /* ================================================================
   * Som.theme — reactive light / dark / system theme controller
   *   theme.current: 'auto' | 'dark' | 'light'
   *   theme.dark / isDark: boolean
   *   theme.toggle(): switches between dark and light
   *   theme.set(mode): 'dark' | 'light' | 'auto'
   * ================================================================ */
  function createTheme() {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    const storageKey = 'som-theme';
    const getSaved = () => {
      try { return isBrowser ? localStorage.getItem(storageKey) || 'auto' : 'auto'; }
      catch (_) { return 'auto'; }
    };
    const getSystemDark = () => {
      return Boolean(isBrowser && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    };

    const currentRef = ref(getSaved());
    const systemDarkRef = ref(getSystemDark());

    const updateDOM = () => {
      if (!isBrowser) return;
      const mode = currentRef.value;
      const isDark = mode === 'dark' || (mode === 'auto' && systemDarkRef.value);
      const applied = isDark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', applied);
      document.documentElement.setAttribute('data-bs-theme', applied);
      if (document.documentElement.classList) {
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.classList.toggle('light', !isDark);
      }
      if (document.documentElement.style.colorScheme !== applied) {
        document.documentElement.style.colorScheme = applied;
      }
      try {
        if (mode === 'auto') localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, mode);
      } catch (_) {}
    };

    if (isBrowser) {
      if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onMQ = (e) => {
          systemDarkRef.value = !!e.matches;
          if (currentRef.value === 'auto') updateDOM();
        };
        if (mq.addEventListener) mq.addEventListener('change', onMQ);
        else if (mq.addListener) mq.addListener(onMQ);
      }
      updateDOM();
    }

    const themeObj = reactive({
      get current() { return currentRef.value; },
      set current(val) { themeObj.set(val); },
      get dark() {
        return currentRef.value === 'dark' || (currentRef.value === 'auto' && systemDarkRef.value);
      },
      get isDark() { return this.dark; },
      set(mode) {
        if (mode !== 'dark' && mode !== 'light' && mode !== 'auto') mode = 'auto';
        currentRef.value = mode;
        updateDOM();
      },
      toggle() {
        this.set(this.dark ? 'light' : 'dark');
      },
    });

    return themeObj;
  }
  const theme = createTheme();

  // runs a component's script for one instance
  function runSom(run, imports, props, send) {
    const inst = currentInstance;
    const ctx = inst ? inst.ctx : {};
    const globals = (inst && inst.appContext && inst.appContext.config && inst.appContext.config.globals) || {};
    const st = reactive({});
    const raw = toRaw(st);
    for (const k in imports) raw[k] = imports[k]; // imported functions and values can be used in the view too
    const starts = [];
    const own = (k) => hasOwn(raw, k);
    const scope = new Proxy({}, {
      has: (_, k) => typeof k === 'string' && (own(k) || (inst && hasOwn(inst.propsOptions, k)) || hasOwn(imports, k) ||
        k === 'send' || k === 'props' || k === 'theme' || hasOwn(publicGetters, k) || hasOwn(globals, k) || hasOwn(Som, k)),
      get: (_, k) => {
        if (typeof k !== 'string') return undefined;
        if (own(k)) return st[k];
        if (inst && hasOwn(inst.propsOptions, k)) return props[k];
        if (hasOwn(imports, k)) return imports[k];
        if (k === 'send') return send;
        if (k === 'props') return props;
        if (k === 'theme') return theme;
        if (hasOwn(publicGetters, k) || hasOwn(globals, k)) return ctx[k];
        return Som[k];
      },
      set: (_, k, v) => {
        if (own(k)) st[k] = v;
        else if (inst && hasOwn(inst.propsOptions, k)) warn(`"${k}" is a prop, so it can't be changed here. Send an event to the parent instead.`);
        else warn(`"${k}" is not a state. Declare it first: state ${k} = …`);
        return true;
      },
    });
    const h = {
      state: (k, f) => { raw[k] = f(); },
      derive: (k, f) => { raw[k] = computed(f); },
      use: (k, f) => { raw[k] = f ? f() : store(k); }, // `use cart` (a store) or `use mouse = trackMouse()` (shared logic)
      action: (k, fn) => {
        const loadingRef = ref(false);
        const errorRef = ref(null);
        const errorsRef = ref(null);
        const wrapped = function (...args) {
          errorRef.value = null;
          errorsRef.value = null;
          let res;
          try {
            res = fn.apply(this, args);
          } catch (err) {
            errorRef.value = (err && (err.data?.message || err.message)) || String(err);
            errorsRef.value = (err && (err.data?.errors || err.errors)) || null;
            throw err;
          }
          if (res && typeof res.then === 'function') {
            loadingRef.value = true;
            return res.then(
              (val) => {
                loadingRef.value = false;
                return val;
              },
              (err) => {
                loadingRef.value = false;
                errorRef.value = (err && (err.data?.message || err.message)) || String(err);
                errorsRef.value = (err && (err.data?.errors || err.errors)) || null;
                throw err;
              }
            );
          }
          return res;
        };
        Object.defineProperties(wrapped, {
          loading: { get: () => loadingRef.value, enumerable: true },
          pending: { get: () => loadingRef.value, enumerable: true },
          error: { get: () => errorRef.value, enumerable: true },
          errors: { get: () => errorsRef.value, enumerable: true },
          reset: {
            value: () => {
              loadingRef.value = false;
              errorRef.value = null;
              errorsRef.value = null;
            },
            enumerable: false,
          },
        });
        raw[k] = wrapped;
      },
      saved: (k, f, key) => {
        const storeKey = key || `${(inst && inst.def && inst.def.__name) || 'app'}.${k}`;
        raw[k] = storage.has(storeKey) ? storage.get(storeKey) : f();
        keepSaved(() => st[k], (v) => { st[k] = v; }, storeKey);
      },
      load: (k, f) => { raw[k] = resource(f); },
      share: (k, f) => share(k, f()),
      receive: (k, f, hasFallback) => { raw[k] = hasFallback ? receive(k, f()) : receive(k); },
      when: (cond, fn) => doWatch(() => !!cond(), (yes) => { if (yes) fn(); }, { immediate: true }),
      watch: (source, fn) => {
        let deep;
        doWatch(() => { const v = source(); if (deep === undefined) deep = isObject(v); return deep ? traverse(v) : v; },
          (value, old) => fn(value, old));
      },
      on: (name, fn) => {
        if (name === 'start') starts.push(fn);
        else if (inst && inst.hooks && hasOwn(inst.hooks, name) && name !== 'destroyed') inst.hooks[name].push(fn);
        else if (inst) warn(`Unknown "on ${name}". Use: on start, ready, update, show, hide or destroy.`);
      },
    };
    run(scope, h);
    starts.forEach((fn) => waitFor(safeCall(fn))); // `on start` with await is waited for by <som-wait>
    return st;
  }

  // Pure text work, shared by the browser and `som build`: .som source → its parts
  function splitSom(source, url = 'inline.som') {
    const name = (url.split('/').pop() || '').replace(/\.som.*$/i, '');
    source = source.replace(/\r\n?/g, '\n');
    // Safe linear extraction of <view> ... </view> to prevent ReDoS catastrophic backtracking
    const viewOpenIdx = source.search(/<view(\s[^>]*)?>/i);
    const viewCloseIdx = source.toLowerCase().lastIndexOf('</view>');
    if (viewOpenIdx === -1 || viewCloseIdx === -1 || viewCloseIdx <= viewOpenIdx) {
      throw new SyntaxError(`${name}.som has no <view> … </view>`);
    }
    const viewOpenTagMatch = source.slice(viewOpenIdx).match(/^<view(\s[^>]*)?>/i);
    const viewContentStart = viewOpenIdx + viewOpenTagMatch[0].length;
    const viewContent = source.slice(viewContentStart, viewCloseIdx);
    const fullViewTag = source.slice(viewOpenIdx, viewCloseIdx + 7);

    const styles = [...source.matchAll(/<style(\s[^>]*)?>([\s\S]*?)<\/style>/gi)];
    let script = source;
    [fullViewTag, ...styles.map((s) => s[0])].forEach((part) => { script = script.replace(part, (m) => m.replace(/[^\n]/g, ' ')); });
    script = script.replace(/<\/?script(\s[^>]*)?>/gi, (m) => m.replace(/[^\n]/g, ' '));
    const parsed = parseSomScript(script, url);
    return {
      name,
      template: viewContent,
      code: parsed.code,
      imports: parsed.imports,
      props: parsed.props, // name → default expression (or null)
      events: parsed.events,
      layout: parsed.layout, // undefined: not said; false: none; or a name / path
      styles: styles.map((m) => ({ css: m[2], scoped: /\bscoped\b/.test(m[1] || '') })),
    };
  }
  const propType = (sample) => (typeof sample === 'number' ? Number : typeof sample === 'boolean' ? Boolean : typeof sample === 'string' ? String : undefined);

  // parts (from the browser compiler or from `som build`) → component definition
  function makeSomDef(parts, values) {
    const def = {
      __name: parts.name,
      template: parts.template,
      props: parts.props,
      components: parts.components || {},
      init: (p, ctx = {}) => runSom(parts.run, values || {}, p, ctx.send),
    };
    if (parts.events && parts.events.length) def.events = parts.events;
    if (parts.layout !== undefined) def.layout = parts.layout;
    if (parts.scopeId) def.__scopeId = parts.scopeId;
    return def;
  }

  async function compileSom(source, url = 'inline.som') {
    const sp = splitSom(source, url);
    const { values, components } = await resolveImports(sp.imports, url);
    let run;
    try { run = new Function('$scope', '$h', `with ($scope) {\n${sp.code}\n}`); }
    catch (e) { throw new SyntaxError(`${sp.name}.som: ${e.message}`); }

    const props = {};
    for (const p in sp.props) {
      const expr = sp.props[p];
      if (expr == null) { props[p] = {}; continue; }
      const make = new Function(`return (${expr})`);
      let sample;
      try { sample = make(); } catch (_) { /* default uses something only known later */ }
      props[p] = isFunction(sample) ? { type: Function, default: sample } : { type: propType(sample), default: make };
    }

    let scopeId = null;
    sp.styles.forEach(({ css, scoped }) => {
      if (scoped) {
        scopeId = scopeId || 'data-s-' + hashString(url);
        css = scopeCss(css, scopeId);
      }
      const id = 'som-style-' + hashString(url + css);
      if (!document.getElementById(id)) {
        const el = document.createElement('style');
        el.id = id;
        el.setAttribute('data-som', url);
        el.textContent = css;
        document.head.appendChild(el);
      }
    });
    return makeSomDef({ name: sp.name, template: sp.template, props, events: sp.events, layout: sp.layout, scopeId, components, run }, values);
  }

  // Used by the app.js that `som build` writes: registers a component that is already compiled
  function defineCompiled(path, parts) {
    const abs = new URL(path, document.baseURI).href;
    somCache.set(abs, parts.loadValues
      ? lazy(() => parts.loadValues().then((values) => makeSomDef(parts, values)))
      : makeSomDef(parts, {}));
  }
  function markScope(frag, attr) {
    frag.querySelectorAll('*').forEach((el) => {
      el.setAttribute(attr, '');
      if (el.tagName === 'TEMPLATE') markScope(el.content, attr);
    });
  }
  function scopeSelector(sel, attr) {
    const deep = sel.match(/^(.*?)\s*:deep\((.*)\)\s*$/); // .card :deep(a) → reach into child components
    if (deep) return (deep[1] ? scopeSelector(deep[1], attr) : `[${attr}]`) + ' ' + deep[2];
    const m = sel.match(/^(.*?)((?:::?[\w-]+(?:\([^)]*\))?)*)$/); // insert before trailing pseudo-classes
    return m[1] + `[${attr}]` + m[2];
  }
  function scopeCss(css, attr) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const walk = (str) => {
      let out = '', pos = 0;
      while (pos < str.length) {
        const open = str.indexOf('{', pos);
        if (open < 0) { out += str.slice(pos); break; }
        let depth = 1, j = open + 1;
        while (j < str.length && depth) { if (str[j] === '{') depth++; else if (str[j] === '}') depth--; j++; }
        const sel = str.slice(pos, open).trim(), body = str.slice(open + 1, j - 1);
        if (/^@(media|supports|container|layer)/.test(sel)) out += `${sel}{${walk(body)}}`;
        else if (sel[0] === '@') out += `${sel}{${body}}`; // @keyframes, @font-face
        else out += sel.split(',').map((x) => scopeSelector(x.trim(), attr)).join(', ') + `{${body}}`;
        pos = j;
      }
      return out;
    };
    return walk(css);
  }
  const load = (url) => somComponent(url);

  /* ================================================================
   * Template engine — render a template + data to an HTML string
   *   Som.render('<li s-each="u in users">{{ u }}</li>', { users: ['Ali'] })
   * Output is escaped by default ({{ }}); use v-html for trusted HTML.
   * ================================================================ */
  function render(template, data = {}, options = {}) {
    const container = document.createElement('div');
    const app = createApp({ template, init: () => data });
    Object.entries(options.components || {}).forEach(([n, c]) => app.component(n, c));
    Object.entries(options.directives || {}).forEach(([n, c]) => app.directive(n, c));
    app.mount(container);
    const html = container.innerHTML;
    app.unmount();
    return html;
  }

  /* ================================================================
   * Router
   *   const router = Som.router({ routes: [
   *     { path: '/', component: Home },
   *     { path: '/users/:id', component: User, props: true, meta: { title: 'User' } },
   *     { path: '/old', redirect: '/' },
   *     { path: '*', component: NotFound },
   *   ] })
   *   app.use(router)  →  <som-link to="/">, <som-view>, $route, $router
   * ================================================================ */
  const ROUTER_KEY = Symbol('router');

  function compileRoute(record) {
    const keys = [];
    let pattern;
    if (record.path === '*' || /\(\.\*\)/.test(record.path)) pattern = '.*';
    else {
      pattern = record.path
        .replace(/\/$/, '')
        .replace(/[.+^${}|[\]\\]/g, '\\$&')
        .replace(/\/:(\w+)(\?)?/g, (_, name, optional) => {
          keys.push(name);
          return optional ? '(?:/([^/]+))?' : '/([^/]+)';
        })
        .replace(/\/\*$/, '(?:/.*)?');
    }
    const comp = record.component;
    return markRaw({
      ...record,
      keys,
      regex: new RegExp(`^${pattern}/?$`, 'i'),
      component: typeof comp === 'string' ? somComponent(comp)
        : isFunction(comp) && !comp.template && !comp.init ? lazy(comp) : comp,
    });
  }
  function parseQuery(qs) {
    const q = {};
    new URLSearchParams(qs).forEach((v, k) => {
      if (BAD_PATH_KEYS.has(k)) return;
      if (hasOwn(q, k)) q[k] = [].concat(q[k], v); else q[k] = v;
    });
    return q;
  }
  function stringifyQuery(q) {
    const params = new URLSearchParams();
    Object.entries(q || {}).forEach(([k, v]) => [].concat(v).forEach((x) => x != null && params.append(k, x)));
    const s = params.toString();
    return s ? '?' + s : '';
  }

  // The folder the app lives in: <base href="/demo/"> → '/demo'
  function detectBase() {
    if (typeof document === 'undefined') return '';
    const tag = document.querySelector('base[href]');
    return tag ? new URL(tag.href).pathname.replace(/\/$/, '') : '';
  }

  // mode 'history' (default): clean URLs like /users/5 — the server must send index.html for every path.
  // mode 'hash': URLs like #/users/5 — works with any server, even file://.
  // Error pages: errors/404.som, errors/403.som, errors/500.som …
  // (Som.router({ errors: 'errors' }) turns them on; `som make:errors` writes them into a project)
  const ERROR_PAGES = [401, 402, 403, 404, 419, 429, 500, 503];
  const ERROR_TITLES = { 400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 410: 'Gone', 419: 'Page Expired', 422: 'Unprocessable Content', 429: 'Too Many Requests', 500: 'Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout' };
  let activeRouter = null;

  /* ---------- route files: routes/web.som ----------
   *   Route.view('/', 'pages/Home.som').name('home').title('Home')
   *   Route.view('/users/:id', 'pages/User.som')                 // :id reaches the page as a prop
   *   Route.middleware('auth').group(() => { Route.view('/dashboard', 'pages/Dashboard.som') })
   *   Route.layout('guest').middleware('guest').group(() => { Route.view('/login', 'pages/auth/Login.som') })
   *   Route.prefix('/admin').name('admin.').group(() => { … })
   *   Route.redirect('/home', '/')
   *   Route.view('/settings', 'pages/Settings.som').children(() => { Route.view('profile', 'pages/settings/Profile.som') })
   */
  const routeFiles = new Map(); // absolute URL → function (Route) { … }  (som build puts them in app.js)
  function defineRoutes(path, fn) { routeFiles.set(new URL(path, document.baseURI).href, fn); }
  function makeRouteBuilder() {
    const top = [];
    let into = top;                                   // where new routes go (children() switches it)
    const stack = [{ prefix: '', middleware: [], name: '', layout: undefined, meta: {} }];
    const now = () => stack[stack.length - 1];
    const joinPath = (a, b) => {
      if (b === '*') return '*';
      if (!a) return b;
      return (a.replace(/\/+$/, '') + '/' + String(b).replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
    };
    function entry(rec) {
      const g = now();
      rec.path = into === top ? joinPath(g.prefix, rec.path) : rec.path; // children keep their own (relative) path
      rec.middleware = [...g.middleware];
      rec.meta = { ...g.meta };
      if (g.layout !== undefined && into === top) rec.layout = g.layout;
      if (/:\w/.test(rec.path)) rec.props = true;      // /users/:id → prop id
      into.push(rec);
      const api = {
        name(n) { rec.name = g.name + n; return api; },
        title(t) { rec.meta.title = t; return api; },
        description(d) { rec.meta.description = d; return api; },
        seo(s) { rec.meta.seo = { ...(rec.meta.seo || {}), ...(typeof s === 'object' ? s : { title: s }) }; if (s && s.title) rec.meta.title = s.title; if (s && s.description) rec.meta.description = s.description; return api; },
        meta(m) { Object.assign(rec.meta, m); return api; },
        layout(l) { rec.layout = l === false || l === 'none' ? false : l; return api; },
        middleware(...m) { rec.middleware.push(...m.flat()); return api; },
        withoutMiddleware(...m) { const drop = m.flat(); rec.middleware = rec.middleware.filter((x) => !drop.includes(x)); return api; },
        props(p) { rec.props = p; return api; },
        children(fn) {
          const saved = into; rec.children = []; into = rec.children;
          stack.push({ ...now(), prefix: '' });
          try { fn(Route); } finally { stack.pop(); into = saved; }
          return api;
        },
      };
      return api;
    }
    // Route.prefix('/admin').middleware('auth').group(() => …): attributes for every route inside
    function pending(attrs = {}) {
      const p = {
        prefix(x) { attrs.prefix = x; return p; },
        middleware(...m) { attrs.middleware = [...(attrs.middleware || []), ...m.flat()]; return p; },
        name(n) { attrs.name = n; return p; },
        layout(l) { attrs.layout = l; return p; },
        title(t) { attrs.meta = { ...(attrs.meta || {}), title: t }; return p; },
        description(d) { attrs.meta = { ...(attrs.meta || {}), description: d }; return p; },
        seo(s) { attrs.meta = { ...(attrs.meta || {}), seo: s }; return p; },
        meta(m) { attrs.meta = { ...(attrs.meta || {}), ...m }; return p; },
        group(fn) { return Route.group(attrs, fn); },
        apiResource(name, comp) { return Route.group(attrs, () => Route.apiResource(name, comp)); },
        resource(name, comp) { return Route.group(attrs, () => Route.resource(name, comp)); },
      };
      return p;
    }
    const Route = {
      view: (path, component) => entry({ path, component }),
      get: (path, component) => entry({ path, component }),
      redirect: (from, to) => { const g = now(); into.push({ path: into === top ? joinPath(g.prefix, from) : from, redirect: to }); },
      fallback: (component) => entry({ path: '*', component }),
      apiResource(name, component) {
        const r = entry({ path: '/' + String(name).replace(/^\/+/, ''), component });
        r.name(String(name).replace(/\//g, '.'));
        const res = {
          middleware: (...m) => { r.middleware(...m); return res; },
          name: (n) => { r.name(n); return res; },
          names: (n) => { r.name(typeof n === 'string' ? n : Object.values(n)[0]); return res; },
          title: (t) => { r.title(t); return res; },
          only: () => res,
          except: () => res,
        };
        return res;
      },
      resource(name, component) { return Route.apiResource(name, component); },
      group(attrs, fn) {
        if (isFunction(attrs)) { fn = attrs; attrs = {}; }
        const g = now();
        stack.push({
          prefix: joinPath(g.prefix, attrs.prefix || ''),
          middleware: [...g.middleware, ...[].concat(attrs.middleware || [])],
          name: g.name + (attrs.name || attrs.as || ''),
          layout: attrs.layout !== undefined ? attrs.layout : g.layout,
          meta: { ...g.meta, ...(attrs.meta || {}) },
        });
        try { fn(Route); } finally { stack.pop(); }
        return Route;
      },
      prefix: (x) => pending().prefix(x),
      middleware: (...m) => pending().middleware(...m),
      name: (n) => pending().name(n),
      layout: (l) => pending().layout(l),
      title: (t) => pending().title(t),
      description: (d) => pending().description(d),
      seo: (s) => pending().seo(s),
    };
    return { Route, list: top };
  }
  async function loadRouteFile(path) {
    const abs = new URL(path, document.baseURI).href;
    let fn = routeFiles.get(abs);
    if (!fn) {
      const res = await fetch(abs, { headers: fileHeaders(abs) });
      if (!res.ok) throw new Error(`Could not load the route file "${path}" (${res.status})`);
      fn = new Function('Route', `${await res.text()}\n//# sourceURL=${abs}`);
    }
    const { Route, list } = makeRouteBuilder();
    fn(Route);
    return list;
  }

  function createRouter({ routes = [], mode = 'history', base, scrollToTop = true, layout = null, layouts = null, errors = null, middleware = {} } = {}) {
    // routes: 'routes/web.som', or ['routes/web.som', 'routes/admin.som'], or the route objects themselves
    const files = [].concat(routes).filter((r) => typeof r === 'string');
    const inline = [].concat(routes).filter((r) => r && typeof r === 'object');
    const middlewares = { ...middleware };
    const errorsDir = errors === true ? 'errors' : errors ? String(errors).replace(/\/+$/, '') : null;
    if (base == null) base = mode === 'history' ? detectBase() : '';
    base = base.replace(/\/$/, '');
    const records = [];
    // children: [...] become full routes; a page shows its child in its own <som-view>
    function flatten(list, parent) {
      list.forEach((r) => {
        let path = r.path;
        if (parent && path !== '*' && path[0] !== '/') path = (parent.path.replace(/\/$/, '') + '/' + path).replace(/\/$/, '') || '/';
        const rec = compileRoute({ ...r, path });
        rec.chain = parent ? [...parent.chain, rec] : [rec];
        if (r.children) flatten(r.children, rec);
        records.push(rec); // after its children, so a child with path '' wins
      });
    }
    flatten(inline, null);
    const routesVersion = ref(0);
    // the route files load once, before the first page; their routes come after the inline ones, '*' last
    const loaded = files.length
      ? Promise.all(files.map(loadRouteFile)).then((lists) => {
        const all = lists.flat();
        flatten(all.filter((r) => r.path !== '*'), null);
        flatten(all.filter((r) => r.path === '*'), null);
        const star = records.filter((r) => r.path === '*');
        star.forEach((r) => { records.splice(records.indexOf(r), 1); records.push(r); });
        routesVersion.value++;
      }, (e) => { console.error('[Som error] ' + e.message); })
      : null;
    const levels = shallowRef([]);
    const route = reactive({ path: '/', fullPath: '/', params: {}, query: {}, hash: '', name: null, meta: {}, matched: null, error: null });
    const beforeGuards = [], afterHooks = [];
    let ready, readyResolve;
    ready = new Promise((r) => (readyResolve = r));

    function resolve(to) {
      routesVersion.value; // reactive dependency for computed links
      let path, query = {}, hash = '';
      let targetName = null;
      if (typeof to === 'string') {
        const hashIdx = to.indexOf('#');
        if (hashIdx > -1) { hash = to.slice(hashIdx); to = to.slice(0, hashIdx); }
        const qIdx = to.indexOf('?');
        if (qIdx > -1) { query = parseQuery(to.slice(qIdx + 1)); to = to.slice(0, qIdx); }

        const byName = records.find((r) => r.name === to);
        if (byName) {
          targetName = byName.name;
          path = byName.path.replace(/:(\w+)\??/g, '').replace(/\/+$/, '') || '/';
        } else {
          const byComp = records.find((r) => r.component === to || r.file === to || r.path === to);
          if (byComp) {
            targetName = byComp.name || null;
            path = byComp.path.replace(/:(\w+)\??/g, '').replace(/\/+$/, '') || '/';
          } else {
            path = to || '/';
          }
        }
      } else {
        query = to.query || {};
        hash = to.hash || '';
        if (to.name) {
          targetName = to.name;
          const rec = records.find((r) => r.name === to.name);
          if (!rec) { warn(`No route named "${to.name}".`); path = '/'; }
          else path = rec.path.replace(/:(\w+)\??/g, (_, k) => encodeURIComponent((to.params || {})[k] ?? '')).replace(/\/+$/, '') || '/';
        } else {
          path = to.path || '/';
        }
      }
      path = '/' + String(path || '').replace(/^\/+/, '');
      let matched = null, params = {};
      for (const rec of records) {
        const m = path.match(rec.regex);
        if (m) {
          matched = rec;
          rec.keys.forEach((k, i) => { if (m[i + 1] !== undefined) params[k] = decodeURIComponent(m[i + 1]); });
          break;
        }
      }
      if (!matched && targetName) {
        const namedRec = records.find((r) => r.name === targetName);
        if (namedRec) matched = namedRec;
      }
      return {
        path, query, hash, params, matched,
        name: matched ? matched.name || null : targetName,
        meta: matched ? Object.assign({}, ...matched.chain.map((r) => r.meta || {}), { middleware: [...new Set(matched.chain.flatMap((r) => r.middleware || []))] }) : {},
        fullPath: path + stringifyQuery(query) + hash,
      };
    }
    const currentLocation = () => {
      if (mode === 'hash') return location.hash.slice(1) || '/';
      let path = location.pathname;
      if (base && path.startsWith(base)) path = path.slice(base.length);
      path = path.replace(/\/index\.html?$/i, '/') || '/';
      return path + location.search + location.hash;
    };
    const href = (fullPath) => (mode === 'hash' ? '#' + fullPath : base + fullPath);
    function setURL(fullPath, replace) {
      if (mode === 'hash') { // plain hash changes also work when the page is opened from file://
        if (replace) location.replace('#' + fullPath); else location.hash = fullPath;
      } else history[replace ? 'replaceState' : 'pushState']({}, '', href(fullPath));
    }
    const onBrowserNav = () => { if (currentLocation() !== route.fullPath) navigate(currentLocation(), true, true); };

    async function navigate(to, replace = false, fromBrowser = false, depth = 0) {
      if (loaded) await loaded;
      if (depth > 10) return warn('Too many redirects.');
      const target = resolve(to);
      const from = { ...route };
      if (target.matched && target.matched.redirect) {
        const r = target.matched.redirect;
        return navigate(isFunction(r) ? r(target) : r, true, false, depth + 1);
      }
      const guards = [...beforeGuards];
      if (target.matched) target.matched.chain.forEach((r) => { if (r.guard) guards.push(r.guard); });
      // middleware('auth', 'role:admin') from the routes: the functions given to Som.router({ middleware })
      if (target.matched) {
        const names = [...new Set(target.matched.chain.flatMap((r) => r.middleware || []))];
        names.forEach((m) => {
          const [name, args = ''] = String(m).split(':');
          const fn = middlewares[name];
          if (!fn) { warn(`No middleware "${name}". Add it: Som.router({ middleware: { ${name}: (to, from) => … } })`); return; }
          guards.push((t, f) => fn(t, f, ...(args ? args.split(',') : [])));
        });
      }
      for (const guard of guards) {
        let result;
        try { result = await guard(target, from); } catch (e) { console.error('[Som error] in route guard', e); return; }
        if (result === false) {
          if (fromBrowser) setURL(route.fullPath, true); // undo the URL change
          return;
        }
        if (typeof result === 'string' || isObject(result)) return navigate(result, true, false, depth + 1);
      }
      if (!fromBrowser) setURL(target.fullPath, replace);
      Object.assign(route, target, { error: null });
      const rec = target.matched;
      if (!rec && errorsDir) { // no route for this address: errors/404.som
        showError(404, '');
        afterHooks.forEach((h) => { try { h(route, from); } catch (e) { console.error(e); } });
        return readyResolve();
      }
      const propsOf = (r) => (r.props ? (isFunction(r.props) ? r.props(target) : r.props === true ? { ...target.params } : r.props) : {});
      const next = rec ? rec.chain.map((r) => ({ component: r.component, props: propsOf(r) })) : [];
      if (rec) { // the layout from the route: the deepest route that names one
        const own = [...rec.chain].reverse().find((r) => hasOwn(r, 'layout'));
        next[0].layout = own ? own.layout : undefined;
      }
      levels.value = next;
      applySEO({
        title: target.meta.title,
        description: target.meta.description,
        ...(target.meta.seo || {}),
      });
      if (scrollToTop && !fromBrowser && !target.hash && typeof window.scrollTo === 'function') {
        try { window.scrollTo(0, 0); } catch (_) { /* not available */ }
      }
      afterHooks.forEach((h) => { try { h(route, from); } catch (e) { console.error(e); } });
      readyResolve();
    }

    // shows errors/<status>.som in place of the page; the address stays as it is
    function showError(status, message) {
      status = Number(status) || 500;
      const file = ERROR_PAGES.includes(status) ? status : 'error'; // errors/error.som for any other status
      const component = somComponent(`${errorsDir}/${file}.som`);
      route.error = { status, message: message || '' };
      levels.value = [{ component, isError: true, props: { status, message: message || '', title: ERROR_TITLES[status] || 'Error' } }];
      applySEO({ title: `${status} | ${ERROR_TITLES[status] || 'Error'}`, robots: 'noindex' }); // an error page must not be indexed, nor keep the last page's tags
    }

    const router = {
      route: readonly(route),
      // $router.abort(404) / abort(403, 'Only the owner can see this.')
      abort(status = 500, message = '') {
        if (!errorsDir) { warn(`abort(${status}): turn error pages on with Som.router({ errors: 'errors', routes })`); return; }
        showError(status, message);
      },
      __errors: errorsDir,
      resolve, href: (to) => href(resolve(to).fullPath),
      // go('/users/5') or go({ name: 'user', params: { id: 5 } }) navigates; go(-1) moves through history
      go: (to) => (typeof to === 'number' ? history.go(to) : navigate(to, false)),
      replace: (to) => navigate(to, true),
      back: () => history.back(),
      forward: () => history.forward(),
      before: (fn) => { beforeGuards.push(fn); return () => beforeGuards.splice(beforeGuards.indexOf(fn), 1); },
      // router.middleware('auth', (to, from) => …): a name the routes can use; return a path to send the visitor there
      middleware(name, fn) { middlewares[name] = fn; return router; },
      after: (fn) => { afterHooks.push(fn); return () => afterHooks.splice(afterHooks.indexOf(fn), 1); },
      ready: () => ready,
      routes: records,
      __levels: levels,
      __layout: layout,
      __layouts: layouts,
      install(app) {
        app.share(ROUTER_KEY, router);
        app.globals.$router = router;
        app.globals.$route = route;
        app.component('SomLink', {
          props: {
            to: { type: [String, Object], required: true },
            replace: Boolean,
            activeClass: { type: String, default: 'som-link-active' },
            exactClass: { type: String, default: 'som-link-exact' },
          },
          init(props) {
            const target = computed(() => resolve(props.to));
            const exact = computed(() => route.path === target.value.path || (Boolean(target.value.name) && route.name === target.value.name));
            const active = computed(() => exact.value || (Boolean(target.value.name) && Boolean(route.name) && route.name.startsWith(target.value.name + '.')) || (target.value.path !== '/' && route.path.startsWith(target.value.path + '/')));
            return {
              href: computed(() => href(target.value.fullPath)),
              classes: computed(() => ({ [props.activeClass]: active.value, [props.exactClass]: exact.value })),
              navigate(e) {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return; // let the browser open a new tab
                e.preventDefault();
                props.replace ? router.replace(props.to) : router.go(props.to);
              },
            };
          },
          template: '<a :href="href" :class="classes" @click="navigate($event)"><slot></slot></a>',
        });
        // an old hash link like /demo/#/users becomes the clean /demo/users
        if (mode === 'history' && location.hash.startsWith('#/')) {
          history.replaceState(history.state, '', href(location.hash.slice(1)));
        }
        window.addEventListener('popstate', onBrowserNav);
        if (mode === 'hash') window.addEventListener('hashchange', onBrowserNav);
        activeRouter = router;
        navigate(currentLocation(), true, true);
      },
    };
    return router;
  }
  // abort(404) in any .som file or in JavaScript
  const abortPage = (status, message) => { if (activeRouter) activeRouter.abort(status, message); else warn('abort() needs a router.'); };
  const currentRouter = () => receive(ROUTER_KEY, null);
  const currentRoute = () => { const r = receive(ROUTER_KEY, null); return r && r.route; };

  /* ================================================================
   * Validation — expressive rules, the same in the browser and on the server
   *   Som.validate({ title: '' }, { title: 'required|min:3' })
   *     → { title: ['The title field is required.'] }   ({} when everything is fine)
   *   const post = Som.form({ title: '', email: '' }, { title: 'required|min:3', email: 'required|email' })
   *     s-model="post.title" · {post.$error('title')} · post.$valid · await post.$submit(api.post…)
   * ================================================================ */
  const validationMessages = {
    required: 'The :attribute field is required.',
    required_if: 'The :attribute field is required when :other is :value.',
    accepted: 'The :attribute field must be accepted.',
    string: 'The :attribute field must be text.',
    numeric: 'The :attribute field must be a number.',
    integer: 'The :attribute field must be a whole number.',
    boolean: 'The :attribute field must be true or false.',
    array: 'The :attribute field must be a list.',
    json: 'The :attribute field must be valid JSON.',
    uuid: 'The :attribute field must be a valid UUID.',
    ip: 'The :attribute field must be a valid IP address.',
    ipv4: 'The :attribute field must be a valid IPv4 address.',
    starts_with: 'The :attribute field must start with one of: :values.',
    ends_with: 'The :attribute field must end with one of: :values.',
    lowercase: 'The :attribute field must be lowercase.',
    uppercase: 'The :attribute field must be uppercase.',
    gt: { numeric: 'The :attribute field must be greater than :value.', string: 'The :attribute field must be longer than :value characters.', array: 'The :attribute field must have more than :value items.' },
    gte: { numeric: 'The :attribute field must be at least :value.', string: 'The :attribute field must be at least :value characters.', array: 'The :attribute field must have :value items or more.' },
    lt: { numeric: 'The :attribute field must be less than :value.', string: 'The :attribute field must be shorter than :value characters.', array: 'The :attribute field must have fewer than :value items.' },
    lte: { numeric: 'The :attribute field must be at most :value.', string: 'The :attribute field must be at most :value characters.', array: 'The :attribute field must have :value items or fewer.' },
    required_with: 'The :attribute field is required when :values is present.',
    required_without: 'The :attribute field is required when :values is not present.',
    prohibited: 'The :attribute field must not be sent.',
    filled: 'The :attribute field must have a value.',
    present: 'The :attribute field must be present.',
    decimal: 'The :attribute field must have :decimal decimal places.',
    email: 'The :attribute field must be a valid email address.',
    url: 'The :attribute field must be a valid URL.',
    alpha: 'The :attribute field must only contain letters.',
    alpha_num: 'The :attribute field must only contain letters and numbers.',
    alpha_dash: 'The :attribute field must only contain letters, numbers, dashes and underscores.',
    date: 'The :attribute field must be a valid date.',
    after: 'The :attribute field must be a date after :date.',
    before: 'The :attribute field must be a date before :date.',
    in: 'The selected :attribute is invalid.',
    not_in: 'The selected :attribute is invalid.',
    same: 'The :attribute field must match :other.',
    different: 'The :attribute field and :other must be different.',
    confirmed: 'The :attribute field confirmation does not match.',
    regex: 'The :attribute field format is invalid.',
    digits: 'The :attribute field must be :digits digits.',
    min: { string: 'The :attribute field must be at least :min characters.', numeric: 'The :attribute field must be at least :min.', array: 'The :attribute field must have at least :min items.' },
    max: { string: 'The :attribute field must not be greater than :max characters.', numeric: 'The :attribute field must not be greater than :max.', array: 'The :attribute field must not have more than :max items.' },
    between: { string: 'The :attribute field must be between :min and :max characters.', numeric: 'The :attribute field must be between :min and :max.', array: 'The :attribute field must have between :min and :max items.' },
    size: { string: 'The :attribute field must be :size characters.', numeric: 'The :attribute field must be :size.', array: 'The :attribute field must contain :size items.' },
  };
  const isEmptyValue = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (isArray(v) && !v.length);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const dateOf = (v, data) => { const d = new Date(hasOwn(data, v) ? data[v] : v === 'today' ? new Date().toDateString() : v); return isNaN(d) ? null : d; };
  function parseRules(rules) {
    return (isArray(rules) ? rules : String(rules || '').split('|')).filter(Boolean).map((r) => {
      if (isFunction(r)) return { fn: r };
      const i = r.indexOf(':');
      const name = (i < 0 ? r : r.slice(0, i)).trim();
      const arg = i < 0 ? '' : r.slice(i + 1);
      return { name, arg, args: name === 'regex' ? [arg] : arg ? arg.split(',') : [] };
    });
  }
  function validate(data, rules, options = {}) {
    data = data || {};
    const errors = {};
    const msgs = options.messages || {};
    const names = options.names || {};
    const only = options.only ? new Set([].concat(options.only)) : null;
    for (const field of Object.keys(rules || {})) {
      if (only && !only.has(field)) continue;
      const list = parseRules(rules[field]);
      const value = getPath(data, field);
      const attribute = names[field] || (hasTranslation(`validation.attributes.${field}`) ? getTranslation(`validation.attributes.${field}`) : field.replace(/[_.]/g, ' '));
      const numericField = list.some((r) => r.name === 'numeric' || r.name === 'integer') || typeof value === 'number';
      const kind = isArray(value) ? 'array' : numericField ? 'numeric' : 'string';
      const sizeOf = (v) => (isArray(v) ? v.length : numericField ? Number(v) : String(v == null ? '' : v).length);
      const empty = isEmptyValue(value);
      const has = (n) => list.some((r) => r.name === n);
      if (empty && !has('required') && !has('required_if') && !has('required_with') && !has('required_without') && !has('accepted') && !has('present') && !has('filled')) continue; // optional and empty: nothing else to check
      if (has('sometimes') && !hasOwn(data, field)) continue;
      for (const r of list) {
        let failed = false, extra = {};
        if (r.fn) {
          const res = r.fn(value, data);
          if (res === true || res === undefined || res === null) continue;
          (errors[field] || (errors[field] = [])).push(typeof res === 'string' ? res : `The ${attribute} field is invalid.`);
          break;
        }
        const [a, b] = r.args;
        switch (r.name) {
          case 'required': failed = empty; break;
          case 'required_if': failed = empty && String(getPath(data, a)) === String(b); extra = { other: a.replace(/_/g, ' '), value: b }; break;
          case 'accepted': failed = ![true, 'true', 1, '1', 'yes', 'on'].includes(value); break;
          case 'nullable': case 'sometimes': case 'bail': break;
          case 'string': failed = typeof value !== 'string'; break;
          case 'numeric': failed = value === '' || isNaN(Number(value)); break;
          case 'integer': failed = !/^-?\d+$/.test(String(value)); break;
          case 'boolean': failed = ![true, false, 0, 1, '0', '1', 'true', 'false'].includes(value); break;
          case 'email': failed = !EMAIL_RE.test(String(value)); break;
          case 'url': try { const u = new URL(String(value)); failed = !/^https?:$/.test(u.protocol); } catch (_) { failed = true; } break;
          case 'alpha': failed = !/^[\p{L}\p{M}]+$/u.test(String(value)); break;
          case 'alpha_num': failed = !/^[\p{L}\p{M}\p{N}]+$/u.test(String(value)); break;
          case 'alpha_dash': failed = !/^[\p{L}\p{M}\p{N}_-]+$/u.test(String(value)); break;
          case 'date': failed = isNaN(new Date(value)); break;
          case 'after': { const d = dateOf(a, data); failed = !d || !(new Date(value) > d); extra = { date: a }; break; }
          case 'before': { const d = dateOf(a, data); failed = !d || !(new Date(value) < d); extra = { date: a }; break; }
          case 'in': failed = !r.args.includes(String(value)); break;
          case 'not_in': failed = r.args.includes(String(value)); break;
          case 'same': failed = value !== getPath(data, a); extra = { other: a.replace(/_/g, ' ') }; break;
          case 'different': failed = value === getPath(data, a); extra = { other: a.replace(/_/g, ' ') }; break;
          case 'confirmed': failed = value !== getPath(data, field + '_confirmation'); break;
          case 'regex': { const m = r.arg.match(/^\/(.*)\/([a-z]*)$/); failed = !new RegExp(m ? m[1] : r.arg, m ? m[2] : '').test(String(value)); break; }
          case 'digits': failed = !new RegExp(`^\\d{${Number(a)}}$`).test(String(value)); extra = { digits: a }; break;
          case 'min': failed = sizeOf(value) < Number(a); extra = { min: a }; break;
          case 'max': failed = sizeOf(value) > Number(a); extra = { max: a }; break;
          case 'between': failed = sizeOf(value) < Number(a) || sizeOf(value) > Number(b); extra = { min: a, max: b }; break;
          case 'size': failed = sizeOf(value) !== Number(a); extra = { size: a }; break;
          case 'array': failed = !isArray(value) && !(isObject(value) && !r.args.length); break;
          case 'json': try { JSON.parse(String(value)); } catch (_) { failed = true; } break;
          case 'uuid': failed = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value)); break;
          case 'ip': case 'ipv4': failed = !/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(value)) && (r.name === 'ipv4' || !/^[0-9a-f:]+$/i.test(String(value)) || !String(value).includes(':')); break;
          case 'starts_with': failed = !r.args.some((p) => String(value).startsWith(p)); extra = { values: r.args.join(', ') }; break;
          case 'ends_with': failed = !r.args.some((p) => String(value).endsWith(p)); extra = { values: r.args.join(', ') }; break;
          case 'lowercase': failed = String(value) !== String(value).toLowerCase(); break;
          case 'uppercase': failed = String(value) !== String(value).toUpperCase(); break;
          case 'gt': case 'gte': case 'lt': case 'lte': {
            const other = hasOwn(data, a) ? sizeOf(getPath(data, a)) : Number(a), v = sizeOf(value);
            failed = !(r.name === 'gt' ? v > other : r.name === 'gte' ? v >= other : r.name === 'lt' ? v < other : v <= other);
            extra = { value: hasOwn(data, a) ? a.replace(/_/g, ' ') : a }; break;
          }
          case 'required_with': failed = empty && r.args.some((f) => !isEmptyValue(getPath(data, f))); extra = { values: r.args.join(', ') }; break;
          case 'required_without': failed = empty && r.args.some((f) => isEmptyValue(getPath(data, f))); extra = { values: r.args.join(', ') }; break;
          case 'prohibited': failed = !empty; break;
          case 'filled': failed = hasOwn(data, field) && empty; break;
          case 'present': failed = !hasOwn(data, field); break;
          case 'decimal': failed = !new RegExp(`^-?\\d+(\\.\\d{${a}${b ? ',' + b : ''}})${Number(a) === 0 ? '?' : ''}$`).test(String(value)); extra = { decimal: b ? `${a}-${b}` : a }; break;
          default: warn(`Unknown validation rule "${r.name}" for ${field}.`);
        }
        if (!failed) continue;
        let text = msgs[`${field}.${r.name}`] || msgs[r.name];
        if (!text && hasTranslation(`validation.${field}.${r.name}`)) text = getTranslation(`validation.${field}.${r.name}`);
        if (!text && hasTranslation(`validation.${r.name}`)) text = getTranslation(`validation.${r.name}`);
        if (!text) text = validationMessages[r.name] || 'The :attribute field is invalid.';
        if (isObject(text)) text = text[kind] || text.string || text;
        text = text.replace(/:attribute/g, attribute).replace(/:(\w+)/g, (m, k) => (hasOwn(extra, k) ? extra[k] : m));
        (errors[field] || (errors[field] = [])).push(text);
        if (r.name === 'required' || r.name === 'required_if') break; // nothing else matters when it's missing
      }
    }
    return errors;
  }
  validate.messages = validationMessages; // change these to translate the messages

  // a form: its values, its errors, and a submit that never sends a form with mistakes
  function form(initial = {}, rules = {}, options = {}) {
    const start = cloneState(initial);
    const f = reactive(cloneState(initial));
    const raw = toRaw(f);
    const meta = reactive({ errors: {}, touched: {}, submitted: false, busy: false });
    const values = () => Object.fromEntries(Object.keys(raw).map((k) => [k, f[k]]));
    const recheck = (only) => {
      const found = validate(values(), rules, { ...options, only });
      if (!only) { meta.errors = found; return found; }
      const next = { ...meta.errors };
      [].concat(only).forEach((k) => { if (found[k]) next[k] = found[k]; else delete next[k]; });
      meta.errors = next;
      return found;
    };
    const hide = (k, v) => Object.defineProperty(raw, k, isFunction(v) || !v || !v.get ? { value: v, enumerable: false, configurable: true } : { ...v, enumerable: false, configurable: true });
    hide('$errors', { get: () => meta.errors });
    hide('$busy', { get: () => meta.busy });
    hide('$submitted', { get: () => meta.submitted });
    hide('$valid', { get: () => !Object.keys(validate(values(), rules, options)).length });
    hide('$error', (k) => (meta.errors[k] && meta.errors[k][0]) || '');
    hide('$values', values);
    hide('$check', (k) => { if (!k) meta.submitted = true; const found = recheck(k); return !Object.keys(found).length; });
    hide('$setErrors', (e) => { meta.errors = { ...((e && e.errors) || e || {}) }; });
    hide('$reset', (next) => {
      const fresh = cloneState(next || start);
      Object.keys(raw).forEach((k) => { f[k] = fresh[k]; });
      meta.errors = {}; meta.touched = {}; meta.submitted = false;
    });
    // checks first; sends only a form without mistakes; a 422 from the server fills the same errors
    hide('$submit', async (send) => {
      meta.submitted = true;
      if (Object.keys(recheck()).length) return false;
      meta.busy = true;
      try { const r = send ? await send(values()) : true; return r === undefined ? true : r; } // no error = success
      catch (e) {
        if (e && e.errors && isObject(e.errors) && Object.keys(e.errors).length) { meta.errors = { ...e.errors }; return false; }
        throw e;
      } finally { meta.busy = false; }
    });
    // after the first submit, or once a field has been changed, its errors follow your typing
    Object.keys(raw).forEach((k) => {
      doWatch(() => {
        const v = f[k];
        if (!isObject(v)) return v;
        try { return JSON.stringify(v); } catch (_) { return v; }
      }, () => {
        meta.touched[k] = true;
        if (meta.submitted || meta.errors[k] || options.live) recheck(k);
      });
    });
    return f;
  }

  /* ================================================================
   * Som.table('posts') — the rows of a database table that `som dev --db` / `som serve --db` serve
   *   const posts = Som.table('posts')
   *   await posts.all({ userId: 3, _sort: '-id', _limit: 20 })   posts.find(1)   posts.count()
   *   await posts.create({ title })   posts.update(1, row)   posts.patch(1, { title })   posts.remove(1)
   * ================================================================ */
  function table(name, { api: client = api, base = '/api' } = {}) {
    const url = base.replace(/\/+$/, '') + '/' + encodeURIComponent(name);
    const one = (id) => url + '/' + encodeURIComponent(id);
    return {
      name,
      all: (query, opts) => client.get(url, { ...opts, query: { ...(opts && opts.query), ...query } }),
      find: (id, opts) => client.get(one(id), opts),
      count: async (query) => {
        const r = await client.get(url, { query: { ...query, _limit: 1 }, full: true });
        return Number(r.headers && r.headers.get ? r.headers.get('X-Total-Count') : 0) || 0;
      },
      create: (data, opts) => client.post(url, data, opts),
      update: (id, data, opts) => client.put(one(id), data, opts),
      patch: (id, data, opts) => client.patch(one(id), data, opts),
      remove: (id, opts) => client.delete(one(id), opts),
    };
  }

  /* ================================================================
   * Developer tools (used by `som dev`: hot reload and the DevTools panel)
   * ================================================================ */
  const isInside = (i, o) => { for (let p = i.parent; p; p = p.parent) if (p === o) return true; return false; };
  /* ================================================================
   * Som.selection(items, key = 'id') — reactive multi-row selection for tables & bulk actions
   *   use sel = Som.selection(() => items)
   *   sel.ids, sel.count, sel.all, sel.has(id), sel.toggle(id), sel.toggleAll(), sel.clear()
   * ================================================================ */
  function selection(itemsSource, key = 'id') {
    const getItems = isFunction(itemsSource) ? itemsSource : () => itemsSource;
    const selected = reactive([]);
    const getKey = (item) => (isObject(item) ? item[key] : item);

    return reactive({
      ids: selected,
      get count() { return selected.length; },
      get all() {
        const items = getItems() || [];
        return items.length > 0 && items.every((i) => selected.includes(getKey(i)));
      },
      has(idOrItem) {
        const k = getKey(idOrItem);
        return selected.includes(k);
      },
      toggle(idOrItem) {
        const k = getKey(idOrItem);
        const idx = selected.indexOf(k);
        if (idx >= 0) selected.splice(idx, 1);
        else selected.push(k);
      },
      toggleAll() {
        const items = getItems() || [];
        if (this.all) {
          selected.length = 0;
        } else {
          selected.length = 0;
          for (const i of items) selected.push(getKey(i));
        }
      },
      select(...idOrItems) {
        for (const item of idOrItems) {
          const k = getKey(item);
          if (!selected.includes(k)) selected.push(k);
        }
      },
      deselect(...idOrItems) {
        for (const item of idOrItems) {
          const k = getKey(item);
          const idx = selected.indexOf(k);
          if (idx >= 0) selected.splice(idx, 1);
        }
      },
      clear() { selected.length = 0; },
    });
  }

  const keepable = (v) => !isFunction(v) && !isRef(v) && !isReactive(v);
  function stateOf(inst) {
    const out = {};
    [inst.setupState, inst.data].forEach((s) => {
      const raw = toRaw(s);
      Object.keys(raw).forEach((k) => { if (keepable(raw[k])) out[k] = raw[k]; });
    });
    return out;
  }
  // rebuild one live component with its new definition, keeping its state values
  function remount(inst) {
    const h = inst.hot;
    const start = h && h.start(), end = h && h.end();
    if (!start || !start.parentNode) return;
    const kept = cloneState(stateOf(inst));
    const el = h.el.cloneNode(true);
    end.parentNode.insertBefore(el, end.nextSibling);
    inst.scope.stop();
    removeRange(start, end);
    const run = () => mountComponent(el, inst.def, h.parentScope, inst.parent, h.options);
    const fresh = h.owner && h.owner.active ? h.owner.run(run) : run();
    if (!fresh) return;
    [fresh.setupState, fresh.data].forEach((s) => {
      const raw = toRaw(s);
      Object.keys(kept).forEach((k) => { if (hasOwn(raw, k) && keepable(raw[k])) s[k] = kept[k]; });
    });
  }
  // a .som file changed: compile it again and swap every live copy (false = reload the page instead)
  async function hotUpdate(url, source) {
    const abs = new URL(url, document.baseURI).href;
    const entry = somCache.get(abs);
    if (!entry) return true; // not used yet: it will be loaded fresh
    const old = entry.__loader ? entry.__resolved : entry;
    if (!old) return false;
    const oldStyles = [...document.querySelectorAll('style[data-som]')].filter((st) => st.getAttribute('data-som') === abs);
    oldStyles.forEach((st) => { st.id += '-old'; });
    let fresh;
    try { fresh = await compileSom(source, abs); }
    catch (e) { oldStyles.forEach((st) => { st.id = st.id.replace(/-old$/, ''); }); throw e; }
    oldStyles.forEach((st) => st.remove());
    Object.keys(old).forEach((k) => delete old[k]);
    Object.assign(old, fresh);
    const list = [...liveInstances].filter((i) => i.def === old);
    list.filter((i) => !list.some((o) => o !== i && isInside(i, o))).forEach(remount);
    return true;
  }
  // register a component definition directly (used by Vite plugin and bundlers)
  function registerDef(path, def) {
    if (!path || !def) return def;
    somCache.set(path, def);
    if (typeof document !== 'undefined') {
      try {
        const abs = new URL(path, document.baseURI).href;
        somCache.set(abs, def);
      } catch (_) {}
    }
    return def;
  }
  // a component module was hot-reloaded by Vite/HMR: swap its definition in place
  function hotDef(id, newDef) {
    if (!id || !newDef) return false;
    let old = somCache.get(id);
    if (!old && typeof document !== 'undefined') {
      try { old = somCache.get(new URL(id, document.baseURI).href); } catch (_) {}
    }
    const fresh = newDef && newDef.__resolved ? newDef.__resolved : newDef;
    if (!old) {
      registerDef(id, fresh);
      return true;
    }
    const target = old.__loader ? old.__resolved : old;
    if (!target) {
      registerDef(id, fresh);
      return true;
    }
    Object.keys(target).forEach((k) => delete target[k]);
    Object.assign(target, fresh);
    const list = [...liveInstances].filter((i) => i.def === target);
    list.filter((i) => !list.some((o) => o !== i && isInside(i, o))).forEach(remount);
    return true;
  }
  const busLog = [];
  const devtools = {
    instances: () => [...liveInstances],
    describe(inst) {
      const derived = {};
      [inst.setupState, inst.opts].forEach((s) => {
        const raw = toRaw(s);
        Object.keys(raw).forEach((k) => { if (isRef(raw[k])) { try { derived[k] = raw[k].value; } catch (_) { /* skip */ } } });
      });
      return {
        uid: inst.uid, name: inst.def.__name || inst.def.__label || inst.def.name || 'Anonymous', parent: inst.parent ? inst.parent.uid : null,
        props: { ...toRaw(inst.props) }, state: stateOf(inst), derived, kept: !!inst.keep,
      };
    },
    set(inst, key, value) { inst.ctx[key] = value; },
    element: (inst) => inst.getEl(),
    stores, storeLog, busLog,
  };

  const VERSION = '3.0.0';
  const Som = {
    version: VERSION,
    // PUBLIC_ values from .env (som dev and som build put them here); never secrets
    get env() { return Object.freeze({ ...((typeof window !== 'undefined' && window.__SOM_ENV__) || {}) }); },
    get isVite() {
      return Boolean(typeof window !== 'undefined' && window.__SOM_VITE__);
    },
    get isElectron() {
      return Boolean(
        typeof window !== 'undefined' && (
          window.somDesktop ||
          (window.process && window.process.type === 'renderer') ||
          (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent))
        )
      );
    },
    get desktop() {
      return (typeof window !== 'undefined' && window.somDesktop) || null;
    },
    abort: abortPage,
    // apps & components
    app: createApp, lazy, load, compileSom, render,
    // used by `som build`, Vite plugin and the app.js it writes
    __makeDef: makeSomDef,
    __registerDef: registerDef,
    __hotDef: hotDef,
    __define: defineCompiled,
    __routes: defineRoutes,
    __fileHeaders: (url) => fileHeaders(new URL(url, document.baseURI).href),
    __npmBase: '/__som/npm/', // where som dev serves files from node_modules (CSS imports)
    __import: (url) => import(url), // how built apps load the .js modules a .som file imports
    __precompiled: precompiled,
    __hot: hotUpdate,
    __devtools: devtools,
    __presetCss: PRESET_CSS,
    // reactivity
    signal: ref, state, derived: computed, readonly, isSignal: isRef, isState: isReactive,
    read: unref, unwrap: toRaw, raw: markRaw,
    // saving data, talking to servers
    saved, storage, api, ApiError, resource, table, validate, form, selection, theme, slug, seo: (s) => applySEO(s, false), useSeo: (s) => applySEO(s, false),
    cleanHtml, sanitizeHtml: cleanHtml, escapeHtml, e: escapeHtml, stripTags,
    stripTypeScript,
    // localization & i18n
    locale: getLocale, fallbackLocale: getFallbackLocale, locales: listLocales,
    translations: registerTranslations,
    dir: (loc) => (isRtlLocale(loc || currentLocaleRef.value) ? 'rtl' : 'ltr'),
    isRtl: (loc) => isRtlLocale(loc || currentLocaleRef.value),
    __: getTranslation, t: getTranslation, trans: getTranslation,
    choice: choiceTranslation, transChoice: choiceTranslation, trans_choice: choiceTranslation,
    hasTranslation,
    formatNumber, formatCurrency, formatDate,
    // reacting to changes
    watch, effect: watchEffect, tick: nextTick, onCleanup: onScopeDispose,
    // sharing data
    store, bus, createBus, share, receive,
    // lifecycle (inside init)
    onReady, onDestroy, onDestroyed, onUpdate, onShow, onHide,
    onMounted, onUnmounted, onBeforeUnmount, onUpdated,
    useInterval, useTimeout, useInactivityTimer,
    // router
    router: createRouter, currentRoute, currentRouter,
  };

  // the text-only helpers the build tool reuses, so built code matches the browser exactly
  Object.defineProperty(Som, '__internal', {
    value: { expandBlocks, splitSom, splitInterp, exactBrace, stripBrace, interpToExpr, quoteBraceAttrs, expandSelfClosing, scopeCss, hashString, propType, simplePathRE, fnExpRE, forAliasRE, makeSomDef, compileFn, evaluate, stripTypeScript, stripTsParams },
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = Som;
  global.Som = Som;
})(typeof window !== 'undefined' ? window : globalThis);
