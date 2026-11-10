# Kreft for VS Code

Language support for [Kreft](https://github.com/gadhyare/kreftjs) `.kreft` component files.

## Features

- **Syntax colors** for `<view>`, `<style>` and `<script>` blocks, with HTML, CSS and JavaScript embedded.
- **Formatting**: format a `.kreft` file with *Format Document* (Shift+Alt+F).
- **Snippets**: type `kreftjs` in an empty `.kreft` file for a starter component, or `state`, `action`, `for`, `kreft-wait` and more.
- **Emmet**: `ul>li.item*3` then Tab in `<view>`, and CSS abbreviations (`m10`, `df`, `bgc`) in `<style>`.
- **Editing helpers**: bracket matching, auto-closing pairs, line comments (Ctrl+/) and folding for `<view>` / `<style>`.

Files with the older `.kreftjs` extension get the same support.

## Install

Search for **Kreft** in the Extensions view, or from a Kreft project run:

```bash
kreftjs vscode
```

Then restart VS Code.

Or get the extension as a file and install it from *Extensions > ... > Install from VSIX...*:

```bash
kreft editor vscode --download
```

The same extension works in editors built on VS Code: **Antigravity**, Cursor, Windsurf, VSCodium, Kiro and Trae.
`kreft vscode` installs it in each one it finds on your computer.

## Emmet

Emmet is on for `.kreft` files as soon as the extension is installed. If you already have your own
`emmet.includeLanguages` setting, the extension asks once and adds this line to it:

```json
"emmet.includeLanguages": { "kreftjs": "html" }
```

To expand with Tab, also set `"emmet.triggerExpansionOnTab": true`.

## License

Elastic License 2.0. See [LICENSE](LICENSE).
