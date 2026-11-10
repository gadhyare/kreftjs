/* kreft editor <name>: puts the Kreft plugin (colors, snippets, Emmet) in an editor.
   The plugins themselves are in editors/: vscode (also Antigravity, Cursor, Windsurf...), sublime, zed, jetbrains, vim. */
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDITORS = path.join(__dirname, '..', 'editors');
const SKIP = new Set(['target', 'dist', 'grammars', 'Cargo.lock', 'extension.wasm', '.gitignore', '.DS_Store']);   // what a build leaves behind

function copyPlugin(name, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(path.join(EDITORS, name), to, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
  return to;
}
const existing = (list) => list.filter((dir) => { try { return fs.statSync(dir).isDirectory(); } catch { return false; } });

/* Where each editor keeps its plugins, per system. `home` and `platform` can be given (the tests do). */
function sublimeFolders({ home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  const names = ['Sublime Text', 'Sublime Text 3'];
  if (platform === 'darwin') return names.map((n) => path.join(home, 'Library', 'Application Support', n, 'Packages'));
  if (platform === 'win32') return names.map((n) => path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), n, 'Packages'));
  return ['sublime-text', 'sublime-text-3'].map((n) => path.join(home, '.config', n, 'Packages'));
}
function jetbrainsFolders({ home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  // one folder per IDE and version: WebStorm2025.2, PhpStorm2025.1, AndroidStudio2025.1 ...
  const roots = platform === 'darwin' ? ['JetBrains', 'Google'].map((v) => path.join(home, 'Library', 'Application Support', v))
    : platform === 'win32' ? ['JetBrains', 'Google'].map((v) => path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), v))
    : ['JetBrains', 'Google'].map((v) => path.join(home, '.local', 'share', v));
  const found = [];
  for (const root of existing(roots)) {
    for (const name of fs.readdirSync(root)) {
      if (!/^[A-Za-z]+\d{4}\.\d/.test(name)) continue;
      const ide = path.join(root, name);
      if (existing([ide]).length) found.push(platform === 'linux' ? ide : path.join(ide, 'plugins'));   // on Linux the plugins are in the folder itself
    }
  }
  return found;
}
function vimFolders({ home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  const vim = path.join(home, platform === 'win32' ? 'vimfiles' : '.vim');
  const nvim = platform === 'win32' ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'nvim') : path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'nvim');
  const found = existing([vim, nvim]);
  return (found.length ? found : [vim]).map((dir) => path.join(dir, 'pack', 'kreft', 'start', 'kreft'));
}
const kreftHome = ({ home = os.homedir() } = {}) => path.join(home, '.kreft', 'editors');

function installSublime(options = {}, log = console.log) {
  const folders = existing(sublimeFolders(options));
  if (!folders.length) {
    log('  Sublime Text was not found on this computer.');
    log(`  Copy ${path.join(EDITORS, 'sublime')} to Packages/Kreft yourself (Preferences > Browse Packages...).\n`);
    return [];
  }
  const done = folders.map((dir) => copyPlugin('sublime', path.join(dir, 'Kreft')));
  done.forEach((dir) => log(`  Installed in ${dir}`));
  log('\n  For Emmet, install the "Emmet" package: Command Palette > Package Control: Install Package > Emmet.');
  log('  Reopen your .kreft files.\n');
  return done;
}

function installZed(options = {}, log = console.log) {
  // Zed builds a dev extension inside its folder, so it gets a copy outside node_modules
  const dir = copyPlugin('zed', path.join(kreftHome(options), 'zed'));
  log(`  The extension is in ${dir}`);
  log('\n  In Zed: open the command palette, run "zed: install dev extension" and pick that folder.');
  log('  Zed compiles it, so Rust must be installed (https://rustup.rs). Emmet works with no other setting.\n');
  return [dir];
}

