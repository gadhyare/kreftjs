/*
 * .env files and environment management.
 *
 *   # .env  (never sent to the browser, never copied by som build)
 *   APP_NAME="My shop"
 *   DATABASE_URL=sqlite:database/app.db
 *   MAIL_PASSWORD=secret
 *   PUBLIC_APP_NAME=${APP_NAME}            ← PUBLIC_ values also reach the browser: env.PUBLIC_APP_NAME
 *
 * Read by som dev, som serve, som build and som db. Values already set in the real environment win,
 * so a server can override the file. In server/*.js: process.env.MAIL_PASSWORD (or ctx.env).
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = /^PUBLIC_/;
const fromFile = new Set(); // keys this file set (so a changed file can update them)
const isBadKey = (k) => k === '__proto__' || k === 'constructor' || k === 'prototype';

function stripClosingQuote(body, q) {
  const lastNl = body.lastIndexOf('\n');
  const tail = body.slice(lastNl + 1);
  for (let i = 0; i < tail.length; i++) {
    if (tail[i] === '\\') { i++; continue; }
    if (tail[i] === q) {
      const rest = tail.slice(i + 1).trimStart();
      if (rest === '' || rest.startsWith('#')) {
        return body.slice(0, lastNl + 1 + i);
      }
    }
  }
  return null;
}

function parse(text) {
  const out = {};
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*=\s*(.*)$/);
    if (!m) continue; // blank lines, # comments, anything else
    const key = m[1];
    if (isBadKey(key)) continue;
    let value = m[2];
    const q = value[0];
    if (q === '"' || q === "'" || q === '`') {
      // quoted: may run over several lines; the quote must be closed
      let body = value.slice(1);
      let closed = stripClosingQuote(body, q);
      while (closed === null && i + 1 < lines.length) {
        body += '\n' + lines[++i];
        closed = stripClosingQuote(body, q);
      }
      if (closed !== null) body = closed;
      if (q === '"') body = body.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      out[key] = { value: body, expand: q !== "'" }; // 'single quotes' are taken as they are
    } else {
      out[key] = { value: value.replace(/\s+#.*$/, '').trim(), expand: true };
    }
  }
  return out;
}

// ${NAME} and $NAME use values from the real environment or from earlier in the file
function expand(value, vars) {
  return value.replace(/\\\$/g, '\u0000').replace(/\$\{([A-Za-z_][\w]*)(?::-([^}]*))?\}|\$([A-Za-z_]\w*)/g, (_, a, def, b) => {
    const v = vars[a || b];
    return v != null && v !== '' ? v : def != null ? def : '';
  }).replace(/\u0000/g, '$');
}

// reads <dir>/.env into process.env; returns the file's path, or null when there is none
function loadEnv(dir) {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) return null;
  const parsed = parse(fs.readFileSync(file, 'utf8'));
  const vars = { ...process.env };
  for (const key of fromFile) delete vars[key]; // a reload: the file's old values don't count
  for (const [key, { value, expand: ex }] of Object.entries(parsed)) {
    const v = ex ? expand(value, vars) : value;
    const fromOutside = key in process.env && !fromFile.has(key);
    if (!fromOutside) { process.env[key] = v; fromFile.add(key); }
    vars[key] = process.env[key];
  }
  for (const key of [...fromFile]) if (!(key in parsed)) { delete process.env[key]; fromFile.delete(key); } // removed from the file
  return file;
}

// only PUBLIC_ values: what the browser may see
function publicEnv() {
  const out = {};
  Object.keys(process.env).filter((k) => PUBLIC.test(k)).sort().forEach((k) => { out[k] = process.env[k]; });
  return out;
}
// a <script> that gives the page Som.env (the JSON can't close the tag)
const envScript = (obj) => `window.__SOM_ENV__ = ${JSON.stringify(obj).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16))};`;

module.exports = { loadEnv, parse, publicEnv, envScript };
