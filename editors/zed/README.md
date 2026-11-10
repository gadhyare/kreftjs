# Kreft for Zed

[Kreft](https://kreftjs.com) · [Documentation](https://kreftjs.com/docs) · [Source](https://github.com/gadhyare/kreftjs)

Highlighting for `.kreft` (and legacy `.kreftjs`) component files: markup, `k-*` / `@event` / `:bind`
attributes, and the embedded `<script>` (JavaScript) and `<style>` (CSS) blocks. Emmet is built in.

## Install (dev extension)

1. Open Zed, run **zed: install dev extension** from the command palette.
2. Select this folder (`editors/zed`).

Zed downloads the tree-sitter HTML grammar and compiles it, so Rust (via `rustup`) must be installed.

As a file: `kreft editor zed --download` writes a zip; unzip it and pick the `kreft-zed` folder.

## Emmet

The extension starts the Emmet language server for `.kreft` files by itself (Zed downloads it with npm the first
time, so the first file needs the internet). You do not need the separate Emmet extension or any setting.

- in `<view>`: type `ul>li.item*3` and accept the completion
- in `<style>`: CSS abbreviations such as `m10`, `df`, `bgc`

To turn it off, add this to Zed's `settings.json`:

```json
"languages": { "Kreft": { "language_servers": ["!kreft-emmet"] } }
```

## Limits

This reuses the HTML grammar. Kreft-only syntax (`state x = 0`, `action f() {}`, `{expr}` text
interpolation) is highlighted as far as JavaScript/HTML allow; a dedicated tree-sitter-kreft
grammar would be needed for full coverage.
