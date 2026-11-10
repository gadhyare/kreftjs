/*
 * The Tauri 2 side: turns the resolved configuration into what Tauri reads.
 *
 *   src-tauri/tauri.conf.json              generated: window, security, bundle, plugins
 *   src-tauri/capabilities/default.json    generated: the permissions of the window
 *   src-tauri/src/kreft_generated.rs       generated: menu, DevTools, context menu, tray, notifications, updates
 *   src-tauri/Cargo.toml                   the part between the kreft markers is generated (features and plugin crates)
 *   src-tauri/src/main.rs                  yours: written once, it calls kreft_generated::apply
 *
 * Tauri and Electron do not offer the same things, so this file is not a copy of electron-adapter.js: for example Tauri
 * has no way to set DevTools "off" in a debug build, it opens DevTools only in their own window, and it needs a Rust
 * plugin (a crate plus a capability) for notifications and updates.
 */
const fs = require('fs');
const path = require('path');
const { deepMerge } = require('./validate.js');

const BEGIN = '# >>> kreft-generated: dependencies (change config/tauri.config.js, not these lines)';
const END = '# <<< kreft-generated';

const crateName = (s) => String(s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
const rust = (s) => JSON.stringify(String(s)); // a Rust string literal (the escapes JSON uses are valid in Rust)

function features(c) {
  const f = [];
  if (c.tray.enabled) f.push('tray-icon');
  if (c.tray.enabled && c.tray.icon) f.push('image-png');
  if (c.devtools.production) f.push('devtools');
  return f;
}

function dependencyBlock(c) {
  const lines = [BEGIN, `tauri = { version = "2", features = [${features(c).map((x) => `"${x}"`).join(', ')}] }`];
  if (c.notifications.enabled) lines.push('tauri-plugin-notification = "2"');
  if (c.updates.enabled) lines.push('tauri-plugin-updater = "2"');
  lines.push('serde = { version = "1", features = ["derive"] }', 'serde_json = "1"', END);
  return lines.join('\n');
}

function cargoToml(c) {
  return `[package]
name = "${crateName(c.app.name)}"
version = "${c.app.version}"
description = ${rust(c.app.description)}
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
${dependencyBlock(c)}
`;
}

// The earlier Kreft wrote these three lines; a Cargo.toml that has them gets the marked block instead.
const OLD_DEPS = /tauri = \{ version = "2", features = \[\] \}\r?\nserde = \{ version = "1", features = \["derive"\] \}\r?\nserde_json = "1"/;

function writeCargo(root, c, notes) {
  const file = path.join(root, 'src-tauri', 'Cargo.toml');
  if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, cargoToml(c)); return; }
  let text = fs.readFileSync(file, 'utf8');
  const block = dependencyBlock(c);
  if (text.includes(BEGIN) && text.includes(END)) {
    text = text.slice(0, text.indexOf(BEGIN)) + block + text.slice(text.indexOf(END) + END.length);
  } else if (OLD_DEPS.test(text)) {
    text = text.replace(OLD_DEPS, block);
  } else {
    notes.push(`src-tauri/Cargo.toml has no kreft markers, so its dependencies were not touched. Features needed now: tauri = [${features(c).join(', ')}]${c.notifications.enabled ? ', tauri-plugin-notification = "2"' : ''}${c.updates.enabled ? ', tauri-plugin-updater = "2"' : ''}. Add them, or move the file aside and run "kreft tauri:sync".`);
    return;
  }
  fs.writeFileSync(file, text);
}

