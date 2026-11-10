/*
 * The Electron side: turns the resolved configuration into the files Electron and electron-builder read.
 *
 *   electron/main.js, preload.js    generated bootstrap (carry a "kreft-template" line); they never contain your settings
 *   electron/kreft.resolved.json    the checked, merged configuration; main.js reads it
 *   electron/builder.config.json    the electron-builder configuration made from packaging, updates and advanced.builder
 */
const fs = require('fs');
const path = require('path');
const { deepMerge } = require('./validate.js');

const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'templates', 'desktop');
const read = (name) => fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8');
const MARK = /kreft-template:\s*(electron-(?:main|preload))@(\d+)/;

const TEMPLATES = { main: () => read('electron-main.js'), preload: () => read('electron-preload.js') };

// Writes a generated file. A file that carries the marker is ours and is brought up to date; a file without it (the older
// hand-edited main.js) is kept as <name>.bak and replaced, because it would ignore the configuration.
function writeGenerated(file, content) {
  let note = null;
  if (fs.existsSync(file)) {
    const old = fs.readFileSync(file, 'utf8');
    if (old === content) return null;
    if (!MARK.test(old)) {
      fs.copyFileSync(file, file + '.bak');
      note = `${path.basename(file)} was written by an older Kreft and ignores config/electron.config.js. It is replaced; the old one is saved as ${path.basename(file)}.bak (move your own code to electron/custom.js).`;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return note || 'written';
}

function writeBootstrap(root) {
  const dir = path.join(root, 'electron');
  const notes = [];
  for (const [name, make] of [['main.js', TEMPLATES.main], ['preload.js', TEMPLATES.preload]]) {
    const r = writeGenerated(path.join(dir, name), make());
    if (r && r !== 'written') notes.push(r);
  }
  return notes;
}

function builderConfig(c, root) {
  const e = c.packaging.electron;
  const icon = c.packaging.icon;
  const files = [...new Set([...e.files, icon, ...(c.tray.enabled && c.tray.icon ? [c.tray.icon] : []), 'electron/kreft.resolved.json'])];
  const maintainer = c.app.author;
  const out = {
    appId: c.app.id,
    productName: c.app.name,
    copyright: c.app.copyright,
    directories: { output: e.outputDir, buildResources: 'build' },
    files,
    asar: e.asar,
    compression: e.compression,
    extraMetadata: { description: c.app.description, author: c.app.author, homepage: c.app.homepage, main: 'electron/main.js' },
    mac: { target: e.mac, icon, ...(c.packaging.category ? { category: c.packaging.category } : { category: 'public.app-category.productivity' }) },
    win: { target: e.win, icon },
    nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
    linux: { target: e.linux, icon, category: c.packaging.category && !c.packaging.category.startsWith('public.') ? c.packaging.category : 'Utility', maintainer },
  };
  if (e.extraResources.length) out.extraResources = e.extraResources;
  if (c.updates.enabled && c.updates.url) out.publish = [{ provider: 'generic', url: c.updates.url, channel: c.updates.channel }];
  return deepMerge(out, c.advanced.builder || {});
}

function writeRuntimeFiles(root, c) {
  const dir = path.join(root, 'electron');
  fs.mkdirSync(dir, { recursive: true });
  const runtime = { ...c, advanced: {} }; // advanced.builder is for electron-builder only
  fs.writeFileSync(path.join(dir, 'kreft.resolved.json'), JSON.stringify(runtime, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'builder.config.json'), JSON.stringify(builderConfig(c, root), null, 2) + '\n');
}

module.exports = { TEMPLATES, writeBootstrap, writeRuntimeFiles, builderConfig, MARK };
