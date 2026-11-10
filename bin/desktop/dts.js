/*
 * desktop.d.ts is made from the schema (schema.js), so the types, the editor autocomplete and the validation can never
 * disagree. Regenerate it with:  node bin/desktop/dts.js --write     (a test fails when the committed file is out of date)
 */
const fs = require('fs');
const path = require('path');
const { SCHEMA, appliesTo, pick } = require('./schema.js');

const NAME = { electron: 'Electron', tauri: 'Tauri' };
const pascal = (s) => s[0].toUpperCase() + s.slice(1);
const lit = (v) => JSON.stringify(v);

function valuesOf(n, rt) { return Array.isArray(n.values) ? n.values : n.values[rt]; }

function defaultText(n, rt) {
  const d = pick(n.default, rt);
  if (d === undefined || d === null || (Array.isArray(d) && d.length > 3) || (typeof d === 'object' && !Array.isArray(d) && Object.keys(d).length)) return '';
  if (Array.isArray(d) && !d.length) return '';
  return ` Default: \`${JSON.stringify(d)}\`.`;
}

function jsdoc(text, indent) {
  const pad = ' '.repeat(indent);
  return `${pad}/** ${text.replace(/\*\//g, '* /')} */\n`;
}

// the type of one option
function typeOf(n, rt, named, path) {
  let t;
  switch (n.kind) {
    case 'bool': t = 'boolean'; break;
    case 'int': case 'number': t = 'number'; break;
    case 'string': t = 'string'; break;
    case 'enum': t = valuesOf(n, rt).map(lit).join(' | '); break;
    case 'map': t = 'Record<string, unknown>'; break;
    case 'list': {
      const it = n.items;
      let inner;
      if (it.kind === 'group') {
        const iname = `${NAME[rt]}${path.slice(-2).map(pascal).join('')}Entry`;
        named.add(iname, it, rt);
        inner = iname;
      } else if (it.kind === 'enum') inner = valuesOf(it, rt).map(lit).join(' | ');
      else inner = 'string';
      t = `Array<${inner}>`;
      break;
    }
    default: t = 'unknown';
  }
  return n.nullable ? `${t} | null` : t;
}

function body(fields, rt, named, indent, trail) {
  let out = '';
  for (const [k, f] of Object.entries(fields)) {
    if (!appliesTo(f, rt)) continue;
    const doc = (f.doc || '') + (f.kind === 'group' ? '' : defaultText(f, rt));
    out += jsdoc(doc, indent);
    if (f.kind === 'group') out += `${' '.repeat(indent)}${k}?: {\n${body(f.fields, rt, named, indent + 2, [...trail, k])}${' '.repeat(indent)}};\n`;
    else out += `${' '.repeat(indent)}${k}?: ${typeOf(f, rt, named, [...trail, k])};\n`;
  }
  return out;
}

function generate() {
  let out = `// Generated from bin/desktop/schema.js by "node bin/desktop/dts.js --write". Do not edit.
// Types for config/electron.config.js and config/tauri.config.js:
//   /** @type {import('kreftjs/desktop').ElectronConfig} */
//   module.exports = { window: { width: 1000 } }
// or: const { defineElectronConfig } = require('kreftjs/desktop'); module.exports = defineElectronConfig({ … })

/** What a config function receives. */
export interface DesktopConfigContext {
  runtime: 'electron' | 'tauri';
  /** "development" for \`kreft <runtime>:dev\`, "production" for \`kreft <runtime>:build\`. */
  mode: 'development' | 'production';
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}
`;
  for (const rt of ['electron', 'tauri']) {
    const entries = new Map();
    const named = {
      add(name, group, runtime) { if (!entries.has(name)) entries.set(name, [group, runtime]); },
    };
    const main = body(SCHEMA.fields, rt, named, 2, []);
    let extra = '';
    for (const [name, [group]] of entries) {
      let fields = '';
      for (const [k, f] of Object.entries(group.fields)) {
        fields += jsdoc((f.doc || '') + defaultText(f, rt), 2);
        fields += `  ${k}?: ${f.recursive ? `Array<${name}> | null` : typeOf(f, rt, named, [k])};\n`;
      }
      extra += `\n/** ${group.doc} */\nexport interface ${name} {\n${fields}}\n`;
    }
    out += `${extra}
/** The settings of an ${NAME[rt]} app (config/${rt}.config.js). Every option is optional: what you leave out keeps its default. */
export interface ${NAME[rt]}Config {
${main}}

/** The file may export the settings, or a function that returns them. */
export type ${NAME[rt]}ConfigExport = ${NAME[rt]}Config | ((context: DesktopConfigContext) => ${NAME[rt]}Config | Promise<${NAME[rt]}Config>);

/** Gives the editor autocomplete and type checks; returns what it receives. */
export function define${NAME[rt]}Config(config: ${NAME[rt]}ConfigExport): ${NAME[rt]}ConfigExport;
`;
  }
  out += `
/** The "desktop" key of kreftjs.config.json: settings for both runtimes. An option one runtime lacks is ignored there. */
export type SharedDesktopConfig = ElectronConfig & TauriConfig;
`;
  return out;
}

const FILE = path.join(__dirname, '..', '..', 'desktop.d.ts');

if (require.main === module) {
  const text = generate();
  if (process.argv.includes('--write')) { fs.writeFileSync(FILE, text); console.log('Wrote ' + FILE); } else process.stdout.write(text);
}

module.exports = { generate, FILE };