function installJetbrains(options = {}, log = console.log) {
  const { build } = require(path.join(EDITORS, 'jetbrains', 'build.js'));
  const jar = build(path.join(kreftHome(options), 'jetbrains'));
  const done = [];
  for (const dir of jetbrainsFolders(options)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const old of fs.readdirSync(dir)) if (/^kreft-jetbrains-.*\.jar$/.test(old)) fs.rmSync(path.join(dir, old), { force: true });
      fs.copyFileSync(jar, path.join(dir, path.basename(jar)));
      done.push(dir);
      log(`  Installed in ${dir}`);
    } catch (error) { log(`  Could not write in ${dir}: ${error.message}`); }
  }
  log(`  The plugin file is ${jar}`);
  if (done.length) log('\n  Restart the IDE. In another IDE: Settings > Plugins > the gear > Install Plugin from Disk... and pick that file.\n');
  else log('\n  No JetBrains IDE was found. In the IDE: Settings > Plugins > the gear > Install Plugin from Disk... and pick that file.\n');
  return [jar, ...done];
}

function installVim(options = {}, log = console.log) {
  const done = vimFolders(options).map((dir) => { fs.mkdirSync(path.dirname(dir), { recursive: true }); return copyPlugin('vim', dir); });
  done.forEach((dir) => log(`  Installed in ${dir}`));
  log('\n  For Emmet, install emmet-vim (mattn/emmet-vim), then press Ctrl+y and a comma after an abbreviation.');
  log('  Neovim with the Emmet language server: see editors/vim/README.md.\n');
  return done;
}

/* ------------------------------------------------------------------ kreft editor <name> --download
   One file per editor, in the form that editor installs by itself, to keep, share or put on a computer without Kreft. */
