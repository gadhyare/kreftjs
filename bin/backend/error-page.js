/*
 * Developer Error Details & Interactive Error Monitoring Page for Som.js
 * Renders an interactive, modern debug dashboard in development with code context,
 * stack trace frames, intelligent solution suggestions, request inspection, and environment telemetry.
 */
const fs = require('fs');
const path = require('path');

function parseStack(stack) {
  const lines = String(stack || '').split('\n').slice(1);
  const frames = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;
    const m = trimmed.match(/^at\s+(?:(async\s+)?([^\s(]+)\s+\((.+):(\d+):(\d+)\)|(.+):(\d+):(\d+))$/);
    if (m) {
      const isMethod = Boolean(m[3]);
      const file = isMethod ? m[3] : m[6];
      const lineNum = parseInt(isMethod ? m[4] : m[7], 10);
      const colNum = parseInt(isMethod ? m[5] : m[8], 10);
      const fn = isMethod ? (m[1] ? 'async ' : '') + m[2] : '<anonymous>';
      const isApp = !file.includes('node_modules') && !file.startsWith('node:') && !file.includes('internal/');
      frames.push({ fn, file, line: lineNum, col: colNum, isApp });
    } else {
      frames.push({ raw: trimmed, isApp: false });
    }
  }
  return frames;
}

