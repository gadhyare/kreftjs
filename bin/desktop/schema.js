/*
 * The desktop configuration schema: the one description of every option that config/electron.config.js and
 * config/tauri.config.js accept. The defaults, the validation, the environment variable names, the TypeScript
 * definitions (desktop.d.ts) and the documentation tables are all made from it.
 *
 * A node is { kind, default, doc, ... }:
 *   kind      'bool' | 'int' | 'number' | 'string' | 'enum' | 'list' | 'map' | 'group'
 *   default   a value, or { electron: …, tauri: … } when the two runtimes differ; null means "worked out from package.json"
 *   runtimes  ['electron'] / ['tauri']: the option exists only there. In the other runtime it is rejected with `hint`.
 *   values    for enums: an array, or { electron: […], tauri: […] }
 */
const RUNTIMES = ['electron', 'tauri'];

const node = (kind, def, doc, extra = {}) => ({ kind, default: def, doc, ...extra });
const bool = (d, doc, x) => node('bool', d, doc, x);
const int = (d, doc, x) => node('int', d, doc, x);
const num = (d, doc, x) => node('number', d, doc, x);
const str = (d, doc, x) => node('string', d, doc, x);
const en = (d, values, doc, x) => node('enum', d, doc, { values, ...x });
const list = (items, d, doc, x) => node('list', d, doc, { items, ...x });
const map = (doc, x) => node('map', {}, doc, x);
const group = (fields, doc, x) => ({ kind: 'group', doc, fields, ...x });

const only = (rt, hint) => ({ runtimes: [rt], hint });

// the roles a menu item can have: the ones both runtimes know, then the Electron-only ones
const ROLES_SHARED = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'minimize', 'close', 'quit', 'fullscreen', 'about'];
const ROLES_ELECTRON = ['reload', 'forceReload', 'toggleDevTools', 'zoomIn', 'zoomOut', 'resetZoom'];

// a menu entry: { role }, { type: 'separator' }, { id, label } (tells the page when clicked) or { label, submenu: [ … ] }
const menuItem = () => ({
  kind: 'group',
  doc: 'One menu entry.',
  fields: {
    label: str(null, 'The text of the entry. Required for entries without a role.', { nullable: true }),
    id: str(null, 'A name for the entry. The page is told this name when the entry is clicked (kreftDesktop.onMenu).', { nullable: true, pattern: /^[A-Za-z0-9_.:-]+$/ }),
    role: en(null, { electron: [...ROLES_SHARED, ...ROLES_ELECTRON], tauri: ROLES_SHARED }, 'A ready-made entry of the system (copy, paste, quit…).', { nullable: true }),
    type: en(null, ['separator'], 'Use "separator" for a line between entries.', { nullable: true }),
    accelerator: str(null, 'A keyboard shortcut, for example "CmdOrCtrl+K".', { nullable: true, pattern: /^[A-Za-z0-9+]+$/ }),
    submenu: node('list', null, 'Entries inside this entry.', { nullable: true, items: null, recursive: true }),
  },
});

const trayItem = () => ({
  kind: 'group',
  doc: 'One entry of the tray menu.',
  fields: {
    label: str(null, 'The text of the entry.', { nullable: true }),
    id: str(null, 'A name for the entry. The page is told this name when an "emit" entry is clicked.', { nullable: true, pattern: /^[A-Za-z0-9_.:-]+$/ }),
    action: en('emit', ['show', 'hide', 'toggle', 'quit', 'emit'], 'What the entry does. "emit" tells the page its id.'),
    type: en(null, ['separator'], 'Use "separator" for a line between entries.', { nullable: true }),
  },
});

