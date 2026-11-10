/*
 * The option tables of the documentation ("Desktop configuration"), made from the schema so they cannot drift from the code.
 *   node bin/desktop/docs.js --write    puts them between the markers in docs/README.md (a test fails when they are out of date)
 */
const fs = require('fs');
const path = require('path');
const { SCHEMA, appliesTo, pick } = require('./schema.js');

const START = '<!-- desktop-options:start (made by "node bin/desktop/docs.js --write": do not edit between the markers) -->';
const END = '<!-- desktop-options:end -->';

const show = (v) => {
  if (v === null) return '`null`';
  if (Array.isArray(v)) return v.length ? '`' + JSON.stringify(v).replace(/"/g, "'").replace(/,/g, ', ') + '`' : '`[]`';
  if (typeof v === 'object') return '`{ … }`';
  return '`' + (typeof v === 'string' ? `'${v}'` : String(v)) + '`';
};

function row(pathParts, n) {
  const e = appliesTo(n, 'electron'), t = appliesTo(n, 'tauri');
  const where = e && t ? 'both' : e ? 'Electron' : 'Tauri';
  const de = e ? pick(n.default, 'electron') : undefined, dt = t ? pick(n.default, 'tauri') : undefined;
  const def = n.kind === 'group' ? '' : e && t && JSON.stringify(de) !== JSON.stringify(dt) ? `Electron ${show(de ?? null)}, Tauri ${show(dt ?? null)}` : show((e ? de : dt) ?? null);
  let values = '';
  if (n.kind === 'enum') {
    const list = (rt) => (Array.isArray(n.values) ? n.values : n.values[rt]);
    values = e && t && JSON.stringify(list('electron')) !== JSON.stringify(list('tauri'))
      ? ` Values: Electron ${list('electron').map((v) => `\`${v}\``).join(', ')}; Tauri ${list('tauri').map((v) => `\`${v}\``).join(', ')}.`
      : ` Values: ${list(e ? 'electron' : 'tauri').map((v) => `\`${v}\``).join(', ')}.`;
  }
  const range = n.min !== undefined || n.max !== undefined ? ` From ${n.min ?? '…'} to ${n.max ?? '…'}.` : '';
  const doc = String(n.doc || '').replace(/\|/g, '\\|');
  return `| \`${pathParts.join('.')}\` | ${where} | ${def} | ${doc}${values}${range} |`;
}

function groupRows(g, trail) {
  const rows = [];
  for (const [k, f] of Object.entries(g.fields)) {
    if (f.kind === 'group') rows.push(...groupRows(f, [...trail, k]));
    else rows.push(row([...trail, k], f));
  }
  return rows;
}

function generate() {
  const out = [START, ''];
  for (const [name, g] of Object.entries(SCHEMA.fields)) {
    out.push(`#### \`${name}\``, '', g.doc, '', '| Option | Runtime | Default | What it does |', '|---|---|---|---|', ...groupRows(g, [name]), '');
  }
  out.push(END);
  return out.join('\n');
}

const FILE = path.join(__dirname, '..', '..', 'docs', 'README.md');

function write() {
  const text = fs.readFileSync(FILE, 'utf8');
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < 0) throw new Error('The markers are not in docs/README.md');
  fs.writeFileSync(FILE, text.slice(0, a) + generate() + text.slice(b + END.length));
}

if (require.main === module && process.argv.includes('--write')) { write(); console.log('Wrote the option tables into docs/README.md'); }

module.exports = { generate, START, END, FILE };
