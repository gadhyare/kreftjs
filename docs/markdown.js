// A small Markdown reader for the documentation page: headings, paragraphs, lists, tables,
// code blocks, quotes, links, **bold**, *italic* and `code`. Everything is escaped first,
// so a .md file can't put its own scripts on the page.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slug(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*]/g, '').trim()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '').replace(/\s/g, '-');
}

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s)
    .replace(/&lt;kbd&gt;(.*?)&lt;\/kbd&gt;/g, '<kbd>$1</kbd>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      // only safe URLs: http/https, page anchors, or safe relative paths (no protocol-relative // or javascript:)
      let safe = '#';
      if (/^https?:\/\/[^\s"'<>]+$/i.test(href)) safe = href;
      else if (/^#[a-z0-9_\u0080-\uffff-]+$/i.test(href)) safe = href;
      else if (/^(?!\/\/)(?:\.{0,2}\/)?[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*(?:#[a-z0-9_\u0080-\uffff-]+)?$/i.test(href)) safe = href;
      return `<a href="${esc(safe)}"${/^https?:/i.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

export function markdown(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [], toc = [], sections = [], parts = [], usedIds = new Map();
  let currentPart = null;
  let i = 0;
  let currentSection = null;
  let currentH2Id = null;
  let currentH2Title = null;
  let totalWords = 0;

  const addTextToCurrent = (txt) => {
    if (!txt) return;
    const clean = txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    totalWords += clean.split(/\s+/).length;
    if (currentSection) {
      if (currentSection.content.length < 1500) {
        currentSection.content += (currentSection.content ? ' ' : '') + clean;
      }
    }
  };

  const isBlockStart = (l) => /^(#{1,6}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\||---\s*$|<\/?div\b)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || /^<\/?div\b[^>]*>\s*$/.test(line.trim())) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      const level = m[1].length, text = m[2].replace(/^‏/, '');
      let id = slug(text);
      // the same heading text twice (two "Example" sections) must not share an id
      const seen = usedIds.get(id) || 0;
      usedIds.set(id, seen + 1);
      if (seen) id = `${id}-${seen + 1}`;
      const cleanTitle = text.replace(/[`*]/g, '').trim();
      const item = {
        level,
        id,
        text: cleanTitle,
        title: cleanTitle,
        parentId: level === 3 && currentH2Id ? currentH2Id : null,
        parentTitle: level === 3 && currentH2Title ? currentH2Title : null,
        group: currentPart ? currentPart.title : '',
        content: '',
      };
      if (level === 1) {
        // a "part" of the manual (Start here, Backend…): it groups the chapters that follow
        currentPart = { id, title: cleanTitle, items: [] };
        parts.push(currentPart);
      }
      if (level === 2 || level === 3) {
        toc.push(item);
        sections.push(item);
        if (level === 2 && currentPart) currentPart.items.push(item);
        currentSection = item;
        if (level === 2) {
          currentH2Id = id;
          currentH2Title = cleanTitle;
        }
      }
      out.push(`<h${level} id="${esc(id)}" class="doc-heading doc-h${level}" data-id="${esc(id)}"><a href="#${esc(id)}" class="heading-anchor" aria-label="Link to section">#</a><span class="heading-title">${inline(text)}</span></h${level}>`);
      i++; continue;
    }
    if ((m = line.match(/^```(\w*)/))) {
      const lang = m[1], body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      const codeStr = body.join('\n');
      addTextToCurrent(codeStr);
      out.push(
        `<div class="code-box" data-lang="${esc(lang || 'code')}">` +
        `<div class="code-head"><span class="code-lang">${esc((lang || 'code').toUpperCase())}</span><button type="button" class="copy-btn" data-action="copy" aria-label="Copy code block">Copy</button></div>` +
        `<pre dir="ltr"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(codeStr)}</code></pre>` +
        `</div>`
      );
      continue;
    }
    if (/^---\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, '|')));
      const head = cells(rows[0]);
      const body = rows.slice(/^\|[\s:|-]+\|?\s*$/.test(rows[1] || '') ? 2 : 1).map(cells);
      addTextToCurrent(head.join(' '));
      out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^>/.test(line)) {
      const body = [];
      while (i < lines.length && /^>/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      const quoteText = body.join(' ');
      addTextToCurrent(quoteText);
      // > [!NOTE] / [!TIP] / [!WARNING] / [!DANGER] / [!IMPORTANT] makes a labelled callout box
      const call = quoteText.match(/^\[!(NOTE|TIP|WARNING|DANGER|IMPORTANT)\]\s*(.*)$/i);
      if (call) {
        const kind = call[1].toLowerCase();
        out.push(`<aside class="callout callout-${kind}" role="note"><p class="callout-title">${kind.charAt(0).toUpperCase() + kind.slice(1)}</p><p>${inline(call[2])}</p></aside>`);
      } else out.push(`<blockquote>${inline(quoteText)}</blockquote>`);
      continue;
    }
    if ((m = line.match(/^(\s*)([-*]|\d+\.)\s+/))) {
      const ordered = /\d/.test(m[2]);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '');
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) && !/^\s*```/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(inline(item));
        addTextToCurrent(item);
        // more of the same item, indented under it (after blank lines too): text or a code block
        for (;;) {
          let j = i;
          while (j < lines.length && !lines[j].trim()) j++;
          const next = lines[j];
          if (next === undefined || !/^\s{2,}\S/.test(next) || /^\s*([-*]|\d+\.)\s+/.test(next)) break;
          i = j;
          if (/^\s+```/.test(next)) {
            const indent = next.match(/^\s*/)[0].length, body = [];
            i++;
            while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++].slice(indent));
            i++;
            const snippet = body.join('\n');
            addTextToCurrent(snippet);
            items[items.length - 1] += `<pre dir="ltr"><code>${esc(snippet)}</code></pre>`;
          } else {
            const para = [];
            while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) && !/^\s+```/.test(lines[i])) para.push(lines[i++].trim());
            const textPara = para.join(' ');
            addTextToCurrent(textPara);
            items[items.length - 1] += `<p>${inline(textPara)}</p>`;
          }
        }
        while (i < lines.length && !lines[i].trim() && /^\s*([-*]|\d+\.)\s+/.test(lines[i + 1] || '')) i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${x}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++]);
    const pText = para.join(' ');
    addTextToCurrent(pText);
    out.push(`<p>${inline(pText)}</p>`);
  }
  return {
    html: out.join('\n'),
    toc,
    parts,
    sections,
    stats: {
      words: totalWords,
      readTimeMinutes: Math.max(1, Math.ceil(totalWords / 200)),
      totalSections: toc.length,
    },
  };
}