function getCodeSnippet(filePath, targetLine, radius = 6) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const allLines = content.split(/\r?\n/);
    const start = Math.max(1, targetLine - radius);
    const end = Math.min(allLines.length, targetLine + radius);
    const snippet = [];
    for (let i = start; i <= end; i++) {
      snippet.push({
        num: i,
        code: allLines[i - 1] ?? '',
        isTarget: i === targetLine,
      });
    }
    return { start, end, lines: snippet };
  } catch (_) {
    return null;
  }
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function generateSmartSolution(err, topFrame) {
  const msg = String(err && err.message || err || '');
  const name = String(err && err.name || '');

  // 1. Method typo on models or objects
  const methodMatch = msg.match(/is not a function|Call to undefined method ([^\s(]+)::([^\s(]+)/i) || msg.match(/([a-zA-Z0-9_$]+)\.([a-zA-Z0-9_$]+) is not a function/);
  if (methodMatch) {
    const caller = methodMatch[1];
    const fnName = methodMatch[2] || caller;
    const commonMethods = ['query', 'find', 'where', 'get', 'first', 'create', 'update', 'delete', 'save', 'count', 'paginate', 'all', 'select'];
    const close = commonMethods.find(m => Math.abs(m.length - fnName.length) <= 2 && (fnName.includes(m) || m.includes(fnName) || levenshtein(m, fnName) <= 2));
    if (close) {
      return {
        title: 'Bad Method Call',
        message: `Did you mean <code>${escapeHtml(caller ? caller + '::' + close + '()' : '.' + close + '()')}</code> ?`
      };
    }
  }

  // 2. Reading property of undefined/null
  const undefMatch = msg.match(/Cannot read propert(?:y|ies) of (undefined|null) \(reading '([^']+)'\)/i);
  if (undefMatch) {
    const prop = undefMatch[2];
    return {
      title: 'Null Reference Protection',
      message: `The target object is <code>${undefMatch[1]}</code> when accessing <code>.${escapeHtml(prop)}</code>. Consider using optional chaining <code>?.${escapeHtml(prop)}</code> or verifying the object exists.`
    };
  }

  // 3. Variable not defined
  const refMatch = msg.match(/([a-zA-Z0-9_$]+) is not defined/i);
  if (refMatch) {
    const varName = refMatch[1];
    return {
      title: 'Undefined Identifier',
      message: `Variable <code>${escapeHtml(varName)}</code> is referenced but not declared. Check your imports, function parameters, or declare it.`
    };
  }

  // 4. Missing Database Table
  if (msg.includes('no such table') || msg.includes('does not exist')) {
    return {
      title: 'Missing Database Table',
      message: `A queried database table was not found. Run <code>som db migrate</code> to execute pending migrations.`
    };
  }

  // 5. Default contextual suggestion
  if (topFrame && topFrame.file) {
    return {
      title: 'Exception Recommendation',
      message: `Review line <strong>${topFrame.line}</strong> in <code>${escapeHtml(path.basename(topFrame.file))}</code> to verify input values and method invocations.`
    };
  }

  return {
    title: 'Debugging Tip',
    message: 'Inspect the stack trace frames below to isolate where the exception was triggered.'
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderErrorPage(err, req = null, { status = 500 } = {}) {
  const errName = err && err.name ? err.name : 'Error';
  const errMessage = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? err.stack : '';
  const frames = parseStack(stack);

  // Attach pre-parsed snippets for all frames
  for (const f of frames) {
    if (f.file && f.line) {
      f.snippet = getCodeSnippet(f.file, f.line);
    }
  }

  const topAppFrame = frames.find((f) => f.isApp && f.file) || frames.find((f) => f.file) || null;
  const initialSnippet = topAppFrame && topAppFrame.snippet ? topAppFrame.snippet : null;
  const smartSolution = generateSmartSolution(err, topAppFrame);

  const method = req ? (req.method || 'GET').toUpperCase() : '';
  const url = req ? (req.url || '/') : '';
  const headers = req ? (req.headers || {}) : {};
  const query = req && req.query ? req.query : {};
  const body = req && req.body ? req.body : {};
  const params = req && req.params ? req.params : {};
  const ip = req && typeof req.ip === 'function' ? req.ip() : (req && req.ip) || '127.0.0.1';

  const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB';
  const nodeVersion = process.version;
  const somVersion = require('../../package.json').version;

  const framesJson = JSON.stringify(frames.map((f, i) => ({
    id: i,
    fn: f.fn || '<anonymous>',
    file: f.file || f.raw || '',
    line: f.line || 0,
    col: f.col || 0,
    isApp: Boolean(f.isApp),
    snippet: f.snippet || null,
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(errName)}: ${escapeHtml(errMessage)}</title>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    :root {
      --bg: #ffffff;
      --surface: #f8fafc;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --accent-red: #ef4444;
      --accent-red-subtle: #fee2e2;
      --solution-bg: #a7f3d0;
      --solution-border: #6ee7b7;
      --solution-text: #064e3b;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    /* Top Bar */
    .nav-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      border-bottom: 2px solid var(--accent-red);
      padding: 0 24px;
      height: 50px;
    }
    .tabs-group {
      display: flex;
      height: 100%;
      gap: 4px;
    }
    .tab-item {
      background: none;
      border: none;
      color: var(--text-muted);
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.05em;
      padding: 0 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      position: relative;
    }
    .tab-item:hover {
      color: var(--text);
    }
    .tab-item.active {
      color: var(--accent-red);
      border-bottom: 2px solid var(--accent-red);
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn-nav {
      background: none;
      border: none;
      color: var(--text-muted);
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      text-decoration: none;
    }
    .btn-copy-main {
      background: #0f172a;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .status-badge {
      background: var(--accent-red);
      color: #ffffff;
      font-weight: 800;
      font-size: 12px;
      padding: 4px 8px;
      font-family: var(--font-mono);
    }
    /* Hero Section */
    .hero-container {
      background: #ffffff;
      border-bottom: 1px solid var(--border);
      padding: 24px;
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 24px;
      align-items: start;
    }
    .hero-badges {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
    }
    .badge-error-type {
      background: var(--accent-red-subtle);
      color: #991b1b;
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: 12px;
      padding: 3px 8px;
    }
    .badge-runtime {
      color: var(--text-muted);
      font-size: 12px;
      font-family: var(--font-mono);
    }
    .hero-headline {
      font-size: 22px;
      font-weight: 800;
      color: var(--text);
      margin: 0;
      line-height: 1.3;
      word-break: break-word;
    }
    .solution-box {
      background: var(--solution-bg);
      border: 1px solid var(--solution-border);
      color: var(--solution-text);
      padding: 16px 20px;
      position: relative;
    }
    .solution-box-title {
      font-weight: 800;
      font-size: 13px;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .solution-box-close {
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      color: var(--solution-text);
    }
    .solution-box-body {
      font-size: 13px;
      line-height: 1.5;
    }
    .solution-box-body code {
      background: rgba(0,0,0,0.06);
      padding: 1px 4px;
      font-family: var(--font-mono);
      font-weight: 700;
    }
    /* Split Stack Layout */
    .split-stack {
      display: grid;
      grid-template-columns: 340px 1fr;
      height: calc(100vh - 165px);
      overflow: hidden;
    }
    .sidebar-frames {
      background: #ffffff;
      border-right: 1px solid var(--border);
      overflow-y: auto;
    }
    .frames-header {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    .btn-vendor-toggle {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      width: 100%;
    }
    .frame-row {
      padding: 12px 16px;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      transition: background 0.15s;
    }
    .frame-row:hover {
      background: var(--surface);
    }
    .frame-row.active {
      background: var(--accent-red) !important;
      color: #ffffff;
    }
    .frame-row.active .frame-loc,
    .frame-row.active .frame-name {
      color: #ffffff !important;
    }
    .frame-loc {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 2px;
      word-break: break-all;
    }
    .frame-name {
      font-weight: 700;
      font-size: 13px;
      color: #1e293b;
    }
    .frame-row.vendor {
      opacity: 0.55;
    }
    /* Right Code Inspector */
    .editor-pane {
      background: #ffffff;
      overflow-y: auto;
    }
    .editor-toolbar {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-muted);
    }
    .editor-file-title {
      font-weight: 700;
      color: #334155;
    }
    .editor-lines {
      padding: 16px 0;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.7;
    }
    .code-row {
      display: flex;
      padding: 1px 20px;
    }
    .code-row.target {
      background: var(--accent-red-subtle);
      border-left: 4px solid var(--accent-red);
      color: #991b1b;
      font-weight: 600;
    }
    .line-no {
      width: 48px;
      text-align: right;
      padding-right: 18px;
      color: #94a3b8;
      user-select: none;
      flex-shrink: 0;
    }
    .code-row.target .line-no {
      color: var(--accent-red);
      font-weight: 800;
    }
    .line-text {
      white-space: pre-wrap;
      word-break: break-all;
    }
    /* Tab Contents: Context & Share */
    .tab-view {
      display: none;
      padding: 32px 24px;
      max-width: 1100px;
      margin: 0 auto;
    }
    .tab-view.active {
      display: block;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .card-box {
      background: #ffffff;
      border: 1px solid var(--border);
      padding: 20px;
    }
    .card-box h3 {
      margin: 0 0 16px;
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .data-table th, .data-table td {
      border: 1px solid var(--border);
      padding: 8px 12px;
      text-align: left;
    }
    .data-table th {
      background: var(--surface);
      color: var(--text-muted);
      width: 180px;
      font-family: var(--font-mono);
    }
    .json-code {
      background: #0f172a;
      color: #f8fafc;
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      overflow-x: auto;
    }
    @media (max-width: 900px) {
      .hero-container { grid-template-columns: 1fr; }
      .split-stack { grid-template-columns: 1fr; height: auto; }
      .cards-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <!-- Top Bar -->
  <header class="nav-bar">
    <div class="tabs-group">
      <button class="tab-item active" onclick="switchTab('tab-stack', this)">
        <span>☰</span> STACK
      </button>
      <button class="tab-item" onclick="switchTab('tab-context', this)">
        <span>⚏</span> CONTEXT
      </button>
      <button class="tab-item" onclick="switchTab('tab-share', this)">
        <span>↗</span> SHARE
      </button>
    </div>

    <div class="nav-actions">
      <a href="/docs" target="_blank" class="btn-nav">📖 DOCS</a>
      <button class="btn-copy-main" onclick="copyDiagnosticReport()">COPY REPORT</button>
      <span class="status-badge">${escapeHtml(status)}</span>
    </div>
  </header>

  <!-- Error Hero Section -->
  <section class="hero-container">
    <div>
      <div class="hero-badges">
        <span class="badge-error-type">${escapeHtml(errName)}</span>
        <span class="badge-runtime">Node.js ${escapeHtml(nodeVersion)}</span>
        <span class="badge-runtime">Som.js v${escapeHtml(somVersion)}</span>
      </div>
      <h1 class="hero-headline">${escapeHtml(errMessage)}</h1>
    </div>

    ${smartSolution ? `
    <div class="solution-box" id="solution-banner">
      <div class="solution-box-title">
        <span>💡 ${escapeHtml(smartSolution.title)}</span>
        <span class="solution-box-close" onclick="document.getElementById('solution-banner').style.display='none'">✕</span>
      </div>
      <div class="solution-box-body">${smartSolution.message}</div>
    </div>` : ''}
  </section>

  <!-- Tab 1: Split Stack View -->
  <section id="tab-stack" class="split-stack tab-view active" style="padding: 0; max-width: none;">
    <!-- Left Column: Frames List -->
    <aside class="sidebar-frames">
      <div class="frames-header">
        <button class="btn-vendor-toggle" id="vendor-toggle-btn" onclick="toggleVendorFrames()">
          Expand vendor frames (${frames.filter(f => !f.isApp).length})
        </button>
      </div>

      <div id="frames-container">
        ${frames.map((f, i) => `
        <div class="frame-row${f === topAppFrame ? ' active' : ''}${f.isApp ? ' app' : ' vendor'}"
             data-frame-index="${i}"
             onclick="selectFrame(${i})"
             style="${!f.isApp ? 'display: none;' : ''}">
          <div class="frame-loc">${escapeHtml(f.file || f.raw || '')}:${escapeHtml(f.line || 1)}</div>
          <div class="frame-name">${escapeHtml(f.fn || '<anonymous>')}</div>
        </div>`).join('')}
      </div>
    </aside>

    <!-- Right Column: Code Editor -->
    <main class="editor-pane">
      <div class="editor-toolbar">
        <span class="editor-file-title" id="editor-file-label">
          ${escapeHtml(topAppFrame ? topAppFrame.file + ':' + topAppFrame.line : 'Source Code')}
        </span>
        <span id="editor-lines-label">
          ${initialSnippet ? 'Lines ' + initialSnippet.start + ' - ' + initialSnippet.end : ''}
        </span>
      </div>

      <div class="editor-lines" id="editor-code-container">
        ${initialSnippet ? initialSnippet.lines.map(l => `
        <div class="code-row${l.isTarget ? ' target' : ''}">
          <span class="line-no">${l.num}</span>
          <span class="line-text">${escapeHtml(l.code)}</span>
        </div>`).join('') : '<p style="padding: 24px; color: var(--text-muted);">No source snippet available for this frame.</p>'}
      </div>
    </main>
  </section>

  <!-- Tab 2: Context View -->
  <section id="tab-context" class="tab-view">
    <div class="cards-grid">
      <div class="card-box">
        <h3>HTTP Request</h3>
        <table class="data-table">
          <tr><th>Method</th><td><strong style="color: var(--accent-red);">${escapeHtml(method || 'GET')}</strong></td></tr>
          <tr><th>URL</th><td>${escapeHtml(url || '/')}</td></tr>
          <tr><th>Client IP</th><td>${escapeHtml(ip)}</td></tr>
        </table>

        ${Object.keys(params).length ? `
        <h4 style="margin: 16px 0 8px; font-size: 12px; text-transform: uppercase;">Route Parameters</h4>
        <table class="data-table">
          ${Object.entries(params).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}
        </table>` : ''}

        ${Object.keys(query).length ? `
        <h4 style="margin: 16px 0 8px; font-size: 12px; text-transform: uppercase;">Query Parameters</h4>
        <table class="data-table">
          ${Object.entries(query).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}
        </table>` : ''}

        ${body && Object.keys(body).length ? `
        <h4 style="margin: 16px 0 8px; font-size: 12px; text-transform: uppercase;">Request Body</h4>
        <pre class="json-code">${escapeHtml(JSON.stringify(body, null, 2))}</pre>` : ''}
      </div>

      <div class="card-box">
        <h3>Headers & Environment</h3>
        <table class="data-table" style="margin-bottom: 20px;">
          <tr><th>Node.js Version</th><td>${escapeHtml(nodeVersion)}</td></tr>
          <tr><th>Som.js Version</th><td>${escapeHtml(somVersion)}</td></tr>
          <tr><th>Heap Memory</th><td>${escapeHtml(memory)}</td></tr>
          <tr><th>Host Environment</th><td>${escapeHtml(process.platform)} (${escapeHtml(process.arch)})</td></tr>
        </table>

        <h4 style="margin: 16px 0 8px; font-size: 12px; text-transform: uppercase;">HTTP Headers</h4>
        <table class="data-table">
          ${Object.entries(headers).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(Array.isArray(v) ? v.join(', ') : v)}</td></tr>`).join('')}
        </table>
      </div>
    </div>
  </section>

  <!-- Tab 3: Share View -->
  <section id="tab-share" class="tab-view">
    <div class="card-box">
      <h3>Export Diagnostic Report</h3>
      <p style="color: var(--text-muted); margin-bottom: 16px;">
        Generate an error report formatted for GitHub Issues, bug trackers, or sharing with teammates:
      </p>
      <pre class="json-code" id="markdown-preview-block">### Som.js Exception Report
**${escapeHtml(errName)}**: ${escapeHtml(errMessage)}
**Top Frame**: ${escapeHtml(topAppFrame ? topAppFrame.file + ':' + topAppFrame.line : 'unknown')}

\`\`\`text
${escapeHtml(stack)}
\`\`\`</pre>
      <div style="margin-top: 16px; display: flex; gap: 12px;">
        <button class="btn-copy-main" onclick="copyDiagnosticReport()">Copy Markdown Report</button>
        <button class="btn-vendor-toggle" style="width: auto;" onclick="copyJsonReport()">Copy JSON</button>
      </div>
    </div>
  </section>

  <script>
    const allFrames = ${framesJson};
    let vendorExpanded = false;

    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(v => {
        v.classList.remove('active');
        if (v.id === 'tab-stack') v.style.display = 'none';
      });
      btn.classList.add('active');
      const target = document.getElementById(tabId);
      target.classList.add('active');
      if (tabId === 'tab-stack') target.style.display = 'grid';
    }

    function toggleVendorFrames() {
      vendorExpanded = !vendorExpanded;
      document.querySelectorAll('.frame-row.vendor').forEach(el => {
        el.style.display = vendorExpanded ? 'block' : 'none';
      });
      document.getElementById('vendor-toggle-btn').textContent = vendorExpanded ? 'Collapse vendor frames ↑' : 'Expand vendor frames ↓';
    }

    function selectFrame(index) {
      document.querySelectorAll('.frame-row').forEach(r => r.classList.remove('active'));
      const activeRow = document.querySelector('[data-frame-index="' + index + '"]');
      if (activeRow) activeRow.classList.add('active');

      const f = allFrames[index];
      if (!f) return;

      document.getElementById('editor-file-label').textContent = (f.file || 'Unknown') + ':' + (f.line || 1);
      const container = document.getElementById('editor-code-container');

      if (f.snippet && f.snippet.lines) {
        document.getElementById('editor-lines-label').textContent = 'Lines ' + f.snippet.start + ' - ' + f.snippet.end;
        container.innerHTML = f.snippet.lines.map(l => {
          return '<div class="code-row' + (l.isTarget ? ' target' : '') + '">' +
                 '<span class="line-no">' + l.num + '</span>' +
                 '<span class="line-text">' + escapeHtmlText(l.code) + '</span>' +
                 '</div>';
        }).join('');
      } else {
        document.getElementById('editor-lines-label').textContent = '';
        container.innerHTML = '<p style="padding: 24px; color: var(--text-muted);">Source file not accessible or internal runtime frame.</p>';
      }
    }

    function escapeHtmlText(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function copyDiagnosticReport() {
      const text = document.getElementById('markdown-preview-block').textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.btn-copy-main');
        const orig = btn.textContent;
        btn.textContent = '✓ COPIED!';
        btn.style.background = '#15803d';
        setTimeout(() => { btn.textContent = orig; btn.style.background = '#0f172a'; }, 2000);
      });
    }

    function copyJsonReport() {
      const data = {
        name: ${JSON.stringify(errName)},
        message: ${JSON.stringify(errMessage)},
        status: ${status},
        frames: allFrames,
        timestamp: new Date().toISOString()
      };
      navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
        alert('Diagnostic JSON copied to clipboard!');
      });
    }
  </script>
</body>
</html>`;
}

module.exports = { renderErrorPage, parseStack, getCodeSnippet, generateSmartSolution };
