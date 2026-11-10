/* The editor plugins in editors/ and the `kreft editor` command that installs them. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const tmp = (t) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-editors-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const quiet = () => {};

test('vscode: Emmet is on for .kreft files by default, and a user\'s own list keeps its entries', () => {
  const pkg = JSON.parse(read('editors/vscode/package.json'));
  assert.deepEqual(pkg.contributes.configurationDefaults['emmet.includeLanguages'], { kreftjs: 'html' });
  assert.equal(pkg.contributes.languages[0].id, 'kreftjs', 'the Emmet setting names the language id');
  const { emmetIsOn, withKreftEmmet } = require('../editors/vscode/extension.js');
  assert.equal(emmetIsOn({ kreftjs: 'html' }), true);
  assert.equal(emmetIsOn({ blade: 'html' }), false);
  assert.equal(emmetIsOn(undefined), false);
  assert.deepEqual(withKreftEmmet({ blade: 'html' }), { blade: 'html', kreftjs: 'html' });
  assert.deepEqual(withKreftEmmet(undefined), { kreftjs: 'html' });
});

test('kreft vscode: also installs in Antigravity and writes the Emmet setting, keeping the project\'s own', (t) => {
  const home = tmp(t), project = tmp(t);
  fs.mkdirSync(path.join(home, '.antigravity', 'extensions'), { recursive: true });
  fs.mkdirSync(path.join(project, '.vscode'));
  fs.writeFileSync(path.join(project, '.vscode', 'settings.json'), '{"emmet.includeLanguages":{"blade":"html"}}');
  execFileSync(process.execPath, [path.join(ROOT, 'bin', 'kreftjs.js'), 'vscode'], { cwd: project, env: { ...process.env, HOME: home, USERPROFILE: home }, stdio: 'pipe' });
  const version = JSON.parse(read('editors/vscode/package.json')).version;
  for (const editor of ['.vscode', '.antigravity']) assert.ok(fs.existsSync(path.join(home, editor, 'extensions', `kreft.kreftjs-${version}`, 'package.json')), editor);
  const settings = JSON.parse(fs.readFileSync(path.join(project, '.vscode', 'settings.json'), 'utf8'));
  assert.deepEqual(settings['emmet.includeLanguages'], { blade: 'html', kreftjs: 'html' });
});

test('zed: the extension starts its own Emmet server and sends .kreft files to it as html', () => {
  const toml = read('editors/zed/extension.toml');
  assert.match(toml, /\[language_servers\.kreft-emmet\]\s+name = "Kreft Emmet"\s+languages = \["Kreft"\]/);
  assert.match(toml, /\[language_servers\.kreft-emmet\.language_ids\]\s+"Kreft" = "html"/);
  assert.match(read('editors/zed/languages/kreft/config.toml'), /^name = "Kreft"$/m, 'the same language name');
  assert.match(read('editors/zed/Cargo.toml'), /crate-type = \["cdylib"\]/);
  const version = (s) => s.match(/^version = "([^"]+)"/m)[1];
  assert.equal(version(read('editors/zed/Cargo.toml')), version(toml));
  assert.match(read('editors/zed/src/lib.rs'), /register_extension!\(KreftExtension\)/);
});

test('sublime: the scopes are the ones the Emmet package looks for', () => {
  const syntax = read('editors/sublime/Kreft.sublime-syntax');
  assert.match(syntax, /^scope: text\.html\.kreft$/m, 'Emmet markup: "text.html - text.html source"');
  assert.match(syntax, /embed: scope:text\.html\.basic/, '<style> inside is source.css: Emmet stylesheet');
  assert.doesNotMatch(syntax, /embed_scope: meta\.embedded/, 'Emmet does not capture abbreviations in meta.embedded');
  JSON.parse(read('editors/sublime/Kreft.sublime-settings').replace(/^\s*\/\/.*$/gm, ''));
});

test('jetbrains: snippets become live templates', () => {
  const { liveTemplate, liveTemplatesXml } = require('../editors/jetbrains/build.js');
  assert.deepEqual(liveTemplate('state ${1:name} = ${2:0}'), { value: 'state $V1$ = $V2$', variables: [{ name: 'V1', expression: '', defaultValue: '"name"' }, { name: 'V2', expression: '', defaultValue: '"0"' }] });
  assert.equal(liveTemplate(['action ${1:name}(${2}) {', '  $0', '}']).value, 'action $V1$($V2$) {\n  $END$\n}');
  assert.equal(liveTemplate('on ${1|start,ready|} {').variables[0].expression, 'enum("start", "ready")');
  assert.equal(liveTemplate('k-if={${1:condition}}').value, 'k-if={$V1$}');
  assert.equal(liveTemplate('{for ${1:item} in ${2:items} key ${1:item}.id}').variables.length, 2, 'a place used twice is one variable');
  assert.equal(liveTemplate('costs $5 or US$').value, 'costs $V5$ or US$$', 'a lone $ is doubled');
  assert.equal(liveTemplate('k-case="${1:\'a\'}"').variables[0].defaultValue, '"\'a\'"');
  const xml = liveTemplatesXml({ a: { prefix: 'x<y', body: 'a "b"\n<c>', description: 'd & e' } });
  assert.match(xml, /name="x&lt;y" value="a &quot;b&quot;&#10;&lt;c&gt;" description="d &amp; e"/);
  assert.match(xml, /<option name="HTML" value="true" \/>/);
});

/* reads a zip back with nothing but zlib: the central directory, then each file */
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const files = {};
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50);
    const size = buf.readUInt32LE(at + 20), nameLength = buf.readUInt16LE(at + 28), local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    assert.equal(buf.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = zlib.inflateRawSync(buf.subarray(start, start + size));
    assert.equal(zlib.crc32 ? zlib.crc32(data) >>> 0 : buf.readUInt32LE(at + 16), buf.readUInt32LE(at + 16), name);
    files[name] = data.toString('utf8');
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return files;
}

