// Generated from bin/desktop/schema.js by "node bin/desktop/dts.js --write". Do not edit.
// Types for config/electron.config.js and config/tauri.config.js:
//   /** @type {import('kreftjs/desktop').ElectronConfig} */
//   module.exports = { window: { width: 1000 } }
// or: const { defineElectronConfig } = require('kreftjs/desktop'); module.exports = defineElectronConfig({ … })

/** What a config function receives. */
export interface DesktopConfigContext {
  runtime: 'electron' | 'tauri';
  /** "development" for `kreft <runtime>:dev`, "production" for `kreft <runtime>:build`. */
  mode: 'development' | 'production';
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}

/** One menu entry. */
export interface ElectronMenuTemplateEntry {
  /** The text of the entry. Required for entries without a role. */
  label?: string | null;
  /** A name for the entry. The page is told this name when the entry is clicked (kreftDesktop.onMenu). */
  id?: string | null;
  /** A ready-made entry of the system (copy, paste, quit…). */
  role?: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll" | "minimize" | "close" | "quit" | "fullscreen" | "about" | "reload" | "forceReload" | "toggleDevTools" | "zoomIn" | "zoomOut" | "resetZoom" | null;
  /** Use "separator" for a line between entries. */
  type?: "separator" | null;
  /** A keyboard shortcut, for example "CmdOrCtrl+K". */
  accelerator?: string | null;
  /** Entries inside this entry. */
  submenu?: Array<ElectronMenuTemplateEntry> | null;
}

/** One entry of the tray menu. */
export interface ElectronTrayMenuEntry {
  /** The text of the entry. */
  label?: string | null;
  /** A name for the entry. The page is told this name when an "emit" entry is clicked. */
  id?: string | null;
  /** What the entry does. "emit" tells the page its id. Default: `"emit"`. */
  action?: "show" | "hide" | "toggle" | "quit" | "emit";
  /** Use "separator" for a line between entries. */
  type?: "separator" | null;
}