function tauriConf(c) {
  const w = c.window;
  const win = {
    label: 'main',
    create: false, // src/kreft_generated.rs creates the window from this entry, so it can add the DevTools and context-menu script
    title: w.title,
    width: w.width,
    height: w.height,
    minWidth: w.minWidth,
    minHeight: w.minHeight,
    resizable: w.resizable,
    fullscreen: w.fullscreen,
    maximized: w.maximized,
    alwaysOnTop: w.alwaysOnTop,
    decorations: w.frame,
    transparent: w.transparent,
    skipTaskbar: w.skipTaskbar,
  };
  if (!w.transparent) win.backgroundColor = w.backgroundColor;
  if (w.maxWidth !== null) win.maxWidth = w.maxWidth;
  if (w.maxHeight !== null) win.maxHeight = w.maxHeight;
  if (w.x !== null && w.y !== null) { win.x = w.x; win.y = w.y; } else win.center = w.center;
  if (w.theme !== 'system') win.theme = w.theme === 'dark' ? 'Dark' : 'Light';
  if (c.webview.userAgent) win.userAgent = c.webview.userAgent;

  const t = c.packaging.tauri;
  const bundle = {
    active: true,
    targets: t.targets === null ? 'all' : t.targets,
    icon: ['icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.icns', 'icons/icon.ico'],
    copyright: c.app.copyright,
    shortDescription: c.app.description,
    publisher: c.app.author.replace(/\s*<.*>/, ''),
    macOS: { minimumSystemVersion: t.macMinimumSystemVersion },
    windows: { webviewInstallMode: { type: t.windowsWebviewInstall } },
  };
  if (c.packaging.category) bundle.category = c.packaging.category;
  if (t.resources.length) bundle.resources = t.resources;
  if (c.updates.enabled) bundle.createUpdaterArtifacts = true;

  const conf = {
    $schema: 'https://schema.tauri.app/config/2',
    productName: c.app.name,
    version: c.app.version,
    identifier: c.app.id,
    build: { frontendDist: '../dist', devUrl: 'http://localhost:8000' }, // `kreft tauri:dev` replaces devUrl with the port it really uses
    app: {
      withGlobalTauri: c.security.globalTauri,
      windows: [win],
      security: { csp: c.security.csp },
    },
    bundle,
  };
  if (c.updates.enabled) conf.plugins = { updater: { pubkey: c.updates.pubkey, endpoints: [c.updates.url] } };
  return deepMerge(conf, c.advanced.tauriConf || {});
}

function capabilities(c) {
  const permissions = ['core:default', ...(c.notifications.enabled ? ['notification:default'] : []), ...(c.updates.enabled ? ['updater:default'] : []), ...c.security.capabilities];
  return {
    $schema: '../gen/schemas/desktop-schema.json',
    identifier: 'default',
    description: 'Generated from config/tauri.config.js. What the main window may do.',
    windows: ['main'],
    permissions: [...new Set(permissions)],
  };
}

// ---- the Rust ------------------------------------------------------------------------------------------------------------

const PREDEFINED = {
  undo: 'undo(h, None)', redo: 'redo(h, None)', cut: 'cut(h, None)', copy: 'copy(h, None)', paste: 'paste(h, None)',
  selectAll: 'select_all(h, None)', minimize: 'minimize(h, None)', close: 'close_window(h, None)', quit: 'quit(h, None)',
  fullscreen: 'fullscreen(h, None)', about: 'about(h, None, None)',
};

// a list of menu entries → Rust statements that build them and the names of the built items
function menuStatements(items, out, counter) {
  const names = [];
  for (const it of items) {
    const n = counter.n++;
    if (it.type === 'separator') { out.push(`    let m${n} = PredefinedMenuItem::separator(h)?;`); names.push(`&m${n}`); continue; }
    if (it.role) { out.push(`    let m${n} = PredefinedMenuItem::${PREDEFINED[it.role]}?;`); names.push(`&m${n}`); continue; }
    if (Array.isArray(it.submenu)) {
      const inner = menuStatements(it.submenu, out, counter);
      out.push(`    let m${n} = Submenu::with_items(h, ${rust(it.label)}, true, &[${inner.join(', ')}])?;`);
    } else {
      out.push(`    let m${n} = MenuItem::with_id(h, ${rust(it.id)}, ${rust(it.label)}, true, ${it.accelerator ? `Some(${rust(it.accelerator)})` : 'None::<&str>'})?;`);
    }
    names.push(`&m${n}`);
  }
  return names;
}

function menuFunction(c) {
  const out = ['fn build_menu(h: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {'];
  if (c.menu.visibility === 'hidden') {
    out.push(
      '    // macOS always has a menu bar: keep an app menu (Quit) and an Edit menu, or Cmd+C and Cmd+V stop working.',
      '    #[cfg(target_os = "macos")]',
      '    {',
      `        let app_menu = Submenu::with_items(h, ${rust(c.app.name)}, true, &[&PredefinedMenuItem::hide(h, None)?, &PredefinedMenuItem::separator(h)?, &PredefinedMenuItem::quit(h, None)?])?;`,
      '        let edit_menu = Submenu::with_items(h, "Edit", true, &[&PredefinedMenuItem::undo(h, None)?, &PredefinedMenuItem::redo(h, None)?, &PredefinedMenuItem::separator(h)?, &PredefinedMenuItem::cut(h, None)?, &PredefinedMenuItem::copy(h, None)?, &PredefinedMenuItem::paste(h, None)?, &PredefinedMenuItem::select_all(h, None)?])?;',
      '        return Menu::with_items(h, &[&app_menu, &edit_menu]);',
      '    }',
      '    #[cfg(not(target_os = "macos"))]',
      '    {',
      '        Menu::new(h)',
      '    }',
    );
  } else if (c.menu.template) {
    const counter = { n: 0 };
    const stmts = [];
    const top = menuStatements(c.menu.template, stmts, counter);
    out.push(...stmts, `    Menu::with_items(h, &[${top.join(', ')}])`);
  } else {
    out.push('    Menu::default(h)');
  }
  out.push('}');
  return out.join('\n');
}

