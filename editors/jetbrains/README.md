# Kreft for JetBrains IDEs

[Kreft](https://kreftjs.com) · [Documentation](https://kreftjs.com/docs) · [Source](https://github.com/gadhyare/kreftjs)

For WebStorm, PhpStorm, IntelliJ IDEA, PyCharm, RubyMine, GoLand, Rider and Android Studio (2022.3 or newer).

- **Colors and completion**: `.kreft` (and legacy `.kreftjs`) files open as HTML, so the `<view>` markup, the CSS in `<style>` and the JavaScript in `<script>` are highlighted and completed.
- **Emmet**: `ul>li.item*3` then Tab in `<view>`; `m10`, `df`, `bgc` then Tab in `<style>`.
- **Live templates**: `kreftjs`, `state`, `action`, `for`, `kreft-wait`, ... then Tab (Settings > Editor > Live Templates > Kreft).

## Install

From a Kreft project:

```bash
kreft editor jetbrains
```

It builds the plugin, puts it in every JetBrains IDE it finds, and prints where the `.jar` is. Restart the IDE.

By hand: build the `.jar`, then *Settings > Plugins > ⚙ > Install Plugin from Disk...* and pick it.

```bash
node editors/jetbrains/build.js
```

As a file to share: `kreft editor jetbrains --download` writes the `.jar` in the current folder.

## How it works

The plugin has no code. `plugin.xml` adds the two extensions to the IDE's own HTML file type, and `build.js` turns the
VS Code snippets (`editors/vscode/snippets/kreftjs.json`) into live templates, so the two editors stay the same.

## Limits

- Emmet for CSS and the JavaScript colors need an IDE with web support (WebStorm, PhpStorm, IDEA Ultimate, PyCharm Professional...). The free editions do HTML and Emmet for HTML only.
- Kreft-only syntax (`state x = 0`, `{for item in items}`) is shown as plain text: it gets no colors of its own and no error marks.
- Emmet must be on: *Settings > Editor > Emmet* (it is by default).