const SCHEMA = group({
  app: group({
    name: str(null, 'The name people see. Default: the "productName" or "name" in package.json.', { nullable: true }),
    id: str(null, 'The reverse-domain id, for example "com.acme.notes". Default: com.kreftjs. followed by the lowercase name.', { nullable: true, pattern: /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/ }),
    version: str(null, 'The version number. Default: the "version" in package.json.', { nullable: true }),
    description: str(null, 'A one-line description. Default: the "description" in package.json.', { nullable: true }),
    author: str(null, 'Who makes the app. Default: the "author" in package.json.', { nullable: true }),
    homepage: str(null, 'The web address of the app. Default: the "homepage" in package.json.', { nullable: true }),
    copyright: str(null, 'The copyright line shown in the installer and the About box.', { nullable: true }),
  }, 'Name, id and version of the app.'),

  window: group({
    title: str(null, 'The window title. Default: the app name.', { nullable: true }),
    width: int(1200, 'Width in pixels.', { min: 200, max: 16000 }),
    height: int(800, 'Height in pixels.', { min: 150, max: 16000 }),
    minWidth: int(800, 'The window cannot be made narrower than this.', { min: 0, max: 16000 }),
    minHeight: int(600, 'The window cannot be made lower than this.', { min: 0, max: 16000 }),
    maxWidth: int(null, 'The window cannot be made wider than this. null: no limit.', { min: 200, max: 32000, nullable: true }),
    maxHeight: int(null, 'The window cannot be made higher than this. null: no limit.', { min: 150, max: 32000, nullable: true }),
    x: int(null, 'Distance from the left edge of the screen. null: the system chooses (or the window is centered).', { min: -32000, max: 32000, nullable: true }),
    y: int(null, 'Distance from the top edge of the screen. null: the system chooses (or the window is centered).', { min: -32000, max: 32000, nullable: true }),
    center: bool(true, 'Open the window in the middle of the screen (ignored when x and y are set).'),
    resizable: bool(true, 'Let people resize the window.'),
    fullscreen: bool(false, 'Open the window in full screen.'),
    maximized: bool(false, 'Open the window maximized.'),
    alwaysOnTop: bool(false, 'Keep the window above all others.'),
    frame: bool(true, 'Draw the system title bar and border. false: a window without them.'),
    transparent: bool(false, 'A see-through window background (the page must draw its own background).'),
    backgroundColor: str('#ffffff', 'The colour shown before the page has drawn, as #rrggbb.', { pattern: /^#[0-9a-fA-F]{6}$/ }),
    theme: en('system', ['system', 'light', 'dark'], 'The look of the window frame and the system dialogs.'),
    skipTaskbar: bool(false, 'Keep the window out of the taskbar or dock.'),
    showOnReady: bool(true, 'Show the window only when the page is ready, so it never opens as a white flash.', only('electron', 'Tauri shows its window as soon as it is created.')),
  }, 'How the main window looks and behaves.'),

  menu: group({
    visibility: en('hidden', { electron: ['hidden', 'visible', 'auto'], tauri: ['hidden', 'visible'] },
      '"hidden": no menu bar. "visible": the menu bar. "auto": hidden until Alt is pressed (Electron on Windows and Linux only). On macOS the system menu bar always exists, so "hidden" keeps a minimal app and Edit menu: without them, copy and paste shortcuts stop working.'),
    template: list(menuItem(), null, 'Your own menu, as a list of top-level entries with a submenu. null: the default menu of the runtime.', { nullable: true }),
  }, 'The native application menu.'),

  contextMenu: group({
    enabled: bool(true, 'Allow the right-click menu. false: right-click does nothing.'),
    items: list({ kind: 'enum', values: ['copy', 'cut', 'paste', 'selectAll'] }, ['copy', 'cut', 'paste', 'selectAll'],
      'The entries of the right-click menu on text.', only('electron', 'Tauri uses the right-click menu of the system web view. You can only turn it on or off with enabled.')),
    inspectElement: bool(true, 'Add "Inspect element" when DevTools are allowed.', only('electron', 'In Tauri, DevTools open from the keyboard shortcut or from devtools.openOnStart.')),
  }, 'The right-click menu.'),

  devtools: group({
    development: bool(true, 'Allow DevTools while you work (kreft electron:dev, kreft tauri:dev).', { requiredValue: { tauri: true, hint: 'Tauri debug builds always contain DevTools, so this cannot be turned off. Remove it or set it to true.' } }),
    production: bool(false, 'Allow DevTools in the installed app. Keep it false unless you need to debug a release.'),
    openOnStart: bool(false, 'Open DevTools by themselves when the window opens (only where they are allowed).'),
    mode: en({ electron: 'right', tauri: 'detach' }, { electron: ['right', 'bottom', 'left', 'detach'], tauri: ['detach'] }, 'Where DevTools open. Tauri can only open them in their own window.'),
    shortcut: bool(true, 'F12 and Ctrl+Shift+I (Cmd+Option+I on macOS) toggle DevTools where they are allowed.'),
  }, 'The developer tools.'),

  webview: group({
    zoomFactor: num(1, 'The page zoom. 1 is 100 %.', { min: 0.25, max: 5 }),
    userAgent: str(null, 'Text sent to servers as the browser name. null: the default of the runtime.', { nullable: true }),
    spellcheck: bool(false, 'Underline misspelled words in text fields.', only('electron', 'Tauri uses the spell checking of the system web view.')),
    backgroundThrottling: bool(true, 'Slow the page down when the window is hidden.', only('electron', 'Tauri uses the behaviour of the system web view.')),
    openExternalLinksInBrowser: bool(true, 'A link to another site opens in the system browser, not in the app window.'),
    allowedNavigation: list({ kind: 'string' }, [], 'Origins (like "https://login.acme.com") the window may go to besides the app itself. Everything else is blocked.', { itemPattern: /^https?:\/\/[^\s/]+$/, itemHint: 'an origin without a path, like https://login.acme.com' }),
  }, 'The web page inside the window.'),

  security: group({
    csp: str(null, 'The Content-Security-Policy of the pages, for example "default-src \'self\'". null: none is added.', { nullable: true }),
    blockNewWindows: bool(true, 'Pages cannot open new windows.'),
    contextIsolation: bool(true, 'Keep the page and the preload script in separate JavaScript worlds.', only('electron', 'Tauri always separates them.')),
    sandbox: bool(true, 'Run the page in the operating system sandbox.', only('electron', 'Tauri pages run in the system web view, which is sandboxed.')),
    nodeIntegration: bool(false, 'Give the page access to Node.js. Leave it false: any script on the page could then run programs on the computer.', only('electron', 'Tauri pages never get Node.js.')),
    webSecurity: bool(true, 'Keep the same-origin policy of the browser.', only('electron', 'Tauri always keeps it.')),
    allowRunningInsecureContent: bool(false, 'Let an https page load http scripts.', only('electron', 'Tauri does not offer this.')),
    permissions: list({ kind: 'string' }, [], 'Browser permissions the page may get, for example "geolocation", "media", "clipboard-read". Notifications are allowed by notifications.enabled.',
      { itemPattern: /^[a-zA-Z][a-zA-Z0-9-]*$/, itemHint: 'a permission name like geolocation', ...only('electron', 'In Tauri, rights are given with security.capabilities.') }),
    capabilities: list({ kind: 'string' }, [], 'Extra Tauri permissions for the window, like "dialog:default" (the plugin must also be added in src-tauri/Cargo.toml). "core:default" is always there.',
      { itemPattern: /^[a-z][a-z0-9-]*:[a-z][a-z0-9:-]*$/, itemHint: 'a permission like dialog:default', ...only('tauri', 'In Electron, rights are given with security.permissions.') }),
    globalTauri: bool(true, 'Put the Tauri API on window.__TAURI__.', only('tauri', 'This is a Tauri option.')),
  }, 'What the page may do. The defaults are the safe ones.'),

  tray: group({
    enabled: bool(false, 'Show an icon in the system tray (the menu bar on macOS).'),
    icon: str(null, 'A PNG file, relative to the project. null: the app icon.', { nullable: true, pattern: /\.png$/i }),
    tooltip: str(null, 'Text shown when the mouse rests on the icon. null: the app name.', { nullable: true }),
    closeToTray: bool(false, 'Closing the window hides it; the app keeps running in the tray. Choose "Quit" in the tray menu to leave.'),
    clickAction: en('toggle', ['toggle', 'show', 'none'], 'What a click on the tray icon does.'),
    menu: list(trayItem(), [
      { label: 'Show', action: 'show' },
      { type: 'separator' },
      { label: 'Quit', action: 'quit' },
    ], 'The entries of the tray menu.'),
  }, 'The system tray icon.'),

  notifications: group({
    enabled: bool(false, 'The page may show system notifications. In Tauri this adds the notification plugin (a crate and a permission).'),
  }, 'System notifications.'),

  updates: group({
    enabled: bool(false, 'Look for new versions of the app.'),
    url: str(null, 'The https address of the folder that holds the update files (Electron: latest.yml and the installers; Tauri: the update JSON).', { nullable: true, pattern: /^https?:\/\/\S+$/ }),
    channel: str('latest', 'The release channel, like "latest" or "beta".', { pattern: /^[A-Za-z0-9._-]+$/ }),
    checkOnStart: bool(true, 'Look for an update each time the app starts (installed app only).'),
    autoDownload: bool(false, 'Download an update without asking.', only('electron', 'In Tauri the page decides when to download, with the updater plugin.')),
    pubkey: str(null, 'The public key that update files are signed with (made by "npx tauri signer generate").', { nullable: true, ...only('tauri', 'Electron checks the signature of the installer with your code-signing certificate.') }),
  }, 'Updates.'),

  packaging: group({
    icon: str('build/icon.png', 'The app icon, a square PNG (1024×1024 is best), relative to the project.', { pattern: /\.png$/i }),
    category: str(null, 'The category in app stores and menus, like "public.app-category.productivity" (macOS) or "Utility" (Linux). null: the default of the runtime.', { nullable: true }),
    electron: group({
      outputDir: str('dist-electron', 'The folder the installers are written to.'),
      mac: list({ kind: 'enum', values: ['dmg', 'zip', 'pkg', 'dir'] }, ['dmg', 'zip'], 'Installers to make for macOS.'),
      win: list({ kind: 'enum', values: ['nsis', 'portable', 'msi', 'zip', 'dir'] }, ['nsis', 'portable'], 'Installers to make for Windows.'),
      linux: list({ kind: 'enum', values: ['AppImage', 'deb', 'rpm', 'tar.gz', 'snap', 'dir'] }, ['AppImage', 'deb', 'rpm'], 'Installers to make for Linux.'),
      asar: bool(true, 'Pack the app files into one archive.'),
      compression: en('normal', ['store', 'normal', 'maximum'], 'How much the installer is compressed.'),
      files: list({ kind: 'string' }, ['dist/**/*', 'electron/**/*', 'package.json'], 'The files that go into the app (build/icon.png and the tray icon are added).'),
      extraResources: list({ kind: 'string' }, [], 'Extra files copied next to the app, relative to the project.'),
    }, 'Electron installers (electron-builder).', only('electron', 'This section is for Electron. Tauri options are in packaging.tauri.')),
    tauri: group({
      targets: list({ kind: 'enum', values: ['app', 'dmg', 'nsis', 'msi', 'deb', 'rpm', 'appimage'] }, null, 'Installers to make. null: all that fit the system you build on.', { nullable: true }),
      resources: list({ kind: 'string' }, [], 'Extra files that go into the app, relative to src-tauri/.'),
      macMinimumSystemVersion: str('10.15', 'The oldest macOS the app runs on.', { pattern: /^\d+(\.\d+){0,2}$/ }),
      windowsWebviewInstall: en('downloadBootstrapper', ['skip', 'downloadBootstrapper', 'embedBootstrapper', 'offlineInstaller'], 'How the installer gets WebView2 on Windows.'),
    }, 'Tauri installers.', only('tauri', 'This section is for Tauri. Electron options are in packaging.electron.')),
  }, 'How the installers are made.'),

  advanced: group({
    builder: map('Merged into the electron-builder configuration. Use it for options this file does not have.', only('electron', 'Use advanced.tauriConf for Tauri.')),
    tauriConf: map('Merged into src-tauri/tauri.conf.json. Use it for options this file does not have.', only('tauri', 'Use advanced.builder for Electron.')),
  }, 'A way out for options this file does not know. Values here are merged into the generated native configuration last.'),
}, 'Desktop app configuration.');

// ---- helpers over the schema ---------------------------------------------------------------------------------------

const appliesTo = (n, rt) => !n.runtimes || n.runtimes.includes(rt);
const pick = (v, rt) => (v && typeof v === 'object' && !Array.isArray(v) && ('electron' in v || 'tauri' in v) ? v[rt] : v);

function defaultOf(n, rt) {
  if (n.kind === 'group') {
    const out = {};
    for (const [k, f] of Object.entries(n.fields)) if (appliesTo(f, rt)) out[k] = defaultOf(f, rt);
    return out;
  }
  const d = pick(n.default, rt);
  if (d === undefined) return null;
  const copy = JSON.parse(JSON.stringify(d));
  // an entry of a list of objects carries every option, as the validator also makes it
  if (n.kind === 'list' && Array.isArray(copy) && n.items && n.items.kind === 'group') {
    return copy.map((item) => {
      const full = { ...item };
      for (const [k, f] of Object.entries(n.items.fields)) if (!(k in full) && f.kind !== 'group') full[k] = defaultOf({ kind: 'group', fields: { [k]: f } }, rt)[k];
      return full;
    });
  }
  return copy;
}

// every leaf option as [path, node]; lists, maps and enums count as leaves
function leaves(n = SCHEMA, prefix = []) {
  const out = [];
  for (const [k, f] of Object.entries(n.fields)) {
    if (f.kind === 'group' && !f.recursive) out.push(...leaves(f, [...prefix, k]));
    else out.push([[...prefix, k], f]);
  }
  return out;
}

const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
const envName = (rt, path) => `KREFT_${rt.toUpperCase()}_${path.map(snake).join('_')}`;
const sharedEnvName = (path) => `KREFT_DESKTOP_${path.map(snake).join('_')}`;

module.exports = { SCHEMA, RUNTIMES, ROLES_SHARED, ROLES_ELECTRON, appliesTo, pick, defaultOf, leaves, envName, sharedEnvName, snake };
