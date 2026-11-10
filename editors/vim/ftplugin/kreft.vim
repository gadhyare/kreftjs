" Kreft component files: the HTML settings, two spaces, and Emmet.

if exists('b:did_ftplugin')
  finish
endif

runtime! ftplugin/html.vim ftplugin/html_*.vim ftplugin/html/*.vim
let b:did_ftplugin = 1

setlocal shiftwidth=2 softtabstop=2 expandtab
setlocal commentstring=<!--\ %s\ -->

" emmet-vim: .kreft files expand like HTML; inside <style> it switches to CSS by itself.
if !exists('g:user_emmet_settings')
  let g:user_emmet_settings = {}
endif
if !has_key(g:user_emmet_settings, 'kreft')
  let g:user_emmet_settings.kreft = {'extends': 'html'}
endif
if exists(':EmmetInstall') == 2
  silent! EmmetInstall
endif