/** The settings of an Electron app (config/electron.config.js). Every option is optional: what you leave out keeps its default. */
export interface ElectronConfig {
  /** Name, id and version of the app. */
  app?: {
    /** The name people see. Default: the "productName" or "name" in package.json. */
    name?: string | null;
    /** The reverse-domain id, for example "com.acme.notes". Default: com.kreftjs. followed by the lowercase name. */
    id?: string | null;
    /** The version number. Default: the "version" in package.json. */
    version?: string | null;
    /** A one-line description. Default: the "description" in package.json. */
    description?: string | null;
    /** Who makes the app. Default: the "author" in package.json. */
    author?: string | null;
    /** The web address of the app. Default: the "homepage" in package.json. */
    homepage?: string | null;
    /** The copyright line shown in the installer and the About box. */
    copyright?: string | null;
  };
  /** How the main window looks and behaves. */
  window?: {
    /** The window title. Default: the app name. */
    title?: string | null;
    /** Width in pixels. Default: `1200`. */
    width?: number;
    /** Height in pixels. Default: `800`. */
    height?: number;
    /** The window cannot be made narrower than this. Default: `800`. */
    minWidth?: number;
    /** The window cannot be made lower than this. Default: `600`. */
    minHeight?: number;
    /** The window cannot be made wider than this. null: no limit. */
    maxWidth?: number | null;
    /** The window cannot be made higher than this. null: no limit. */
    maxHeight?: number | null;
    /** Distance from the left edge of the screen. null: the system chooses (or the window is centered). */
    x?: number | null;
    /** Distance from the top edge of the screen. null: the system chooses (or the window is centered). */
    y?: number | null;
    /** Open the window in the middle of the screen (ignored when x and y are set). Default: `true`. */
    center?: boolean;
    /** Let people resize the window. Default: `true`. */
    resizable?: boolean;
    /** Open the window in full screen. Default: `false`. */
    fullscreen?: boolean;
    /** Open the window maximized. Default: `false`. */
    maximized?: boolean;
    /** Keep the window above all others. Default: `false`. */
    alwaysOnTop?: boolean;
    /** Draw the system title bar and border. false: a window without them. Default: `true`. */
    frame?: boolean;
    /** A see-through window background (the page must draw its own background). Default: `false`. */
    transparent?: boolean;
    /** The colour shown before the page has drawn, as #rrggbb. Default: `"#ffffff"`. */
    backgroundColor?: string;
    /** The look of the window frame and the system dialogs. Default: `"system"`. */
    theme?: "system" | "light" | "dark";
    /** Keep the window out of the taskbar or dock. Default: `false`. */
    skipTaskbar?: boolean;
    /** Show the window only when the page is ready, so it never opens as a white flash. Default: `true`. */
    showOnReady?: boolean;
  };
  /** The native application menu. */
  menu?: {
    /** "hidden": no menu bar. "visible": the menu bar. "auto": hidden until Alt is pressed (Electron on Windows and Linux only). On macOS the system menu bar always exists, so "hidden" keeps a minimal app and Edit menu: without them, copy and paste shortcuts stop working. Default: `"hidden"`. */
    visibility?: "hidden" | "visible" | "auto";
    /** Your own menu, as a list of top-level entries with a submenu. null: the default menu of the runtime. */
    template?: Array<ElectronMenuTemplateEntry> | null;
  };
  /** The right-click menu. */
  contextMenu?: {
    /** Allow the right-click menu. false: right-click does nothing. Default: `true`. */
    enabled?: boolean;
    /** The entries of the right-click menu on text. */
    items?: Array<"copy" | "cut" | "paste" | "selectAll">;
    /** Add "Inspect element" when DevTools are allowed. Default: `true`. */
    inspectElement?: boolean;
  };
  /** The developer tools. */
  devtools?: {
    /** Allow DevTools while you work (kreft electron:dev, kreft tauri:dev). Default: `true`. */
    development?: boolean;
    /** Allow DevTools in the installed app. Keep it false unless you need to debug a release. Default: `false`. */
    production?: boolean;
    /** Open DevTools by themselves when the window opens (only where they are allowed). Default: `false`. */
    openOnStart?: boolean;
    /** Where DevTools open. Tauri can only open them in their own window. Default: `"right"`. */
    mode?: "right" | "bottom" | "left" | "detach";
    /** F12 and Ctrl+Shift+I (Cmd+Option+I on macOS) toggle DevTools where they are allowed. Default: `true`. */
    shortcut?: boolean;
  };
  /** The web page inside the window. */
  webview?: {
    /** The page zoom. 1 is 100 %. Default: `1`. */
    zoomFactor?: number;
    /** Text sent to servers as the browser name. null: the default of the runtime. */
    userAgent?: string | null;
    /** Underline misspelled words in text fields. Default: `false`. */
    spellcheck?: boolean;
    /** Slow the page down when the window is hidden. Default: `true`. */
    backgroundThrottling?: boolean;
    /** A link to another site opens in the system browser, not in the app window. Default: `true`. */
    openExternalLinksInBrowser?: boolean;
    /** Origins (like "https://login.acme.com") the window may go to besides the app itself. Everything else is blocked. */
    allowedNavigation?: Array<string>;
  };
  /** What the page may do. The defaults are the safe ones. */
  security?: {
    /** The Content-Security-Policy of the pages, for example "default-src 'self'". null: none is added. */
    csp?: string | null;
    /** Pages cannot open new windows. Default: `true`. */
    blockNewWindows?: boolean;
    /** Keep the page and the preload script in separate JavaScript worlds. Default: `true`. */
    contextIsolation?: boolean;
    /** Run the page in the operating system sandbox. Default: `true`. */
    sandbox?: boolean;
    /** Give the page access to Node.js. Leave it false: any script on the page could then run programs on the computer. Default: `false`. */
    nodeIntegration?: boolean;
    /** Keep the same-origin policy of the browser. Default: `true`. */
    webSecurity?: boolean;
    /** Let an https page load http scripts. Default: `false`. */
    allowRunningInsecureContent?: boolean;
    /** Browser permissions the page may get, for example "geolocation", "media", "clipboard-read". Notifications are allowed by notifications.enabled. */
    permissions?: Array<string>;
  };
  /** The system tray icon. */
  tray?: {
    /** Show an icon in the system tray (the menu bar on macOS). Default: `false`. */
    enabled?: boolean;
    /** A PNG file, relative to the project. null: the app icon. */
    icon?: string | null;
    /** Text shown when the mouse rests on the icon. null: the app name. */
    tooltip?: string | null;
    /** Closing the window hides it; the app keeps running in the tray. Choose "Quit" in the tray menu to leave. Default: `false`. */
    closeToTray?: boolean;
    /** What a click on the tray icon does. Default: `"toggle"`. */
    clickAction?: "toggle" | "show" | "none";
    /** The entries of the tray menu. Default: `[{"label":"Show","action":"show"},{"type":"separator"},{"label":"Quit","action":"quit"}]`. */
    menu?: Array<ElectronTrayMenuEntry>;
  };
  /** System notifications. */
  notifications?: {
    /** The page may show system notifications. In Tauri this adds the notification plugin (a crate and a permission). Default: `false`. */
    enabled?: boolean;
  };
  /** Updates. */
  updates?: {
    /** Look for new versions of the app. Default: `false`. */
    enabled?: boolean;
    /** The https address of the folder that holds the update files (Electron: latest.yml and the installers; Tauri: the update JSON). */
    url?: string | null;
    /** The release channel, like "latest" or "beta". Default: `"latest"`. */
    channel?: string;
    /** Look for an update each time the app starts (installed app only). Default: `true`. */
    checkOnStart?: boolean;
    /** Download an update without asking. Default: `false`. */
    autoDownload?: boolean;
  };
  /** How the installers are made. */
  packaging?: {
    /** The app icon, a square PNG (1024×1024 is best), relative to the project. Default: `"build/icon.png"`. */
    icon?: string;
    /** The category in app stores and menus, like "public.app-category.productivity" (macOS) or "Utility" (Linux). null: the default of the runtime. */
    category?: string | null;
    /** Electron installers (electron-builder). */
    electron?: {
      /** The folder the installers are written to. Default: `"dist-electron"`. */
      outputDir?: string;
      /** Installers to make for macOS. Default: `["dmg","zip"]`. */
      mac?: Array<"dmg" | "zip" | "pkg" | "dir">;
      /** Installers to make for Windows. Default: `["nsis","portable"]`. */
      win?: Array<"nsis" | "portable" | "msi" | "zip" | "dir">;
      /** Installers to make for Linux. Default: `["AppImage","deb","rpm"]`. */
      linux?: Array<"AppImage" | "deb" | "rpm" | "tar.gz" | "snap" | "dir">;
      /** Pack the app files into one archive. Default: `true`. */
      asar?: boolean;
      /** How much the installer is compressed. Default: `"normal"`. */
      compression?: "store" | "normal" | "maximum";
      /** The files that go into the app (build/icon.png and the tray icon are added). Default: `["dist/** /*","electron/** /*","package.json"]`. */
      files?: Array<string>;
      /** Extra files copied next to the app, relative to the project. */
      extraResources?: Array<string>;
    };
  };
  /** A way out for options this file does not know. Values here are merged into the generated native configuration last. */
  advanced?: {
    /** Merged into the electron-builder configuration. Use it for options this file does not have. Default: `{}`. */
    builder?: Record<string, unknown>;
  };
}

