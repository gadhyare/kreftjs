let vscode;
try {
  vscode = require('vscode');
} catch {}

// Text that must keep its spaces exactly: what is inside <pre> and <textarea> in the view, and a template literal (`…`)
// that runs over several lines in the script or style. Those lines are copied as they are.
const countBackticks = (line) => (String(line).replace(/\\./g, '').match(/`/g) || []).length;
function rawStart(line, inView) {
  if (inView) {
    const found = [...String(line).matchAll(/<(pre|textarea)\b[^>]*>/gi)].pop();
    if (found && !new RegExp('</' + found[1] + '\\s*>', 'i').test(line.slice(found.index + found[0].length))) return { tag: found[1].toLowerCase() };
    return null;
  }
  return countBackticks(line) % 2 === 1 ? { tpl: true } : null;
}
function rawNext(raw, line) {
  if (raw.tag) return new RegExp('</' + raw.tag + '\\s*>', 'i').test(line) ? null : raw;
  return countBackticks(line) % 2 === 1 ? null : raw;
}

function formatKreft(text, options = {}) {
  const tabSize = options.tabSize || 2;
  const indentStr = options.insertSpaces !== false ? ' '.repeat(tabSize) : '\t';

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const result = [];

  let inView = false;
  let inStyle = false;
  let inScriptTag = false;
  let viewIndent = 0;
  let scriptBraceDepth = 0;
  let styleBraceDepth = 0;

  const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  let raw = null;   // inside text that keeps its spaces
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (raw) {
      result.push(rawLine);
      const was = raw;
      raw = rawNext(raw, rawLine);
      if (!raw && was.tag) viewIndent = Math.max(1, viewIndent - 1);   // the closing </pre> was not counted
      continue;
    }
    if (trimmed) raw = rawStart(rawLine, inView);   // from the next line on

    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      continue;
    }

    if (/^<view(\s[^>]*)?>/i.test(trimmed)) {
      inView = true;
      viewIndent = 1;
      result.push(trimmed);
      continue;
    }
    if (/^<\/view>/i.test(trimmed)) {
      inView = false;
      viewIndent = 0;
      result.push('</view>');
      continue;
    }
    if (/^<style(\s[^>]*)?>/i.test(trimmed)) {
      inStyle = true;
      styleBraceDepth = 0;
      result.push(trimmed);
      continue;
    }
    if (/^<\/style>/i.test(trimmed)) {
      inStyle = false;
      result.push('</style>');
      continue;
    }
    if (/^<script(\s[^>]*)?>/i.test(trimmed)) {
      inScriptTag = true;
      scriptBraceDepth = 0;
      result.push(trimmed);
      continue;
    }
    if (/^<\/script>/i.test(trimmed)) {
      inScriptTag = false;
      result.push('</script>');
      continue;
    }

    if (inView) {
      const startsWithCloseTag = /^<\/[A-Za-z0-9_-]+>/.test(trimmed);
      const startsWithCloseLoop = /^\{\/(?:for|if)\}/.test(trimmed);
      const startsWithEmpty = /^\{empty\}/.test(trimmed);

      if (startsWithCloseTag || startsWithCloseLoop || startsWithEmpty) {
        viewIndent = Math.max(1, viewIndent - 1);
      }

      result.push(indentStr.repeat(viewIndent) + trimmed);

      if (startsWithEmpty) {
        viewIndent++;
      } else {
        const tagRegex = /<([A-Za-z0-9_-]+)(?:\s[^>]*)?(\/?)>|<\/([A-Za-z0-9_-]+)>|\{(for\b[^}]*|\/for|empty)\}/gi;
        let openCount = 0;
        let closeCount = 0;

        const tagTokens = [...trimmed.matchAll(tagRegex)];
        for (const t of tagTokens) {
          if (t[0].startsWith('</')) {
            closeCount++;
          } else if (t[4] === '/for') {
            closeCount++;
          } else if (t[4] === 'empty') {
            // no net change
          } else if (t[4] && t[4].startsWith('for')) {
            openCount++;
          } else if (t[1]) {
            const tagName = t[1].toLowerCase();
            const isSelfClosing = t[2] === '/' || VOID_TAGS.has(tagName);
            if (!isSelfClosing) openCount++;
          }
        }

        const netChange = openCount - closeCount;
        if (!startsWithCloseTag && !startsWithCloseLoop) {
          viewIndent = Math.max(1, viewIndent + netChange);
        } else {
          viewIndent = Math.max(1, viewIndent + openCount);
        }
      }
      continue;
    }

    if (inStyle) {
      const startsWithClosingBrace = /^\}/.test(trimmed);
      if (startsWithClosingBrace) styleBraceDepth = Math.max(0, styleBraceDepth - 1);

      result.push(indentStr.repeat(styleBraceDepth) + trimmed);

      const openBraces = (trimmed.match(/\{/g) || []).length;
      const closeBraces = (trimmed.match(/\}/g) || []).length;
      if (!startsWithClosingBrace) {
        styleBraceDepth = Math.max(0, styleBraceDepth + (openBraces - closeBraces));
      } else {
        styleBraceDepth = Math.max(0, styleBraceDepth + openBraces);
      }
      continue;
    }

    // Top-level script section (outside view and style)
    const startsWithClosingBrace = /^[\}\]\)]/.test(trimmed);
    if (startsWithClosingBrace) {
      scriptBraceDepth = Math.max(0, scriptBraceDepth - 1);
    }

    let formattedLine = trimmed;
    // Normalize spacing on single-line declaration keywords
    const declMatch = trimmed.match(/^(state|prop|saved|derive|load|use|share)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/);
    if (declMatch) {
      formattedLine = `${declMatch[1]} ${declMatch[2]} = ${declMatch[3]}`;
    }

    // Format action/when/watch opening braces with consistent space before brace
    formattedLine = formattedLine.replace(/^(\s*action\s+[A-Za-z_$][\w$]*\s*(?:\([^)]*\))?)\s*\{/, '$1 {');
    formattedLine = formattedLine.replace(/^(\s*(?:when|watch|on\s+\w+)\s*[^{]*?)\s*\{/, '$1 {');

    result.push(indentStr.repeat(scriptBraceDepth) + formattedLine);

    const openBraces = (trimmed.match(/[\{\[\(]/g) || []).length;
    const closeBraces = (trimmed.match(/[\}\]\)]/g) || []).length;
    if (!startsWithClosingBrace) {
      scriptBraceDepth = Math.max(0, scriptBraceDepth + (openBraces - closeBraces));
    } else {
      scriptBraceDepth = Math.max(0, scriptBraceDepth + openBraces);
    }
  }

  while (result.length && result[result.length - 1] === '') result.pop();   // one newline at the end, not two
  return result.join('\n') + '\n';
}

function activate(context) {
  if (!vscode || !vscode.languages) return;

  const provider = vscode.languages.registerDocumentFormattingEditProvider('kreftjs', {
    provideDocumentFormattingEdits(document, options) {
      const text = document.getText();
      const formatted = formatKreft(text, options);
      if (formatted === text) return [];
      const firstLine = document.lineAt(0);
      const lastLine = document.lineAt(document.lineCount - 1);
      const fullRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
      return [vscode.TextEdit.replace(fullRange, formatted)];
    }
  });

  context.subscriptions.push(provider);
  offerEmmet(context);
}

/* Emmet: package.json maps kreftjs to html by default (configurationDefaults), so `ul>li*3` works in <view> and `m10` in
   <style>. A user who has their own "emmet.includeLanguages" replaces that default: ask once, then add kreftjs to theirs. */
function emmetIsOn(includeLanguages) {
  return Boolean(includeLanguages && typeof includeLanguages === 'object' && includeLanguages.kreftjs);
}
function withKreftEmmet(includeLanguages) {
  return { ...(includeLanguages && typeof includeLanguages === 'object' ? includeLanguages : {}), kreftjs: 'html' };
}
async function offerEmmet(context) {
  try {
    const config = vscode.workspace.getConfiguration('emmet');
    if (emmetIsOn(config.get('includeLanguages'))) return;
    if (context.globalState.get('kreft.emmetAsked')) return;
    await context.globalState.update('kreft.emmetAsked', true);
    const answer = await vscode.window.showInformationMessage('Turn on Emmet abbreviations in .kreft files?', 'Yes', 'No');
    if (answer !== 'Yes') return;
    const own = (config.inspect('includeLanguages') || {}).globalValue;
    await config.update('includeLanguages', withKreftEmmet(own), vscode.ConfigurationTarget.Global);
  } catch {}
}

function deactivate() {}

module.exports = { activate, deactivate, formatKreft, emmetIsOn, withKreftEmmet };