function pluginFiles(name, prefix = '') {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (SKIP.has(entry.name)) continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel + entry.name + '/');
      else if (entry.isFile()) out.push([prefix + rel + entry.name, fs.readFileSync(path.join(dir, entry.name))]);
    }
  };
  walk(path.join(EDITORS, name), '');
  return out;
}
const xmlText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* A .vsix is a zip: the extension in extension/, a manifest, and the list of file types. */
function vsixFiles() {
  const pkg = JSON.parse(fs.readFileSync(path.join(EDITORS, 'vscode', 'package.json'), 'utf8'));
  const files = pluginFiles('vscode', 'extension/').filter(([name]) => name !== 'extension/.vscodeignore');
  const types = { json: 'application/json', vsixmanifest: 'text/xml' };
  for (const [name] of files) {
    const ext = path.extname(name).slice(1).toLowerCase();
    if (ext && !types[ext]) types[ext] = ext === 'png' ? 'image/png' : ext === 'js' ? 'application/javascript' : ext === 'md' ? 'text/markdown' : 'text/plain';
  }
  const bare = files.filter(([name]) => !path.extname(name)).map(([name]) => `<Override PartName="/${xmlText(name)}" ContentType="text/plain"/>`);
  const contentTypes = `<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${Object.entries(types).map(([ext, type]) => `<Default Extension=".${ext}" ContentType="${type}"/>`).join('')}${bare.join('')}</Types>\n`;
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xmlText(pkg.name)}" Version="${xmlText(pkg.version)}" Publisher="${xmlText(pkg.publisher)}"/>
    <DisplayName>${xmlText(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${xmlText(pkg.description)}</Description>
    <Tags>${xmlText((pkg.keywords || []).join(','))}</Tags>
    <Categories>${xmlText((pkg.categories || []).join(','))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xmlText(pkg.engines.vscode)}"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/>
    </Properties>
    <License>extension/LICENSE</License>
    <Icon>extension/${xmlText(pkg.icon)}</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/${xmlText(pkg.icon)}" Addressable="true"/>
  </Assets>
</PackageManifest>
`;
  return { version: pkg.version, files: [['extension.vsixmanifest', manifest], ['[Content_Types].xml', contentTypes], ...files] };
}

/* What each download is, and how it is installed: the text is printed after the file is written. */
const DOWNLOADS = {
  vscode: { how: 'VS Code, Antigravity, Cursor, Windsurf: Extensions > the ... menu > Install from VSIX... (or: code --install-extension <file>)' },
  sublime: { how: 'Sublime Text: Preferences > Browse Packages..., go one folder up, and put the file in "Installed Packages". Then install the Emmet package.' },
  zed: { how: 'Zed: unzip it, then command palette > "zed: install dev extension" and pick the kreft-zed folder (Rust must be installed).' },
  jetbrains: { how: 'JetBrains IDEs: Settings > Plugins > the gear > Install Plugin from Disk... and pick the file.' },
  vim: { how: 'Vim: unzip it into ~/.vim/pack/kreft/start/ (Neovim: ~/.config/nvim/pack/kreft/start/). Then install emmet-vim.' }
};
function download(name, outDir = process.cwd()) {
  const { build, zip } = require(path.join(EDITORS, 'jetbrains', 'build.js'));
  fs.mkdirSync(outDir, { recursive: true });
  if (name === 'jetbrains') return build(outDir);
  let file, files;
  if (name === 'vscode') { const vsix = vsixFiles(); files = vsix.files; file = `kreft-vscode-${vsix.version}.vsix`; }
  else if (name === 'sublime') { files = pluginFiles('sublime'); file = 'Kreft.sublime-package'; }   // the name is the package name: do not rename it
  else if (name === 'zed') { files = pluginFiles('zed', 'kreft-zed/'); file = `kreft-zed-${(fs.readFileSync(path.join(EDITORS, 'zed', 'extension.toml'), 'utf8').match(/^version = "([^"]+)"/m) || [])[1]}.zip`; }
  else if (name === 'vim') { files = pluginFiles('vim', 'kreft/'); file = 'kreft-vim.zip'; }
  else throw new Error('unknown editor: ' + name);
  const to = path.join(outDir, file);
  fs.writeFileSync(to, zip(files));
  return to;
}

const NAMES = {
  vscode: 'vscode', code: 'vscode', antigravity: 'vscode', cursor: 'vscode', windsurf: 'vscode', vscodium: 'vscode', kiro: 'vscode', trae: 'vscode',
  sublime: 'sublime', subl: 'sublime', sublimetext: 'sublime', 'sublime-text': 'sublime',
  zed: 'zed',
  jetbrains: 'jetbrains', webstorm: 'jetbrains', phpstorm: 'jetbrains', idea: 'jetbrains', intellij: 'jetbrains', pycharm: 'jetbrains', rubymine: 'jetbrains', goland: 'jetbrains', rider: 'jetbrains', 'android-studio': 'jetbrains',
  vim: 'vim', neovim: 'vim', nvim: 'vim'
};

function usage(log = console.log) {
  log(`
  kreft editor <name>     Colors, snippets and Emmet for .kreft files in your editor

    kreft editor vscode       VS Code, Antigravity, Cursor, Windsurf, VSCodium, Kiro, Trae   (the same as: kreft vscode)
    kreft editor sublime      Sublime Text
    kreft editor zed          Zed
    kreft editor jetbrains    WebStorm, PhpStorm, IntelliJ IDEA, PyCharm, Android Studio ...
    kreft editor vim          Vim and Neovim
    kreft editor all          every one of them

    kreft editor <name> --download [folder]
                              Do not install: write the plugin as one file (.vsix, .sublime-package, .jar, .zip)
                              in this folder, to share it or to install it by hand
`);
}

module.exports = function editorCommand(args = [], { vscode } = {}) {
  const asked = String(args[0] || '').toLowerCase();
  const run = { vscode: () => vscode && vscode(), sublime: () => installSublime(), zed: () => installZed(), jetbrains: () => installJetbrains(), vim: () => installVim() };
  if (!asked || asked === 'help' || asked === '--help' || asked === '-h') return usage();
  const flag = args.findIndex((a) => a === '--download' || a === '--zip');
  if (flag > 0) {
    const names = asked === 'all' ? Object.keys(DOWNLOADS) : [NAMES[asked]];
    if (!names[0]) { console.error(`\n  kreft editor: "${args[0]}" is not an editor Kreft knows.`); usage(console.error); process.exitCode = 1; return; }
    const folder = args[flag + 1] && !args[flag + 1].startsWith('-') ? path.resolve(args[flag + 1]) : process.cwd();
    console.log('');
    for (const name of names) { console.log(`  ${download(name, folder)}`); console.log(`    ${DOWNLOADS[name].how}\n`); }
    return;
  }
  if (asked === 'all') { for (const name of Object.keys(run)) { console.log(`\n  ${name}`); run[name](); } return; }
  const name = NAMES[asked];
  if (!name) {
    console.error(`\n  kreft editor: "${args[0]}" is not an editor Kreft knows.`);
    usage(console.error);
    process.exitCode = 1;
    return;
  }
  run[name]();
};
Object.assign(module.exports, { download, vsixFiles, installSublime, installZed, installJetbrains, installVim, sublimeFolders, jetbrainsFolders, vimFolders, NAMES });
