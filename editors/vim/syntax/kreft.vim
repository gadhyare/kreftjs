" Vim syntax file
" Language: Kreft (.kreft component files)
" A .kreft file is HTML (<view>, <style>, <script>) with the component's script at the top.

if exists('b:current_syntax')
  finish
endif

runtime! syntax/html.vim
unlet! b:current_syntax

" state count = 0, action add() { }, layout app ...
syntax match kreftKeyword /^\s*\zs\%(layout\|prop\|state\|saved\|derive\|action\|load\|watch\|when\|on\|event\|use\|share\|receive\)\>/ containedin=javaScript
" k-if, @click, :value
syntax match kreftDirective /\<k-[a-z-]\+\|@[a-z][a-zA-Z0-9.-]*\|:[a-z][a-zA-Z0-9-]*/ contained containedin=htmlTag
" {for item in items} {empty} {/for}
syntax match kreftBlock /{\/\?\%(for\|empty\)\>[^}]*}/ containedin=htmlTop

highlight default link kreftKeyword Keyword
highlight default link kreftDirective Special
highlight default link kreftBlock PreProc

let b:current_syntax = 'kreft'