const SHOW = 'if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }';
const HIDE = 'if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }';
const TOGGLE = 'if let Some(w) = app.get_webview_window("main") { if w.is_visible().unwrap_or(false) { let _ = w.hide(); } else { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); } }';

function trayCode(c) {
  if (!c.tray.enabled) return '';
  const items = [];
  const arms = [];
  c.tray.menu.forEach((it, i) => {
    if (it.type === 'separator') { items.push(`        let t${i} = PredefinedMenuItem::separator(app)?;`); return; }
    const id = `kreft-tray:${i}`;
    items.push(`        let t${i} = MenuItem::with_id(app, ${rust(id)}, ${rust(it.label)}, true, None::<&str>)?;`);
    const body = { show: SHOW, hide: HIDE, toggle: TOGGLE, quit: 'app.exit(0);', emit: `let _ = app.emit("kreft:tray", ${rust(it.id)});` }[it.action];
    arms.push(`                    ${rust(id)} => { ${body} }`);
  });
  const refs = c.tray.menu.map((_, i) => `&t${i}`).join(', ');
  const click = { toggle: TOGGLE, show: SHOW, none: '' }[c.tray.clickAction];
  const icon = c.tray.icon
    ? '        builder = builder.icon(tauri::image::Image::from_bytes(include_bytes!("../icons/kreft-tray.png"))?);'
    : '        if let Some(icon) = app.default_window_icon() { builder = builder.icon(icon.clone()); }';
  return `
    // ---- the tray icon (tray.*)
    {
${items.join('\n')}
        let tray_menu = Menu::with_items(app, &[${refs}])?;
        let mut builder = TrayIconBuilder::with_id("kreft-tray")
            .tooltip(${rust(c.tray.tooltip)})
            .menu(&tray_menu)
            .show_menu_on_left_click(${c.tray.clickAction === 'none'})
            .on_menu_event(|app, event| {
                match event.id().0.as_str() {
${arms.join('\n')}
                    _ => {}
                }
            })${c.tray.clickAction === 'none' ? '' : `
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    let app = tray.app_handle();
                    ${click}
                }
            })`};
${icon}
        builder.build(app)?;
    }
`;
}

function initScript(c) {
  const parts = [];
  if (!c.contextMenu.enabled) parts.push("document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);");
  if (c.devtools.shortcut) {
    parts.push("window.addEventListener('keydown', function (e) { var k = (e.key || '').toLowerCase(); if (k === 'f12' || (k === 'i' && e.shiftKey && (e.ctrlKey || (e.metaKey && e.altKey)))) { e.preventDefault(); window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'kreft:toggle-devtools', payload: null }); } }, true);");
  }
  return `(function () {\n  ${parts.join('\n  ')}\n})();`;
}