test('jetbrains: the built .jar holds the plugin, and building twice gives the same file', (t) => {
  const { build, pluginVersion } = require('../editors/jetbrains/build.js');
  const out = tmp(t);
  const jar = build(out);
  assert.equal(path.basename(jar), `kreft-jetbrains-${pluginVersion()}.jar`);
  const first = fs.readFileSync(jar);
  const files = unzip(first);
  assert.deepEqual(Object.keys(files), ['META-INF/MANIFEST.MF', 'META-INF/plugin.xml', 'META-INF/pluginIcon.svg', 'liveTemplates/Kreft.xml']);
  assert.match(files['META-INF/plugin.xml'], /<fileType name="HTML" extensions="kreft;kreftjs"\/>/, '.kreft is HTML to the IDE: Emmet comes with it');
  assert.doesNotMatch(files['META-INF/plugin.xml'], /implementationClass=|<actions>|<applicationListeners>/, 'the plugin has no code');
  assert.match(files['META-INF/plugin.xml'], /<defaultLiveTemplates file="\/liveTemplates\/Kreft\.xml"\/>/);
  const snippets = JSON.parse(read('editors/vscode/snippets/kreftjs.json'));
  assert.equal((files['liveTemplates/Kreft.xml'].match(/<template /g) || []).length, Object.keys(snippets).length);
  assert.ok(first.equals(fs.readFileSync(build(out))));
  if (process.platform !== 'win32') {
    try { execFileSync('unzip', ['-tq', jar], { stdio: 'pipe' }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
});

test('vim: file type, HTML colors and Emmet as html', () => {
  assert.match(read('editors/vim/ftdetect/kreft.vim'), /\*\.kreft,\*\.kreftjs setfiletype kreft/);
  assert.match(read('editors/vim/syntax/kreft.vim'), /runtime! syntax\/html\.vim/);
  assert.match(read('editors/vim/ftplugin/kreft.vim'), /g:user_emmet_settings\.kreft = \{'extends': 'html'\}/);
});

test('kreft editor: each plugin goes where its editor looks for it', (t) => {
  const editors = require('../bin/editors.js');
  const home = tmp(t);
  const mac = { home, platform: 'darwin', env: {} };

  assert.deepEqual(editors.installSublime(mac, quiet), [], 'no Sublime Text: nothing is created');
  const packages = path.join(home, 'Library', 'Application Support', 'Sublime Text', 'Packages');
  fs.mkdirSync(packages, { recursive: true });
  assert.deepEqual(editors.installSublime(mac, quiet), [path.join(packages, 'Kreft')]);
  assert.ok(fs.existsSync(path.join(packages, 'Kreft', 'Kreft.sublime-syntax')));

  const [zed] = editors.installZed(mac, quiet);
  assert.equal(zed, path.join(home, '.kreft', 'editors', 'zed'));
  assert.ok(fs.existsSync(path.join(zed, 'src', 'lib.rs')) && fs.existsSync(path.join(zed, 'languages', 'kreft', 'config.toml')));
  assert.ok(!fs.existsSync(path.join(zed, 'target')) && !fs.existsSync(path.join(zed, '.gitignore')));

  const support = path.join(home, 'Library', 'Application Support', 'JetBrains');
  fs.mkdirSync(path.join(support, 'WebStorm2025.2'), { recursive: true });
  fs.mkdirSync(path.join(support, 'Toolbox'), { recursive: true });
  fs.mkdirSync(path.join(support, 'WebStorm2025.2', 'plugins'));
  fs.writeFileSync(path.join(support, 'WebStorm2025.2', 'plugins', 'kreft-jetbrains-0.0.1.jar'), 'old');
  const [jar, ...ides] = editors.installJetbrains(mac, quiet);
  assert.deepEqual(ides, [path.join(support, 'WebStorm2025.2', 'plugins')], 'Toolbox is not an IDE');
  assert.deepEqual(fs.readdirSync(ides[0]), [path.basename(jar)], 'the older version is replaced');
  assert.deepEqual(editors.jetbrainsFolders({ home, platform: 'linux', env: {} }), []);
  fs.mkdirSync(path.join(home, '.local', 'share', 'JetBrains', 'PhpStorm2025.1'), { recursive: true });
  assert.deepEqual(editors.jetbrainsFolders({ home, platform: 'linux', env: {} }), [path.join(home, '.local', 'share', 'JetBrains', 'PhpStorm2025.1')]);

  assert.deepEqual(editors.vimFolders(mac), [path.join(home, '.vim', 'pack', 'kreft', 'start', 'kreft')], 'neither is there: Vim');
  fs.mkdirSync(path.join(home, '.config', 'nvim'), { recursive: true });
  const vim = editors.installVim(mac, quiet);
  assert.deepEqual(vim, [path.join(home, '.config', 'nvim', 'pack', 'kreft', 'start', 'kreft')]);
  assert.ok(fs.existsSync(path.join(vim[0], 'ftdetect', 'kreft.vim')));
  assert.deepEqual(editors.vimFolders({ home, platform: 'win32', env: { LOCALAPPDATA: path.join(home, 'Local') } }), [path.join(home, 'vimfiles', 'pack', 'kreft', 'start', 'kreft')]);
});

test('kreft editor: lists the editors, knows their other names, and refuses an unknown one', () => {
  const run = (...args) => { try { return { code: 0, out: execFileSync(process.execPath, [path.join(ROOT, 'bin', 'kreftjs.js'), 'editor', ...args], { cwd: os.tmpdir(), encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { return { code: e.status, out: String(e.stderr) }; } };
  const list = run();
  for (const name of ['vscode', 'sublime', 'zed', 'jetbrains', 'vim']) assert.match(list.out, new RegExp('kreft editor ' + name));
  const { NAMES } = require('../bin/editors.js');
  assert.equal(NAMES.antigravity, 'vscode');
  assert.equal(NAMES.webstorm, 'jetbrains');
  assert.equal(NAMES.neovim, 'vim');
  const bad = run('notepad');
  assert.equal(bad.code, 1);
  assert.match(bad.out, /"notepad" is not an editor Kreft knows/);
});

test('kreft editor --download: one file per editor, in the form the editor installs', (t) => {
  const { download } = require('../bin/editors.js');
  const out = tmp(t);
  const version = JSON.parse(read('editors/vscode/package.json')).version;
  const vsix = download('vscode', out);
  assert.equal(path.basename(vsix), `kreft-vscode-${version}.vsix`);
  const files = unzip(fs.readFileSync(vsix));
  assert.deepEqual(Object.keys(files).slice(0, 2), ['extension.vsixmanifest', '[Content_Types].xml']);
  for (const name of ['extension/package.json', 'extension/extension.js', 'extension/syntaxes/kreftjs.tmLanguage.json', 'extension/snippets/kreftjs.json', 'extension/icon.png']) assert.ok(name in files, name);
  assert.match(files['extension.vsixmanifest'], new RegExp(`<Identity Language="en-US" Id="kreftjs" Version="${version.replace(/\./g, '\\.')}" Publisher="kreft"/>`));
  for (const ext of new Set(Object.keys(files).filter((n) => n !== '[Content_Types].xml').map((n) => path.extname(n)).filter(Boolean))) assert.ok(files['[Content_Types].xml'].includes(`Extension="${ext}"`), ext + ' has a content type');

  const sublime = download('sublime', out);
  assert.equal(path.basename(sublime), 'Kreft.sublime-package');
  assert.ok('Kreft.sublime-syntax' in unzip(fs.readFileSync(sublime)), 'the files are at the top of the package');
  const zed = unzip(fs.readFileSync(download('zed', out)));
  assert.ok('kreft-zed/extension.toml' in zed && 'kreft-zed/src/lib.rs' in zed && 'kreft-zed/Cargo.toml' in zed);
  assert.ok(!Object.keys(zed).some((n) => /target\/|\.gitignore|Cargo\.lock/.test(n)));
  assert.ok('kreft/ftdetect/kreft.vim' in unzip(fs.readFileSync(download('vim', out))));
  assert.match(path.basename(download('jetbrains', out)), /^kreft-jetbrains-.*\.jar$/);

  const folder = path.join(out, 'cli');
  const printed = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'kreftjs.js'), 'editor', 'all', '--download', folder], { cwd: out, encoding: 'utf8', stdio: 'pipe' });
  assert.equal(fs.readdirSync(folder).length, 5);
  assert.match(printed, /Install from VSIX/);
});

test('the manual has a part for each editor, with its install command and its download', () => {
  const part = read('docs/README.md').split('## Editor plugins')[1].split('\n## ')[0];
  for (const name of ['vscode', 'sublime', 'zed', 'jetbrains', 'vim']) {
    assert.ok(part.includes(`kreft editor ${name}\n`), name + ': install');
    assert.ok(part.includes(`kreft editor ${name} --download`), name + ': download');
    assert.ok(part.includes(`https://github.com/gadhyare/kreftjs/tree/main/editors/${name}`) && fs.existsSync(path.join(ROOT, 'editors', name, 'README.md')), name + ': source');
  }
  for (const heading of ['### Download a plugin', '### VS Code, Antigravity, Cursor, Windsurf', '### Sublime Text', '### Zed', '### JetBrains IDEs', '### Vim and Neovim']) assert.ok(part.includes(heading), heading);
  for (const file of ['Kreft.sublime-package', 'kreft-vim.zip', '.vsix', '.jar']) assert.ok(part.includes(file), file);
});

test('the plugins ship in the package without build leftovers', () => {
  assert.ok(JSON.parse(read('package.json')).files.includes('editors/'));
  for (const left of ['editors/zed/target', 'editors/zed/Cargo.lock']) assert.match(read('editors/zed/.gitignore'), new RegExp('^' + path.basename(left).replace('.', '\\.') + '/?$', 'm'));
  assert.match(read('editors/jetbrains/.gitignore'), /^dist\/$/m);
});
