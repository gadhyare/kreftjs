// kreftjs/desktop: helpers for config/electron.config.js and config/tauri.config.js.
//   const { defineElectronConfig } = require('kreftjs/desktop')
//   module.exports = defineElectronConfig({ window: { width: 1000 } })
// They return what they receive. They only give the editor something to autocomplete (see desktop.d.ts).
exports.defineElectronConfig = (config) => config;
exports.defineTauriConfig = (config) => config;