function generatedRust(c) {
  const prod = c.devtools.production;
  const devtoolsFns = prod
    ? `fn toggle_devtools(w: &tauri::WebviewWindow) { if w.is_devtools_open() { w.close_devtools(); } else { w.open_devtools(); } }
fn open_devtools(w: &tauri::WebviewWindow) { w.open_devtools(); }`
    : `// devtools.production is false: a release build has no DevTools at all (the "devtools" feature is off), so these do nothing there.
#[cfg(debug_assertions)]
fn toggle_devtools(w: &tauri::WebviewWindow) { if w.is_devtools_open() { w.close_devtools(); } else { w.open_devtools(); } }
#[cfg(debug_assertions)]
fn open_devtools(w: &tauri::WebviewWindow) { w.open_devtools(); }
#[cfg(not(debug_assertions))]
fn toggle_devtools(_w: &tauri::WebviewWindow) {}
#[cfg(not(debug_assertions))]
fn open_devtools(_w: &tauri::WebviewWindow) {}`;

  const plugins = [
    c.notifications.enabled ? '        .plugin(tauri_plugin_notification::init())' : '',
    c.updates.enabled ? '        .plugin(tauri_plugin_updater::Builder::new().build())' : '',
    c.tray.enabled && c.tray.closeToTray ? `        .on_window_event(|window, event| {
            // tray.closeToTray: closing the window hides it. "Quit" in the tray menu leaves the app.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })` : '',
  ].filter(Boolean).join('\n');

  const update = c.updates.enabled && c.updates.checkOnStart ? `
    // ---- look for an update (updates.*), in the installed app only
    #[cfg(not(debug_assertions))]
    {
        use tauri_plugin_updater::UpdaterExt;
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(updater) = handle.updater() {
                if let Ok(Some(update)) = updater.check().await {
                    let _ = handle.emit("kreft:update-available", update.version.clone());
                }
            }
        });
    }
` : '';

  return `// Generated by \`kreft tauri:sync\` (it runs by itself in \`kreft tauri:dev\` and \`kreft tauri:build\`). DO NOT EDIT.
// Change config/tauri.config.js instead; this file is written again from it every time.
// Your own Rust code goes in src/main.rs: it calls apply() below, or setup() from your own setup function.
#![allow(unused_imports, unused_mut, unused_variables, dead_code)]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Listener, Manager};
${c.tray.enabled ? 'use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};\n' : ''}
const ALLOWED_NAVIGATION: &[&str] = &[${(c.webview.allowedNavigation||[]).map((o)=>rust(String(o))).join(', ')}];

/// The app's own pages (tauri://localhost, http(s)://tauri.localhost), about:blank, and the origins you allowed.
fn navigation_allowed(origins: &[String], url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" | "about" => return true,
        _ => {}
    }
    if matches!(url.host_str(), Some("tauri.localhost")) { return true; }
    let origin = url.origin().ascii_serialization();
    origins.iter().any(|o| o.trim_end_matches('/') == origin)
}

const INIT_SCRIPT: &str = ${rust(initScript(c))};

${menuFunction(c)}

${devtoolsFns}

/// Adds the menu, the plugins and the setup of the configuration to the builder.
pub fn apply(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .menu(|handle| build_menu(handle))
        .on_menu_event(|app, event| {
            // an entry with an id was clicked: the page hears it (kreftDesktop.onMenu, or listen('kreft:menu'))
            let id = event.id().0.clone();
            if !id.starts_with("kreft-tray:") { let _ = app.emit("kreft:menu", id); }
        })
${plugins ? plugins + '\n' : ''}        .setup(setup)
}

/// Creates the main window from tauri.conf.json and applies everything else. Call it from your own setup if you have one.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    // the window may go to the app itself, the dev server (debug builds) and webview.allowedNavigation. Anything else is refused.
    let mut app_origins: Vec<String> = ALLOWED_NAVIGATION.iter().map(|s| s.to_string()).collect();
    #[cfg(debug_assertions)]
    if let Some(dev) = app.config().build.dev_url.as_ref() { app_origins.push(dev.origin().ascii_serialization()); }
    let config = app.config().app.windows.iter().find(|w| w.label == "main").cloned().ok_or("tauri.conf.json has no window with the label \\"main\\"")?;
    let window = tauri::WebviewWindowBuilder::from_config(&handle, &config)?
        .initialization_script(INIT_SCRIPT)
        .on_navigation(move |url| navigation_allowed(&app_origins, url))
        .build()?;
${c.menu.visibility === 'hidden' ? `
    // ---- menu.visibility is "hidden": no menu bar on Windows and Linux
    #[cfg(not(target_os = "macos"))]
    { let _ = window.hide_menu(); }
` : ''}${c.webview.zoomFactor !== 1 ? `
    let _ = window.set_zoom(${Number(c.webview.zoomFactor)}_f64);
` : ''}
    // ---- DevTools (devtools.*): F12 and Ctrl+Shift+I ask for them through the "kreft:toggle-devtools" event
    {
        let w = window.clone();
        app.listen("kreft:toggle-devtools", move |_| toggle_devtools(&w));
    }
${c.devtools.openOnStart ? `    ${c.devtools.production ? '' : '#[cfg(debug_assertions)]\n    '}open_devtools(&window);
` : ''}${trayCode(c)}${update}${selfTest(c)}
    Ok(())
}
`;
}