/** The file may export the settings, or a function that returns them. */
export type ElectronConfigExport = ElectronConfig | ((context: DesktopConfigContext) => ElectronConfig | Promise<ElectronConfig>);

/** Gives the editor autocomplete and type checks; returns what it receives. */
export function defineElectronConfig(config: ElectronConfigExport): ElectronConfigExport;

/** One menu entry. */
export interface TauriMenuTemplateEntry {
  /** The text of the entry. Required for entries without a role. */
  label?: string | null;
  /** A name for the entry. The page is told this name when the entry is clicked (kreftDesktop.onMenu). */
  id?: string | null;
  /** A ready-made entry of the system (copy, paste, quit…). */
  role?: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll" | "minimize" | "close" | "quit" | "fullscreen" | "about" | null;
  /** Use "separator" for a line between entries. */
  type?: "separator" | null;
  /** A keyboard shortcut, for example "CmdOrCtrl+K". */
  accelerator?: string | null;
  /** Entries inside this entry. */
  submenu?: Array<TauriMenuTemplateEntry> | null;
}

/** One entry of the tray menu. */
export interface TauriTrayMenuEntry {
  /** The text of the entry. */
  label?: string | null;
  /** A name for the entry. The page is told this name when an "emit" entry is clicked. */
  id?: string | null;
  /** What the entry does. "emit" tells the page its id. Default: `"emit"`. */
  action?: "show" | "hide" | "toggle" | "quit" | "emit";
  /** Use "separator" for a line between entries. */
  type?: "separator" | null;
}

