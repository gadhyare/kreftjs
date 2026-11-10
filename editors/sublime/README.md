# Kreft for Sublime Text

[Kreft](https://kreftjs.com) · [Documentation](https://kreftjs.com/docs) · [Source](https://github.com/gadhyare/kreftjs)

Syntax for `.kreft` / `.kreftjs` files (extends Sublime's built-in HTML syntax, so `<script>` is JavaScript and `<style>` is CSS), comment toggling, snippets, and Emmet.

## Install

From a Kreft project:

```bash
kreft editor sublime
```

Or by hand: copy this folder to `Packages/Kreft` (Preferences > Browse Packages...). Then reopen a `.kreft` file.

As a file: `kreft editor sublime --download` writes `Kreft.sublime-package`; put it in `Installed Packages` (do not rename it).

## Emmet

Install the **Emmet** package (Command Palette > *Package Control: Install Package* > `Emmet`). Nothing else to set:
the Kreft syntax uses the scopes Emmet already looks for.

| Where | Type | Tab gives |
| --- | --- | --- |
| `<view>` | `ul>li.item*3` | the HTML list |
| `<style>` | `m10`, `df`, `bgc` | `margin: 10px;`, `display: flex;`, `background-color: #fff;` |
| the script at the top | `<div.box` | JSX-style markup (Emmet asks for the `<` there) |

Limit: Kreft-only keywords (`state`, `action`, ...) are colored only at the start of a line.
