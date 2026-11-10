#!/usr/bin/env node
/* Builds the Kreft plugin for JetBrains IDEs: one .jar (a zip) with META-INF/plugin.xml and the live templates.
   The plugin has no code of its own, so there is nothing to compile and no Gradle: node editors/jetbrains/build.js [folder] */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, 'src');
const SNIPPETS = path.join(__dirname, '..', 'vscode', 'snippets', 'kreftjs.json');

const xml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r?\n/g, '&#10;');
const quoted = (text) => '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/* A VS Code snippet body ("state ${1:name} = ${2:0}") as a live template ("state $V1$ = $V2$" and its variables).
   ${1:text} a place with a default, ${1|a,b|} a choice, $1 a bare place, $0 where the cursor ends. */
function liveTemplate(body) {
  const text = Array.isArray(body) ? body.join('\n') : String(body);
  const variables = new Map();
  let value = '', last = 0;
  for (const m of text.matchAll(/\$\{(\d+)(?::([^}]*)|\|([^|}]*)\|)?\}|\$(\d+)/g)) {
    value += text.slice(last, m.index).replace(/\$/g, '$$$$');
    last = m.index + m[0].length;
    const n = Number(m[1] !== undefined ? m[1] : m[4]);
    if (n === 0) { value += '$END$'; continue; }
    const seen = variables.get(n) || { expression: '', defaultValue: '' };
    if (m[2] !== undefined && !seen.defaultValue) seen.defaultValue = quoted(m[2]);
    if (m[3] !== undefined && !seen.expression) seen.expression = 'enum(' + m[3].split(',').map(quoted).join(', ') + ')';
    variables.set(n, seen);
    value += `$V${n}$`;
  }
  value += text.slice(last).replace(/\$/g, '$$$$');
  return { value, variables: [...variables].sort((a, b) => a[0] - b[0]).map(([n, v]) => ({ name: 'V' + n, ...v })) };
}

function liveTemplatesXml(snippets) {
  const out = ['<templateSet group="Kreft">'];
  for (const snippet of Object.values(snippets)) {
    const { value, variables } = liveTemplate(snippet.body);
    out.push(`  <template name="${xml(snippet.prefix)}" value="${xml(value)}" description="${xml(snippet.description || '')}" toReformat="false" toShortenFQNames="false">`);
    for (const v of variables) out.push(`    <variable name="${v.name}" expression="${xml(v.expression)}" defaultValue="${xml(v.defaultValue)}" alwaysStopAt="true" />`);
    out.push('    <context>', '      <option name="HTML" value="true" />', '    </context>', '  </template>');
  }
  out.push('</templateSet>');
  return out.join('\n') + '\n';
}

/* A small zip writer (deflate). Fixed dates, so the same sources always give the same file. */
let table;
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  if (!table) table = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  let c = 0xffffffff;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const file = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12);   // 1980-01-01
    head.writeUInt32LE(crc32(data), 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(file.length, 26); head.writeUInt16LE(0, 28);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4);
    head.copy(entry, 6, 4, 30);          // version needed … name length, extra length
    entry.writeUInt32LE(offset, 42);     // comment length, disk, attributes stay 0
    parts.push(head, file, packed);
    central.push(entry, file);
    offset += head.length + file.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

function pluginVersion() {
  return (fs.readFileSync(path.join(SRC, 'META-INF', 'plugin.xml'), 'utf8').match(/<version>([^<]+)<\/version>/) || [])[1] || '0.0.0';
}

/* Writes kreft-jetbrains-<version>.jar into `outDir` and returns its path. */
function build(outDir = path.join(__dirname, 'dist')) {
  const files = [
    ['META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\r\nCreated-By: kreft\r\n\r\n'],
    ['META-INF/plugin.xml', fs.readFileSync(path.join(SRC, 'META-INF', 'plugin.xml'))],
    ['META-INF/pluginIcon.svg', fs.readFileSync(path.join(SRC, 'META-INF', 'pluginIcon.svg'))],
    ['liveTemplates/Kreft.xml', liveTemplatesXml(JSON.parse(fs.readFileSync(SNIPPETS, 'utf8')))]
  ];
  fs.mkdirSync(outDir, { recursive: true });
  const jar = path.join(outDir, `kreft-jetbrains-${pluginVersion()}.jar`);
  fs.writeFileSync(jar, zip(files));
  return jar;
}

module.exports = { build, liveTemplate, liveTemplatesXml, zip, pluginVersion };

if (require.main === module) console.log('  Built ' + build(process.argv[2] ? path.resolve(process.argv[2]) : undefined));