// A test hook, in debug builds only: KREFT_DESKTOP_SELFTEST=<file> writes the real state of the window to the file and quits.
function selfTest(c) {
  return `
    // ---- test hook (debug builds only)
    #[cfg(debug_assertions)]
    if let Ok(path) = std::env::var("KREFT_DESKTOP_SELFTEST") {
        let w = window.clone();
        let handle = app.handle().clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let scale = w.scale_factor().unwrap_or(1.0);
            let size = w.inner_size().map(|s| s.to_logical::<f64>(scale)).ok();
            let opened_at_start = w.is_devtools_open();
            // try to leave the app, as a link or a script of the page would: the window must stay where it is
            let before = w.url().ok().map(|u| u.to_string());
            let _ = w.eval("window.location.href = 'https://example.com/'");
            std::thread::sleep(std::time::Duration::from_millis(2500));
            let after = w.url().ok().map(|u| u.to_string());
            toggle_devtools(&w);
            std::thread::sleep(std::time::Duration::from_millis(700));
            let state = serde_json::json!({
                "platform": std::env::consts::OS,
                "urlBefore": before,
                "urlAfterForeignNavigation": after,
                "windowCount": handle.webview_windows().len(),
                "title": w.title().ok(),
                "width": size.map(|s| s.width.round()),
                "height": size.map(|s| s.height.round()),
                "resizable": w.is_resizable().ok(),
                "fullscreen": w.is_fullscreen().ok(),
                "maximized": w.is_maximized().ok(),
                "decorated": w.is_decorated().ok(),
                "alwaysOnTop": null,
                "appMenu": handle.menu().map(|m| m.items().map(|v| v.len()).unwrap_or(0)),
                "menuVisible": if cfg!(target_os = "macos") { None } else { w.is_menu_visible().ok() },
                "devToolsOpenAtStart": opened_at_start,
                "devToolsOpenAfterToggle": w.is_devtools_open(),
                "tray": ${c.tray.enabled ? 'handle.tray_by_id("kreft-tray").is_some()' : 'false'},
            });
            let _ = std::fs::write(path, serde_json::to_string_pretty(&state).unwrap_or_default());
            handle.exit(0);
        });
    }
`;
}

const MAIN_RS = `// Your Rust code. Everything the configuration controls (menu, DevTools, tray, notifications, updates) is in
// kreft_generated.rs, which is written from config/tauri.config.js: edit that file's settings, not this call.
mod kreft_generated;

fn main() {
    let builder = kreft_generated::apply(tauri::Builder::default());
    // Add your own commands and plugins here. Note: calling .setup(…) or .invoke_handler(…) on the builder replaces
    // what was set before; for a setup of your own, call kreft_generated::setup(app)? inside it.
    builder
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}
`;

// the main.rs the earlier Kreft wrote (before the configuration file existed)
const OLD_MAIN = /^\/\/ Hides the extra console window[\s\S]*tauri::Builder::default\(\)\s*\.run\(tauri::generate_context!\(\)\)[\s\S]*$/;

function writeIfChanged(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  fs.writeFileSync(file, content);
}

// Writes everything generated. Returns notes for the person (things that were kept as they were, and why).
function sync(root, c) {
  const dir = path.join(root, 'src-tauri');
  const notes = [];
  writeIfChanged(path.join(dir, 'tauri.conf.json'), JSON.stringify(tauriConf(c), null, 2) + '\n');
  writeIfChanged(path.join(dir, 'capabilities', 'default.json'), JSON.stringify(capabilities(c), null, 2) + '\n');
  writeIfChanged(path.join(dir, 'src', 'kreft_generated.rs'), generatedRust(c));
  writeIfChanged(path.join(dir, 'build.rs'), 'fn main() {\n    tauri_build::build()\n}\n');
  writeCargo(root, c, notes);

  const main = path.join(dir, 'src', 'main.rs');
  if (!fs.existsSync(main)) writeIfChanged(main, MAIN_RS);
  else {
    const old = fs.readFileSync(main, 'utf8');
    if (OLD_MAIN.test(old) && !old.includes('kreft_generated')) fs.writeFileSync(main, MAIN_RS);
    else if (!old.includes('kreft_generated')) notes.push('src-tauri/src/main.rs does not call kreft_generated::apply, so config/tauri.config.js has no effect on the menu, DevTools, tray or plugins. Add: mod kreft_generated; and kreft_generated::apply(tauri::Builder::default()). See the docs.');
  }
  if (!fs.existsSync(path.join(dir, '.gitignore'))) fs.writeFileSync(path.join(dir, '.gitignore'), '/target/\n/gen/\n');

  if (c.tray.enabled && c.tray.icon) {
    const src = path.resolve(root, c.tray.icon);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.join(dir, 'icons'), { recursive: true });
      fs.copyFileSync(src, path.join(dir, 'icons', 'kreft-tray.png'));
    } else notes.push(`tray.icon: ${c.tray.icon} does not exist, so the tray icon file was not copied and the build will fail. Fix the path or set tray.icon to null.`);
  }
  return notes;
}

module.exports = { sync, tauriConf, capabilities, generatedRust, cargoToml, dependencyBlock, features, menuFunction, MAIN_RS, BEGIN, END };
