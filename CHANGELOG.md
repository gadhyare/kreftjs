# Changelog

## 0.0.39-beta

- Editors: Emmet in `.kreft` files (`ul>li*3` in `<view>`, `m10` in `<style>`) in VS Code, Antigravity, Cursor, Sublime Text and Zed, and two new plugins, for JetBrains IDEs (WebStorm, PhpStorm, IDEA...) and for Vim / Neovim. `kreft editor <name>` installs one: `vscode`, `sublime`, `zed`, `jetbrains`, `vim`. `kreft editor <name> --download` writes it as one file instead (`.vsix`, `.sublime-package`, `.jar`, `.zip`). The manual has a part for each editor: Editor plugins.
- Release builds: the server address built into an app is the one you decided (a stale PUBLIC_API_URL in the terminal can no longer replace it), and the finished build is checked before anything is signed.
- Website builds never copy signing keys, native projects, release files, security reports or the Capacitor config, also in projects with index.html at the top.
- Package security judges a shared dependency whose version the new package changes, and cancelling or interrupting an install leaves no stage folders behind.
- `kreft electron:build` keeps every electron-builder option with its value (`--publish never`, `--win nsis`, `--mac dmg zip`).
- Tauri on Windows: `tauri dev` passes its settings as a file. The Tauri window refuses to navigate outside the app and `webview.allowedNavigation`.
- Electron grants a permission only to the app's own pages (a frame of unknown address gets none) and refuses redirects of the window to other sites. `kreft add electron` allows the installed Electron's install script in `allowScripts` (an exact version, as npm requires) and `electron:dev` downloads the app if npm did not.
- Checked installs list the packages whose install scripts were not run. A cut-off install restores the old `node_modules`, and the reports folder cannot lead outside the project through a link.
- Android releases: old build outputs are removed before Gradle runs, a missing `apksigner` is reported, and a keystore whose password cannot be saved is removed.
- `kreft electron:build` and `kreft tauri:build` note when `security.csp` is not set.
- Security (found by an outside review): MCP `query_database` asks SQLite itself what a query may read (credential tables are refused, credential columns read as NULL, however the SQL is written) and is turned off, with a message, where the engine gives no such protection (MySQL, PostgreSQL, older Node.js) unless `MCP_DATABASE_RESTRICTED=true` says the connection is limited; a percent sign in a database API address no longer stops the server; `cleanHtml` answers unfinished tags at once (its work grew exponentially); a form that another web site (or another port of the same host) submits to a login or any backend route is refused (login CSRF; `KREFT_ALLOWED_ORIGINS` lists the allowed senders); `kreft add electron|tauri` resolves the whole manifest (all dependency sections) without downloading anything, refuses disallowed packages (by name or version) and addresses that are not on the registry in use, then installs exactly that checked lock file with `npm ci`.
- Fixes: `kreft build --out` refuses a folder that would contain the app, the backend or the project (it was emptied first); the Vite plugin writes valid module code; `harmony:build --api-url` is not overridden by a PUBLIC_API_URL left in the terminal; `watch` of an object reports changes made inside it and a stopped watcher runs its cleanup; the VS Code formatter keeps the spaces inside `<pre>`, `<textarea>` and multi-line template literals; a deleted controller no longer takes the whole API down, and `{ default: Controller }` exports work. `test/backend.test.js` is part of `npm test`.

## 0.0.37-beta

- Show a colored package status report and installation choices without dependency logs in normal CLI output.
- Keep full security findings in reports and verbose output.
- Preserve project policy enforcement and saved allow/deny choices.

## 0.0.36-beta

- Add staged npm package resolution, dependency policy checks, integrity verification and JSON/text security reports.
- Show a numbered installation menu after security checks, with allow once, disallow once, remember an allowed version and deny a package.
- Add project allow/deny rule management and bounded parallel metadata checks with compact progress output.
- Update web documentation and English and Arabic books with package security guidance.
- Include the current desktop, mobile, HarmonyOS and application release tooling in the package.
- Configure public npm publishing under the beta tag and declare Node.js 22.5 or newer.

Package security limitations and supported project types are documented in docs/package-security.md.
