/*
 * Developer Error Details & Interactive Error Monitoring Page for Som.js
 * Renders Som.js's own high-precision geometric UI (matching ui.css tokens, dark/light mode,
 * 1px borders, monochrome active states, and dark terminal code preview).
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

  // 1. Method typo on models or objects
  const methodMatch = msg.match(/([a-zA-Z0-9_$]+)\.([a-zA-Z0-9_$]+) is not a function/i) || msg.match(/Call to undefined method ([^\s(:]+)(?:::|\.)([^\s(]+)/i);
  if (methodMatch) {
    const caller = methodMatch[1];
    const fnName = methodMatch[2] || caller;
    const commonMethods = ['query', 'find', 'where', 'get', 'first', 'create', 'update', 'delete', 'save', 'count', 'paginate', 'all', 'select'];
    const close = commonMethods.find(m => Math.abs(m.length - fnName.length) <= 2 && (fnName.includes(m) || m.includes(fnName) || levenshtein(m, fnName) <= 2));
    if (close) {
      return {
        title: 'Unknown Model Method',
        message: `Did you mean <code>${escapeHtml(caller ? caller + '.' + close + '()' : '.' + close + '()')}</code>?`
      };
    }
  }

  // 2. Reading property of undefined/null
  const undefMatch = msg.match(/Cannot read propert(?:y|ies) of (undefined|null) \(reading '([^']+)'\)/i);
  if (undefMatch) {
    const prop = undefMatch[2];
    return {
      title: 'Null Reference Guard',
      message: `The target object is <code>${undefMatch[1]}</code> when reading <code>.${escapeHtml(prop)}</code>. Use optional chaining <code>?.${escapeHtml(prop)}</code> or verify the record exists.`
    };
  }

  // 3. Variable not defined
  const refMatch = msg.match(/([a-zA-Z0-9_$]+) is not defined/i);
  if (refMatch) {
    const varName = refMatch[1];
    return {
      title: 'Undefined Identifier',
      message: `Identifier <code>${escapeHtml(varName)}</code> is referenced but not declared. Check your imports or action arguments.`
    };
  }

  // 4. Missing Database Table
  if (msg.includes('no such table') || msg.includes('does not exist')) {
    return {
      title: 'Pending Database Migration',
      message: `The queried table does not exist yet. Run <code>som db:migrate</code> to apply pending migrations.`
    };
  }

  // 5. Default contextual suggestion
  if (topFrame && topFrame.file) {
    return {
      title: 'Diagnostic Hint',
      message: `Inspect line <strong>${topFrame.line}</strong> in <code>${escapeHtml(path.basename(topFrame.file))}</code> and verify input values.`
    };
  }

  return {
    title: 'Diagnostic Hint',
    message: 'Select any stack frame below to inspect the source lines around the exception.'
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

const SENSITIVE_KEY_RE = /(password|passwd|secret|token|api_key|apikey|private_key|recovery_code|authorization|cookie|set-cookie|xsrf|csrf|challenge|credit_card|cvv)/i;

function redactSensitive(obj, depth = 0) {
  if (depth > 6 || obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => redactSensitive(item, depth + 1));
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '******** [REDACTED]';
    } else if (v && typeof v === 'object') {
      out[k] = redactSensitive(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function renderErrorPage(err, req = null, { status = 500 } = {}) {
  const errName = err && err.name ? err.name : 'Error';
  const errMessage = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? err.stack : '';
  const frames = parseStack(stack);

  for (const f of frames) {
    if (f.file && f.line) {
      f.snippet = getCodeSnippet(f.file, f.line);
    }
  }

  const topAppFrame = frames.find((f) => f.isApp && f.file) || frames.find((f) => f.file) || null;
  const initialSnippet = topAppFrame && topAppFrame.snippet ? topAppFrame.snippet : null;
  const smartSolution = generateSmartSolution(err, topAppFrame);

  const method = req ? (req.method || 'GET').toUpperCase() : 'GET';
  const url = req ? (req.url || '/') : '/';
  const headers = redactSensitive(req ? (req.headers || {}) : {});
  const query = redactSensitive(req && req.query ? req.query : {});
  const body = redactSensitive(req && req.body ? req.body : {});
  const params = redactSensitive(req && req.params ? req.params : {});
  const ip = req && typeof req.ip === 'function' ? req.ip() : (req && req.ip) || '127.0.0.1';

  const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB';
  const nodeVersion = process.version;
  const somVersion = require('../../package.json').version;
  const internalCount = frames.filter((f) => !f.isApp).length;

  const safeJson = (val) => JSON.stringify(val).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
  const framesJson = safeJson(frames.map((f, i) => ({
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
  <title>${escapeHtml(errName)} — Som.js Diagnostic</title>
  <style>
    :root {
      color-scheme: light dark;
      --background: #ffffff;
      --foreground: #09090b;
      --card: #ffffff;
      --border: #e4e4e7;
      --accent: #f4f4f5;
      --primary: #09090b;
      --primary-foreground: #fafafa;
      --muted: #71717a;
      --destructive: #dc2626;
      --success: #10b981;
      --success-bg: #ecfdf5;
      --terminal-bg: #09090b;
      --terminal-fg: #f4f4f5;
      --grid-line: rgba(0, 0, 0, 0.04);
      --font: 'Geist', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --background: #09090b;
        --foreground: #f4f4f5;
        --card: #111115;
        --border: #27272a;
        --accent: #18181b;
        --primary: #f4f4f5;
        --primary-foreground: #09090b;
        --muted: #a1a1aa;
        --destructive: #ef4444;
        --success: #10b981;
        --success-bg: #064e3b;
        --terminal-bg: #050507;
        --terminal-fg: #f4f4f5;
        --grid-line: rgba(255, 255, 255, 0.04);
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
      border-radius: 0;
      box-shadow: none;
    }
    body {
      margin: 0;
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.6;
      background-color: var(--background);
      background-image:
        linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
        linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
      background-size: 32px 32px;
      color: var(--foreground);
      -webkit-font-smoothing: antialiased;
    }
    .shell {
      max-width: 1120px;
      margin: 0 auto;
      padding: 32px 24px 64px;
      display: grid;
      gap: 16px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      padding: 24px;
    }
    .head-card {
      border-inline-start: 3px solid var(--destructive);
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .badges, .actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      height: 24px;
      padding: 0 10px;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      border: 1px solid var(--border);
      background: var(--background);
      color: var(--foreground);
    }
    .badge.danger {
      background: var(--destructive);
      border-color: var(--destructive);
      color: #ffffff;
    }
    .badge.solid {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--primary-foreground);
    }
    .badge.success {
      background: var(--success-bg);
      border-color: var(--success);
      color: var(--success);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 30px;
      padding: 0 12px;
      font-family: var(--font);
      font-size: 12px;
      font-weight: 600;
      color: var(--foreground);
      background: var(--background);
      border: 1px solid var(--border);
      cursor: pointer;
      text-decoration: none;
    }
    .btn:hover {
      background: var(--accent);
      border-color: var(--foreground);
    }
    .btn.primary {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--primary-foreground);
    }
    .err-msg {
      font-family: var(--mono);
      font-size: 20px;
      line-height: 1.35;
      margin: 0 0 8px;
      word-break: break-word;
    }
    .err-loc {
      margin: 0;
      font-size: 13px;
      color: var(--muted);
    }
    code {
      font-family: var(--mono);
      font-size: 0.88em;
      background: var(--accent);
      border: 1px solid var(--border);
      padding: 2px 6px;
    }
    .hint-box {
      border: 1px solid var(--border);
      background: var(--accent);
      padding: 14px 16px;
      margin-top: 16px;
    }
    .hint-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .hint-body {
      margin: 0;
      font-size: 13px;
      font-family: var(--mono);
    }
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      gap: 4px;
    }
    .tab-btn {
      border: 0;
      border-bottom: 2px solid transparent;
      background: none;
      color: var(--muted);
      height: 36px;
      padding: 0 14px;
      font-family: var(--font);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .tab-btn:hover {
      color: var(--foreground);
      background: var(--accent);
    }
    .tab-btn.active {
      color: var(--foreground);
      border-bottom-color: var(--foreground);
    }
    .workbench {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      border: 1px solid var(--border);
      background: var(--card);
    }
    .frame-pane {
      border-inline-end: 1px solid var(--border);
      display: flex;
      flex-direction: column;
    }
    .pane-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 14px;
      border-bottom: 1px solid var(--border);
      background: var(--accent);
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      min-height: 40px;
    }
    .frame-list {
      display: flex;
      flex-direction: column;
      max-height: 460px;
      overflow-y: auto;
    }
    .frame-row {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      border-inline-start: 3px solid transparent;
      cursor: pointer;
    }
    .frame-row:hover {
      background: var(--accent);
    }
    .frame-row.active {
      background: var(--accent);
      border-inline-start-color: var(--foreground);
    }
    .frame-row.vendor {
      opacity: 0.6;
    }
    .frame-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 3px;
    }
    .frame-name {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 600;
      color: var(--foreground);
    }
    .frame-tag {
      font-family: var(--mono);
      font-size: 10px;
      text-transform: uppercase;
      padding: 1px 5px;
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .frame-loc {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--muted);
      word-break: break-all;
    }
    .source-pane {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .terminal-code {
      background: var(--terminal-bg);
      color: var(--terminal-fg);
      padding: 14px 0;
      font-family: var(--mono);
      font-size: 13px;
      line-height: 1.7;
      overflow-x: auto;
      flex: 1;
    }
    .code-row {
      display: flex;
      padding: 1px 16px;
      border-inline-start: 3px solid transparent;
    }
    .code-row.target {
      background: rgba(239, 68, 68, 0.18);
      border-inline-start-color: var(--destructive);
      color: #ffffff;
      font-weight: 600;
    }
    .line-no {
      width: 44px;
      text-align: end;
      padding-inline-end: 16px;
      color: #71717a;
      user-select: none;
      flex-shrink: 0;
    }
    .code-row.target .line-no {
      color: var(--destructive);
      font-weight: 700;
    }
    .line-text {
      white-space: pre;
    }
    .tab-view {
      display: none;
    }
    .tab-view.active {
      display: block;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      border: 1px solid var(--border);
    }
    th, td {
      text-align: start;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
    }
    th {
      width: 160px;
      font-family: var(--mono);
      font-size: 11px;
      text-transform: uppercase;
      color: var(--muted);
      background: var(--accent);
    }
    pre.json-code {
      font-family: var(--mono);
      background: var(--terminal-bg);
      color: var(--terminal-fg);
      border: 1px solid var(--border);
      padding: 16px;
      font-size: 12px;
      overflow-x: auto;
      margin: 0;
    }
    @media (max-width: 820px) {
      .workbench, .cards-grid { grid-template-columns: minmax(0, 1fr); }
      .frame-pane { border-inline-end: 0; border-bottom: 1px solid var(--border); }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="card head-card">
      <div class="top-bar">
        <div class="badges">
          <span class="badge danger">HTTP ${escapeHtml(status)}</span>
          <span class="badge solid">${escapeHtml(errName)}</span>
          <span class="badge">Som.js v${escapeHtml(somVersion)}</span>
          <span class="badge">Node ${escapeHtml(nodeVersion)}</span>
        </div>
        <div class="actions">
          <button class="btn" id="copy-report-btn" onclick="copyDiagnosticReport()">Copy Report</button>
          <a href="/docs" class="btn">Docs</a>
        </div>
      </div>

      <h1 class="err-msg">${escapeHtml(errMessage)}</h1>
      ${topAppFrame ? `<p class="err-loc">in <code>${escapeHtml(topAppFrame.file)}:${escapeHtml(topAppFrame.line)}</code> · ${escapeHtml(topAppFrame.fn || '<anonymous>')}</p>` : ''}

      ${smartSolution ? `
      <div class="hint-box">
        <div class="hint-head">
          <span class="badge success">Fix Suggestion</span>
          <strong>${escapeHtml(smartSolution.title)}</strong>
        </div>
        <p class="hint-body">${smartSolution.message}</p>
      </div>` : ''}
    </section>

    <div class="tabs" role="tablist">
      <button class="tab-btn active" onclick="switchTab('tab-stack', this)">Stack Trace (${frames.length})</button>
      <button class="tab-btn" onclick="switchTab('tab-context', this)">Request &amp; Runtime</button>
      <button class="tab-btn" onclick="switchTab('tab-share', this)">Markdown Report</button>
    </div>

    <section id="tab-stack" class="workbench tab-view active" style="display: grid;">
      <aside class="frame-pane">
        <div class="pane-bar">
          <span>Frames</span>
          ${internalCount > 0 ? `<button class="btn" id="vendor-toggle-btn" style="height:24px;padding:0 8px;font-size:11px;" onclick="toggleVendorFrames()">Show internal (${internalCount})</button>` : ''}
        </div>
        <div class="frame-list" id="frames-container">
          ${frames.map((f, i) => `
          <div class="frame-row${f === topAppFrame ? ' active' : ''}${f.isApp ? ' app' : ' vendor'}"
               data-frame-index="${i}"
               onclick="selectFrame(${i})"
               style="${!f.isApp ? 'display: none;' : ''}">
            <div class="frame-top">
              <span class="frame-name">${escapeHtml(f.fn || '<anonymous>')}</span>
              <span class="frame-tag">${f.isApp ? 'app' : 'core'}</span>
            </div>
            <div class="frame-loc">${escapeHtml(f.file || f.raw || '')}:${escapeHtml(f.line || 1)}</div>
          </div>`).join('')}
        </div>
      </aside>

      <main class="source-pane">
        <div class="pane-bar">
          <code id="editor-file-label">${escapeHtml(topAppFrame ? topAppFrame.file + ':' + topAppFrame.line : 'source.js')}</code>
          <span id="editor-lines-label">${initialSnippet ? 'Lines ' + initialSnippet.start + '–' + initialSnippet.end : ''}</span>
        </div>
        <div class="terminal-code" id="editor-code-container">
          ${initialSnippet ? initialSnippet.lines.map(l => `
          <div class="code-row${l.isTarget ? ' target' : ''}">
            <span class="line-no">${l.num}</span>
            <span class="line-text">${escapeHtml(l.code)}</span>
          </div>`).join('') : '<p style="padding: 16px; color: #a1a1aa;">No source snippet available for this frame.</p>'}
        </div>
      </main>
    </section>

    <section id="tab-context" class="tab-view">
      <div class="cards-grid">
        <div class="card">
          <h3 style="margin-top:0;">HTTP Request</h3>
          <table>
            <tr><th>Method</th><td><code>${escapeHtml(method)}</code></td></tr>
            <tr><th>URL</th><td><code>${escapeHtml(url)}</code></td></tr>
            <tr><th>Client IP</th><td><code>${escapeHtml(ip)}</code></td></tr>
          </table>
          ${Object.keys(params).length ? `
          <h4 style="margin: 16px 0 8px;">Route Parameters</h4>
          <table>
            ${Object.entries(params).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}
          </table>` : ''}
          ${Object.keys(query).length ? `
          <h4 style="margin: 16px 0 8px;">Query Parameters</h4>
          <table>
            ${Object.entries(query).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}
          </table>` : ''}
          ${body && Object.keys(body).length ? `
          <h4 style="margin: 16px 0 8px;">Request Body</h4>
          <pre class="json-code">${escapeHtml(JSON.stringify(body, null, 2))}</pre>` : ''}
        </div>

        <div class="card">
          <h3 style="margin-top:0;">Som.js Runtime &amp; Headers</h3>
          <table style="margin-bottom: 16px;">
            <tr><th>Som.js</th><td><code>v${escapeHtml(somVersion)}</code></td></tr>
            <tr><th>Node.js</th><td><code>${escapeHtml(nodeVersion)}</code></td></tr>
            <tr><th>Heap Memory</th><td><code>${escapeHtml(memory)}</code></td></tr>
            <tr><th>Platform</th><td><code>${escapeHtml(process.platform)} (${escapeHtml(process.arch)})</code></td></tr>
          </table>
          <h4 style="margin: 16px 0 8px;">Headers</h4>
          <table>
            ${Object.entries(headers).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(Array.isArray(v) ? v.join(', ') : v)}</td></tr>`).join('')}
          </table>
        </div>
      </div>
    </section>

    <section id="tab-share" class="tab-view">
      <div class="card">
        <div class="top-bar">
          <h3 style="margin:0;">Diagnostic Markdown Report</h3>
          <div class="actions">
            <button class="btn primary" onclick="copyDiagnosticReport()">Copy Markdown</button>
            <button class="btn" onclick="copyJsonReport()">Copy JSON</button>
          </div>
        </div>
        <pre class="json-code" id="markdown-preview-block"># Som.js Diagnostic Report
- **Exception:** \`${escapeHtml(errName)}\` (HTTP ${escapeHtml(status)})
- **Message:** ${escapeHtml(errMessage)}
- **Location:** \`${escapeHtml(topAppFrame ? topAppFrame.file + ':' + topAppFrame.line : 'unknown')}\`

\`\`\`text
${escapeHtml(stack)}
\`\`\`</pre>
      </div>
    </section>
  </div>

  <script>
    const allFrames = ${framesJson};
    let vendorExpanded = false;

    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
      });
      btn.classList.add('active');
      const target = document.getElementById(tabId);
      target.classList.add('active');
      target.style.display = tabId === 'tab-stack' ? 'grid' : 'block';
    }

    function toggleVendorFrames() {
      vendorExpanded = !vendorExpanded;
      document.querySelectorAll('.frame-row.vendor').forEach(el => {
        el.style.display = vendorExpanded ? 'block' : 'none';
      });
      const btn = document.getElementById('vendor-toggle-btn');
      if (btn) btn.textContent = (vendorExpanded ? 'Hide internal' : 'Show internal') + ' (${internalCount})';
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
        document.getElementById('editor-lines-label').textContent = 'Lines ' + f.snippet.start + '–' + f.snippet.end;
        container.innerHTML = f.snippet.lines.map(l => {
          return '<div class="code-row' + (l.isTarget ? ' target' : '') + '">' +
                 '<span class="line-no">' + l.num + '</span>' +
                 '<span class="line-text">' + escapeHtmlText(l.code) + '</span>' +
                 '</div>';
        }).join('');
      } else {
        document.getElementById('editor-lines-label').textContent = '';
        container.innerHTML = '<p style="padding: 16px; color: #a1a1aa;">Source file not accessible or internal runtime frame.</p>';
      }
    }

    function escapeHtmlText(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function copyDiagnosticReport() {
      const text = document.getElementById('markdown-preview-block').textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-report-btn');
        if (!btn) return;
        const orig = btn.textContent;
        btn.textContent = 'Copied Markdown';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      });
    }

    function copyJsonReport() {
      const data = {
        name: ${safeJson(errName)},
        message: ${safeJson(errMessage)},
        status: ${Number(status) || 500},
        frames: allFrames,
        timestamp: new Date().toISOString()
      };
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    }
  </script>
</body>
</html>`;
}

module.exports = { renderErrorPage, parseStack, getCodeSnippet, generateSmartSolution };
