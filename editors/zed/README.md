# Kreft for Zed

Highlighting for `.kreft` (and legacy `.kreftjs`) component files: markup, `k-*` / `@event` / `:bind`
attributes, and the embedded `<script>` (JavaScript) and `<style>` (CSS) blocks.

## Install (dev extension)

1. Open Zed, run **zed: install dev extension** from the command palette.
2. Select this folder (`editors/zed`).

Zed downloads the tree-sitter HTML grammar and compiles it, so Rust (via `rustup`) must be installed.

## Limits

This reuses the HTML grammar. Kreft-only syntax (`state x = 0`, `action f() {}`, `{expr}` text
interpolation) is highlighted as far as JavaScript/HTML allow; a dedicated tree-sitter-kreft
grammar would be needed for full coverage.
