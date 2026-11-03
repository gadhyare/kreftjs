/*
 * Som.js Localization (i18n & l10n) Engine
 *
 * Full Laravel-compatible localization support with the [lang] folder:
 *   lang/en/auth.json         -> __('auth.failed')
 *   lang/en/messages.json     -> __('messages.welcome', { name: 'Ali' })
 *   lang/en/validation.json   -> __('validation.required')
 *   lang/en/pagination.json   -> __('pagination.next')
 *   lang/en/passwords.json    -> __('passwords.sent')
 *   lang/en.json              -> __('Sign In') (root JSON translation strings)
 *   lang/ar/auth.json         -> __('auth.failed') in Arabic
 *   lang/ar.json              -> __('Sign In') in Arabic
 *
 * Pluralization (trans_choice / Lang.choice):
 *   '{0} None|{1} One|[2,*] :count items'
 *   'minute|minutes'
 *   '{0} لا توجد عناصر|{1} عنصر واحد|{2} عنصران|[3,10] :count عناصر|[11,*] :count عنصراً'
 *
 * Case-preserving placeholders:
 *   :name -> 'ali', :Name -> 'Ali', :NAME -> 'ALI'
 */
const fs = require('fs');
const path = require('path');
const { parseJson } = require('./safe-json.js');

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const RTL_LOCALES = new Set(['ar', 'fa', 'ur', 'he', 'yi', 'ps', 'sd', 'ug', 'ckb', 'ku', 'dv', 'arc', 'syr']);

function isRtl(locale) {
  if (!locale) return false;
  const lang = String(locale).toLowerCase().split(/[-_]/)[0];
  return RTL_LOCALES.has(lang);
}

function dir(locale) {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}

function findLangDirs(startDir = process.cwd()) {
  const dirs = [];
  const visited = new Set();
  const add = (d) => {
    if (!d) return;
    const resolved = path.resolve(d);
    if (!visited.has(resolved) && isDir(resolved)) {
      visited.add(resolved);
      dirs.push(resolved);
    }
  };

  // 1. Direct lang folder in current working directory
  add(path.join(startDir, 'lang'));
  add(path.join(startDir, 'backend', 'lang'));
  add(path.join(startDir, 'resources', 'lang'));

  // 2. Discover via layout helper if available
  try {
    const { layout } = require('./layout.js');
    const lay = layout(startDir);
    if (lay.project) {
      add(path.join(lay.project, 'lang'));
      add(path.join(lay.project, 'backend', 'lang'));
      add(path.join(lay.project, 'resources', 'lang'));
      add(path.join(lay.project, 'frontend', 'lang'));
    }
    if (lay.backend) {
      add(path.join(lay.backend, 'lang'));
    }
  } catch (_) {}

  return dirs;
}

function deepMerge(target, source) {
  const out = { ...target };
  if (!source || typeof source !== 'object') return out;
  for (const [k, v] of Object.entries(source)) {
    if (BAD_KEYS.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(out[k] || {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function scanLangDir(dirPath) {
  const result = {};
  const dirs = Array.isArray(dirPath) ? dirPath : [dirPath];

  for (const d of dirs) {
    if (!d || !isDir(d)) continue;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { continue; }

    for (const ent of entries) {
      if (BAD_KEYS.has(ent.name)) continue;

      // Single file locale: lang/en.json, lang/ar.json, lang/en.js
      if (ent.isFile() && /\.(json|js|cjs|mjs)$/i.test(ent.name)) {
        const loc = ent.name.replace(/\.(json|js|cjs|mjs)$/i, '').toLowerCase();
        const fullPath = path.join(d, ent.name);
        try {
          let data;
          if (ent.name.endsWith('.json')) {
            data = parseJson(fs.readFileSync(fullPath, 'utf8'));
          } else {
            data = require(fullPath);
          }
          if (data && typeof data === 'object') {
            result[loc] = deepMerge(result[loc] || {}, data);
          }
        } catch (_) {}
      }

      // Locale directory: lang/en/, lang/ar/, lang/fr/
      if (ent.isDirectory()) {
        const loc = ent.name.toLowerCase();
        const subDir = path.join(d, ent.name);
        let subEntries;
        try { subEntries = fs.readdirSync(subDir, { withFileTypes: true }); } catch (_) { continue; }

        for (const subEnt of subEntries) {
          if (BAD_KEYS.has(subEnt.name)) continue;
          if (subEnt.isFile() && /\.(json|js|cjs|mjs)$/i.test(subEnt.name)) {
            const group = subEnt.name.replace(/\.(json|js|cjs|mjs)$/i, '');
            const fullPath = path.join(subDir, subEnt.name);
            try {
              let data;
              if (subEnt.name.endsWith('.json')) {
                data = parseJson(fs.readFileSync(fullPath, 'utf8'));
              } else {
                data = require(fullPath);
              }
              if (data && typeof data === 'object') {
                if (!result[loc]) result[loc] = {};
                result[loc][group] = deepMerge(result[loc][group] || {}, data);
              }
            } catch (_) {}
          }
        }
      }
    }
  }

  return result;
}

// Laravel-compatible case-preserving placeholder replacement
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

// Laravel MessageSelector choose implementation
function choose(line, number, locale = 'en') {
  if (!line || typeof line !== 'string') return '';
  const n = Number(number) || 0;
  const segments = line.split('|').map((s) => s.trim());

  // 1. Explicit bracket ranges: {0}, {1}, [1,4], [5,*], [*,10]
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

  // 2. Standard 2-part singular|plural fallback
  if (segments.length === 2) {
    return n === 1 ? segments[0] : segments[1];
  }

  // 3. Multi-part matching Intl.PluralRules
  if (segments.length > 2) {
    let pr = 'other';
    try { pr = new Intl.PluralRules(locale).select(n); } catch (_) { pr = n === 1 ? 'one' : 'other'; }
    const cats = ['zero', 'one', 'two', 'few', 'many', 'other'];
    const idx = cats.indexOf(pr);
    if (idx !== -1 && idx < segments.length) return segments[idx];
    return segments[segments.length - 1];
  }

  return segments[0] || line;
}

function langScript(langData) {
  const json = JSON.stringify(langData || {})
    .replace(/</g, '\\u003c')
    .replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
  return `window.__SOM_LANG__ = ${json};`;
}

module.exports = {
  isRtl,
  dir,
  findLangDirs,
  scanLangDir,
  replacePlaceholders,
  choose,
  langScript,
};