/** The settings of an Tauri app (config/tauri.config.js). Every option is optional: what you leave out keeps its default. */
export interface TauriConfig {
  /** Name, id and version of the app. */
  app?: {
    /** The name people see. Default: the "productName" or "name" in package.json. */
    name?: string | null;
    /** The reverse-domain id, for example "com.acme.notes". Default: com.kreftjs. followed by the lowercase name. */
    id?: string | null;
    /** The version number. Default: the "version" in package.json. */
    version?: string | null;
    /** A one-line description. Default: the "description" in package.json. */
    description?: string | null;
    /** Who makes the app. Default: the "author" in package.json. */
    author?: string | null;
    /** The web address of the app. Default: the "homepage" in package.json. */
    homepage?: string | null;
    /** The copyright line shown in the installer and the About box. */
    copyright?: string | null;
  };
  /** How the main window looks and behaves. */
  window?: {
    /** The window title. Default: the app name. */
    title?: string | null;
    /** Width in pixels. Default: `1200`. */
    width?: number;
    /** Height in pixels. Default: `800`. */
    height?: number;
    /** The window cannot be made narrower than this. Default: `800`. */
    minWidth?: number;
    /** The window cannot be made lower than this. Default: `600`. */
    minHeight?: number;
    /** The window cannot be made wider than this. null: no limit. */
    maxWidth?: number | null;
    /** The window cannot be made higher than this. null: no limit. */
    maxHeight?: number | null;
    /** Distance from the left edge of the screen. null: the system chooses (or the window is centered). */
    x?: number | null;
    /** Distance from the top edge of the screen. null: the system chooses (or the window is centered). */
    y?: number | null;
    /** Open the window in the middle of the screen (ignored when x and y are set). Default: `true`. */
    center?: boolean;
    /** Let people resize the window. Default: `true`. */
    resizable?: boolean;
    /** Open the window in full screen. Default: `false`. */
    fullscreen?: boolean;
    /** Open the window maximized. Default: `false`. */
    maximized?: boolean;
    /** Keep the window above all others. Default: `false`. */
    alwaysOnTop?: boolean;
    /** Draw the system title bar and border. false: a window without them. Default: `true`. */
    frame?: boolean;
    /** A see-through window background (the page must draw its own background). Default: `false`. */
    transparent?: boolean;
    /** The colour shown before the page has drawn, as #rrggbb. Default: `"#ffffff"`. */
    backgroundColor?: string;
    /** The look of the window frame and the system dialogs. Default: `"system"`. */
    theme?: "system" | "light" | "dark";
    /** Keep the window out of the taskbar or dock. Default: `false`. */
    skipTaskbar?: boolean;
  };
  /** The native application menu. */
  menu?: {
    /** "hidden": no menu bar. "visible": the menu bar. "auto": hidden until Alt is pressed (Electron on Windows and Linux only). On macOS the system menu bar always exists, so "hidden" keeps a minimal app and Edit menu: without them, copy and paste shortcuts stop working. Default: `"hidden"`. */
    visibility?: "hidden" | "visible";
    /** Your own menu, as a list of top-level entries with a submenu. null: the default menu of the runtime. */
    template?: Array<TauriMenuTemplateEntry> | null;
  };
  /** The right-click menu. */
  contextMenu?: {
    /** Allow the right-click menu. false: right-click does nothing. Default: `true`. */
    enabled?: boolean;
  };
  /** The developer tools. */
  devtools?: {
    /** Allow DevTools while you work (kreft electron:dev, kreft tauri:dev). Default: `true`. */
    development?: boolean;
    /** Allow DevTools in the installed app. Keep it false unless you need to debug a release. Default: `false`. */
    production?: boolean;
    /** Open DevTools by themselves when the window opens (only where they are allowed). Default: `false`. */
    openOnStart?: boolean;
    /** Where DevTools open. Tauri can only open them in their own window. Default: `"detach"`. */
    mode?: "detach";
    /** F12 and Ctrl+Shift+I (Cmd+Option+I on macOS) toggle DevTools where they are allowed. Default: `true`. */
    shortcut?: boolean;
  };
  /** The web page inside the window. */
  webview?: {
    /** The page zoom. 1 is 100 %. Default: `1`. */
    zoomFactor?: number;
    /** Text sent to servers as the browser name. null: the default of the runtime. */
    userAgent?: string | null;
    /** A link to another site opens in the system browser, not in the app window. Default: `true`. */
    openExternalLinksInBrowser?: boolean;
    /** Origins (like "https://login.acme.com") the window may go to besides the app itself. Everything else is blocked. */
    allowedNavigation?: Array<string>;
  };
  /** What the page may do. The defaults are the safe ones. */
  security?: {
    /** The Content-Security-Policy of the pages, for example "default-src 'self'". null: none is added. */
    csp?: string | null;
    /** Pages cannot open new windows. Default: `true`. */
    blockNewWindows?: boolean;
    /** Extra Tauri permissions for the window, like "dialog:default" (the plugin must also be added in src-tauri/Cargo.toml). "core:default" is always there. */
    capabilities?: Array<string>;
    /** Put the Tauri API on window.__TAURI__. Default: `true`. */
    globalTauri?: boolean;
  };
  /** The system tray icon. */
  tray?: {
    /** Show an icon in the system tray (the menu bar on macOS). Default: `false`. */
    enabled?: boolean;
    /** A PNG file, relative to the project. null: the app icon. */
    icon?: string | null;
    /** Text shown when the mouse rests on the icon. null: the app name. */
    tooltip?: string | null;
    /** Closing the window hides it; the app keeps running in the tray. Choose "Quit" in the tray menu to leave. Default: `false`. */
    closeToTray?: boolean;
    /** What a click on the tray icon does. Default: `"toggle"`. */
    clickAction?: "toggle" | "show" | "none";
    /** The entries of the tray menu. Default: `[{"label":"Show","action":"show"},{"type":"separator"},{"label":"Quit","action":"quit"}]`. */
    menu?: Array<TauriTrayMenuEntry>;
  };
  /** System notifications. */
  notifications?: {
    /** The page may show system notifications. In Tauri this adds the notification plugin (a crate and a permission). Default: `false`. */
    enabled?: boolean;
  };
  /** Updates. */
  updates?: {
    /** Look for new versions of the app. Default: `false`. */
    enabled?: boolean;
    /** The https address of the folder that holds the update files (Electron: latest.yml and the installers; Tauri: the update JSON). */
    url?: string | null;
    /** The release channel, like "latest" or "beta". Default: `"latest"`. */
    channel?: string;
    /** Look for an update each time the app starts (installed app only). Default: `true`. */
    checkOnStart?: boolean;
    /** The public key that update files are signed with (made by "npx tauri signer generate"). */
    pubkey?: string | null;
  };
  /** How the installers are made. */
  packaging?: {
    /** The app icon, a square PNG (1024×1024 is best), relative to the project. Default: `"build/icon.png"`. */
    icon?: string;
    /** The category in app stores and menus, like "public.app-category.productivity" (macOS) or "Utility" (Linux). null: the default of the runtime. */
    category?: string | null;
    /** Tauri installers. */
    tauri?: {
      /** Installers to make. null: all that fit the system you build on. */
      targets?: Array<"app" | "dmg" | "nsis" | "msi" | "deb" | "rpm" | "appimage"> | null;
      /** Extra files that go into the app, relative to src-tauri/. */
      resources?: Array<string>;
      /** The oldest macOS the app runs on. Default: `"10.15"`. */
      macMinimumSystemVersion?: string;
      /** How the installer gets WebView2 on Windows. Default: `"downloadBootstrapper"`. */
      windowsWebviewInstall?: "skip" | "downloadBootstrapper" | "embedBootstrapper" | "offlineInstaller";
    };
  };
  /** A way out for options this file does not know. Values here are merged into the generated native configuration last. */
  advanced?: {
    /** Merged into src-tauri/tauri.conf.json. Use it for options this file does not have. Default: `{}`. */
    tauriConf?: Record<string, unknown>;
  };
}

/** The file may export the settings, or a function that returns them. */
export type TauriConfigExport = TauriConfig | ((context: DesktopConfigContext) => TauriConfig | Promise<TauriConfig>);

/** Gives the editor autocomplete and type checks; returns what it receives. */
export function defineTauriConfig(config: TauriConfigExport): TauriConfigExport;

/** The "desktop" key of kreftjs.config.json: settings for both runtimes. An option one runtime lacks is ignored there. */
export type SharedDesktopConfig = ElectronConfig & TauriConfig;
