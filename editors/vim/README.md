# Kreft for Vim and Neovim

[Kreft](https://kreftjs.com) · [Documentation](https://kreftjs.com/docs) · [Source](https://github.com/gadhyare/kreftjs)

File type, colors (HTML with CSS and JavaScript, plus the Kreft keywords and `k-*` / `@event` attributes), comments, and Emmet for `.kreft` / `.kreftjs` files.

## Install

From a Kreft project:

```bash
kreft editor vim
```

It copies this folder to `pack/kreft/start/kreft` in your Vim and Neovim folders. By hand, copy it there yourself, or give the path `editors/vim` to your plugin manager.

As a file: `kreft editor vim --download` writes `kreft-vim.zip`; unzip it into `pack/kreft/start/`.

## Emmet

**emmet-vim** ([mattn/emmet-vim](https://github.com/mattn/emmet-vim)): install it and nothing else. In a `.kreft` file type `ul>li.item*3` and press `<C-y>,`. Inside `<style>` the same key expands CSS (`m10`, `df`).

**Neovim with the Emmet language server** (`npm i -g @olrtg/emmet-language-server`), Neovim 0.11 or newer:

```lua
vim.lsp.config('emmet_language_server', {
  cmd = { 'emmet-language-server', '--stdio' },
  filetypes = { 'html', 'css', 'kreft' },
  init_options = { includeLanguages = { kreft = 'html' } },
})
vim.lsp.enable('emmet_language_server')
```

Tree-sitter colors in Neovim (instead of the Vim syntax file): `vim.treesitter.language.register('html', 'kreft')`.
